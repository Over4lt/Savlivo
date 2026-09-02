import http from "node:http";
import { URL } from "node:url";
import { ensureMainlandChinaServices, ensureSubscriptionMarketSchema, healthcheckDb } from "./db.js";
import { createToken, getAuthUser } from "./auth.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import {
  addSubscription,
  confirmAction,
  completeProviderActionResult,
  createActionRecord,
  createUser,
  findUserByEmail,
  getEntitlement,
  getSavingsSummary,
  getSubscription,
  listActions,
  listSavingsEvents,
  listSubscriptions,
  deleteSubscription,
  updateSubscription,
  updateSubscriptionStatus,
  updateUserTimezone
} from "./repositories.js";
import { previewAction } from "./domain.js";
import type { ActionType } from "../../../packages/contracts/src/index.js";
import { storeVerifier, planForProduct } from "./billing.js";
import { applyVerifiedPurchase } from "./repositories-billing.js";
import { getProviderRoute } from "./provider-routing.js";
import {
  getRegionalPricing,
  refreshVerifiedPricingCountries
} from "./pricing.js";
import { dispatchDueNotifications, registerPushToken, setNotificationPreferences } from "./notifications.js";
import { reconcileSavingsEvents } from "./savings.js";
import { askAssistant } from "./assistant.js";
import {
  receiveAudioUpload,
  transcribeAudio
} from "./assistant-voice.js";

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function unauthorized(res: http.ServerResponse, error = "UNAUTHORIZED") {
  return send(res, 401, { error });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url ?? "/", "http://localhost");

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      const db = await healthcheckDb();
      return send(res, 200, { ok: true, service: "savlivo-api", db });
    }

    if (req.method === "POST" && url.pathname === "/v1/auth/register") {
      const body = await readJson(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");

      if (!email.includes("@") || password.length < 8) {
        return send(res, 400, { error: "INVALID_EMAIL_OR_PASSWORD" });
      }

      try {
        const user = await createUser(email, hashPassword(password));
        return send(res, 201, {
          user: { id: user.id, email: user.email },
          token: createToken({ id: user.id, email: user.email })
        });
      } catch (err: any) {
        if (err?.code === "23505") {
          return send(res, 409, { error: "EMAIL_EXISTS" });
        }
        throw err;
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/auth/login") {
      const body = await readJson(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const user = await findUserByEmail(email);

      if (!user || !verifyPassword(password, user.password_hash)) {
        return unauthorized(res, "INVALID_CREDENTIALS");
      }

      return send(res, 200, {
        user: { id: user.id, email: user.email },
        token: createToken({ id: user.id, email: user.email })
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/pricing") {
      const country = String(url.searchParams.get("country") ?? "US").toUpperCase();
      const refresh = url.searchParams.get("refresh") === "1";
      const pricing = await getRegionalPricing(country, { forceRefresh: refresh });
      return send(res, 200, pricing);
    }

    let auth;
    try {
      auth = getAuthUser(req);
    } catch {
      return unauthorized(res);
    }

    if (req.method === "POST" && url.pathname === "/v1/billing/verify") {
      const body = await readJson(req);
      const verified = await storeVerifier.verify({
        platform: body.platform,
        productId: body.productId,
        purchaseToken: body.purchaseToken,
        transactionId: body.transactionId,
        signedTransaction: body.signedTransaction
      });

      if (!verified.valid) {
        return send(res, 400, { error: "PURCHASE_NOT_VALID" });
      }

      const plan = planForProduct(verified.productId);
      await applyVerifiedPurchase({
        userId: auth.id,
        platform: verified.platform,
        productId: verified.productId,
        externalTransactionId: verified.externalTransactionId,
        expiresAt: verified.expiresAt,
        plan
      });

      return send(res, 200, {
        ok: true,
        plan,
        expiresAt: verified.expiresAt
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/me") {
      const plan = await getEntitlement(auth.id);
      return send(res, 200, { user: auth, plan });
    }


    if (req.method === "PATCH" && url.pathname === "/v1/me") {
      const body = await readJson(req);
      const timezone =
        typeof body.timezone === "string"
          ? body.timezone.trim()
          : "";

      if (!timezone) {
        return send(res, 400, {
          error: "INVALID_TIMEZONE"
        });
      }

      try {
        const user = await updateUserTimezone(
          auth.id,
          timezone
        );

        const plan = await getEntitlement(auth.id);

        return send(res, 200, {
          user,
          plan
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "UNKNOWN_ERROR";

        if (message === "INVALID_TIMEZONE") {
          return send(res, 400, {
            error: message
          });
        }

        throw err;
      }
    }

    if (req.method === "POST" && url.pathname === "/v1/notifications/push-token") {
      const body = await readJson(req);
      await registerPushToken(auth.id, String(body.token ?? ""), body.platform ? String(body.platform) : undefined);
      return send(res, 201, { ok: true });
    }

    if (req.method === "PATCH" && url.pathname === "/v1/notifications/preferences") {
      const body = await readJson(req);
      await setNotificationPreferences(auth.id, {
        renewalReminders: typeof body.renewalReminders === "boolean" ? body.renewalReminders : undefined,
        savingsOpportunities: typeof body.savingsOpportunities === "boolean" ? body.savingsOpportunities : undefined,
        emailEnabled: typeof body.emailEnabled === "boolean" ? body.emailEnabled : undefined
      });
      return send(res, 200, { ok: true });
    }


    if (
      req.method === "POST" &&
      url.pathname === "/v1/assistant/transcribe"
    ) {
      try {
        const upload =
          await receiveAudioUpload(
            req
          );

        const result =
          await transcribeAudio(
            upload
          );

        if (!result.text) {
          return send(
            res,
            422,
            {
              error:
                "EMPTY_TRANSCRIPTION"
            }
          );
        }

        return send(
          res,
          200,
          result
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "VOICE_ERROR";

        console.error(
          "assistant transcription failed",
          err
        );

        if (
          message ===
          "GROQ_API_KEY_MISSING"
        ) {
          return send(
            res,
            503,
            {
              error:
                "ASSISTANT_NOT_CONFIGURED"
            }
          );
        }

        if (
          message ===
          "AUDIO_FILE_TOO_LARGE"
        ) {
          return send(
            res,
            413,
            {
              error: message
            }
          );
        }

        return send(
          res,
          502,
          {
            error:
              "TRANSCRIPTION_UNAVAILABLE"
          }
        );
      }
    }

    if (
      req.method === "POST" &&
      url.pathname === "/v1/assistant/chat"
    ) {
      const body =
        await readJson(req);

      const message =
        typeof body.message === "string"
          ? body.message.trim()
          : "";

      if (!message) {
        return send(res, 400, {
          error: "INVALID_ASSISTANT_MESSAGE"
        });
      }

      try {
        const subscriptions =
          await listSubscriptions(
            auth.id
          );

        const plan =
          await getEntitlement(
            auth.id
          );

        const result =
          await askAssistant({
            message,

            history:
              Array.isArray(body.history)
                ? body.history
                : [],

            languageHint:
              typeof body.languageHint ===
              "string"
                ? body.languageHint
                : undefined,

            context: {
              plan,

              countryCode:
                typeof body.context?.countryCode ===
                "string"
                  ? body.context.countryCode
                  : undefined,

              countryName:
                typeof body.context?.countryName ===
                "string"
                  ? body.context.countryName
                  : undefined,

              currency:
                typeof body.context?.currency ===
                "string"
                  ? body.context.currency
                  : undefined,

              currentMonthlySpendMinor:
                Number.isFinite(
                  body.context
                    ?.currentMonthlySpendMinor
                )
                  ? Number(
                      body.context
                        .currentMonthlySpendMinor
                    )
                  : undefined,

              currentAnnualSpendMinor:
                Number.isFinite(
                  body.context
                    ?.currentAnnualSpendMinor
                )
                  ? Number(
                      body.context
                        .currentAnnualSpendMinor
                    )
                  : undefined,

              currentMonthlySavingsMinor:
                Number.isFinite(
                  body.context
                    ?.currentMonthlySavingsMinor
                )
                  ? Number(
                      body.context
                        .currentMonthlySavingsMinor
                    )
                  : undefined,

              savedSoFarMinor:
                Number.isFinite(
                  body.context
                    ?.savedSoFarMinor
                )
                  ? Number(
                      body.context
                        .savedSoFarMinor
                    )
                  : undefined,

              subscriptions:
                subscriptions.map(
                  (item: any) => ({
                    id: item.id,
                    serviceName:
                      item.serviceName,
                    serviceSlug:
                      item.serviceSlug,
                    billingProviderSlug:
                      item.billingProviderSlug,
                    status:
                      item.status,
                    statusEffectiveDate:
                      item.statusEffectiveDate,
                    monthlyPriceMinor:
                      item.monthlyPriceMinor,
                    currency:
                      item.currency,
                    renewalDate:
                      item.renewalDate,
                    planName:
                      item.planName
                  })
                )
            }
          });

        return send(
          res,
          200,
          result
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "ASSISTANT_ERROR";

        if (
          message ===
          "GROQ_API_KEY_MISSING"
        ) {
          return send(res, 503, {
            error:
              "ASSISTANT_NOT_CONFIGURED"
          });
        }

        console.error(
          "assistant request failed",
          err
        );

        return send(res, 502, {
          error:
            "ASSISTANT_UNAVAILABLE"
        });
      }
    }

    if (req.method === "GET" && url.pathname === "/v1/subscriptions") {
      return send(res, 200, { items: await listSubscriptions(auth.id) });
    }

    if (req.method === "POST" && url.pathname === "/v1/subscriptions") {
      const body = await readJson(req);

      try {
        const requestCurrency = body.currency
          ? String(body.currency).trim().toUpperCase()
          : undefined;
        const requestedCountryCode = body.countryCode
          ? String(body.countryCode).trim().toUpperCase()
          : "";
        const inferredCountryCode = requestCurrency
          ? ({
              USD: "US",
              NOK: "NO",
              SEK: "SE",
              DKK: "DK",
              CNY: "CN"
            } as Record<string, string>)[requestCurrency]
          : undefined;
        const countryCode = /^[A-Z]{2}$/.test(requestedCountryCode)
          ? requestedCountryCode
          : inferredCountryCode;

        const created = await addSubscription({
          userId: auth.id,
          serviceSlug: String(body.serviceSlug ?? ""),
          billingProviderSlug: String(body.billingProviderSlug ?? ""),
          countryCode,
          monthlyPriceMinor:
            body.monthlyPriceMinor == null
              ? undefined
              : Number(body.monthlyPriceMinor),
          currency: requestCurrency,
          renewalDate:
            body.renewalDate
              ? String(body.renewalDate)
              : undefined,
          planName:
            body.planName
              ? String(body.planName)
              : undefined
        });

        return send(res, 201, created);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "UNKNOWN_ERROR";

        if (
          message ===
          "UNKNOWN_SERVICE_OR_BILLING_PROVIDER"
        ) {
          return send(res, 400, {
            error: message
          });
        }

        throw err;
      }
    }

    const subscriptionMatch = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (req.method === "PATCH" && subscriptionMatch) {
      const body = await readJson(req);

      try {
        const updated = await updateSubscription({
          userId: auth.id,
          subscriptionId: subscriptionMatch[1],
          serviceSlug: String(body.serviceSlug ?? ""),
          billingProviderSlug: String(body.billingProviderSlug ?? ""),
          monthlyPriceMinor:
            body.monthlyPriceMinor == null ? undefined : Number(body.monthlyPriceMinor),
          currency: body.currency ? String(body.currency) : undefined,
          renewalDate: body.renewalDate ? String(body.renewalDate) : undefined,
          planName: body.planName ? String(body.planName) : undefined
        });

        return send(res, 200, updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
        if (message === "SUBSCRIPTION_NOT_FOUND_OR_INVALID_ROUTE") {
          return send(res, 404, { error: message });
        }
        throw err;
      }
    }

    if (req.method === "DELETE" && subscriptionMatch) {
      const deleted = await deleteSubscription(
        auth.id,
        subscriptionMatch[1]
      );

      if (!deleted) {
        return send(res, 404, {
          error: "SUBSCRIPTION_NOT_FOUND"
        });
      }

      return send(res, 200, {
        deleted: true,
        id: subscriptionMatch[1]
      });
    }

    const statusMatch = url.pathname.match(
      /^\/v1\/subscriptions\/([^/]+)\/status$/
    );

    if (req.method === "PATCH" && statusMatch) {
      const body = await readJson(req);

      const status = String(body.status ?? "");

      if (
        status !== "ACTIVE" &&
        status !== "PAUSED" &&
        status !== "CANCELLED"
      ) {
        return send(res, 400, {
          error: "INVALID_SUBSCRIPTION_STATUS"
        });
      }

      try {
        const updated = await updateSubscriptionStatus({
          userId: auth.id,
          subscriptionId: statusMatch[1],
          status,
          effectiveDate:
            body.effectiveDate
              ? String(body.effectiveDate)
              : undefined
        });

        return send(res, 200, updated);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "UNKNOWN_ERROR";

        if (message === "SUBSCRIPTION_NOT_FOUND") {
          return send(res, 404, {
            error: message
          });
        }

        throw err;
      }
    }

    const routeMatch = url.pathname.match(
      /^\/v1\/subscriptions\/([^/]+)\/provider-route$/
    );
    if (req.method === "GET" && routeMatch) {
      const subscription = await getSubscription(auth.id, routeMatch[1]);
      if (!subscription) {
        return send(res, 404, { error: "SUBSCRIPTION_NOT_FOUND" });
      }
      return send(res, 200, getProviderRoute(subscription.billingProviderSlug));
    }

    const previewMatch = url.pathname.match(
      /^\/v1\/subscriptions\/([^/]+)\/actions\/preview$/
    );
    if (req.method === "POST" && previewMatch) {
      const subscription = await getSubscription(auth.id, previewMatch[1]);
      if (!subscription) {
        return send(res, 404, { error: "SUBSCRIPTION_NOT_FOUND" });
      }

      const body = await readJson(req);
      const action = String(body.action ?? "") as ActionType;
      const plan = await getEntitlement(auth.id);

      const preview = await previewAction({
        ctx: {
          subscriptionId: subscription.id,
          serviceSlug: subscription.serviceSlug,
          billingProviderSlug: subscription.billingProviderSlug,
          planName: subscription.planName
        },
        plan,
        serviceName: subscription.serviceName,
        action
      });

      return send(res, 200, preview);
    }

    const actionMatch = url.pathname.match(
      /^\/v1\/subscriptions\/([^/]+)\/actions$/
    );
    if (req.method === "POST" && actionMatch) {
      const subscription = await getSubscription(auth.id, actionMatch[1]);
      if (!subscription) {
        return send(res, 404, { error: "SUBSCRIPTION_NOT_FOUND" });
      }

      const body = await readJson(req);
      const action = String(body.action ?? "") as ActionType;
      const plan = await getEntitlement(auth.id);

      const preview = await previewAction({
        ctx: {
          subscriptionId: subscription.id,
          serviceSlug: subscription.serviceSlug,
          billingProviderSlug: subscription.billingProviderSlug,
          planName: subscription.planName
        },
        plan,
        serviceName: subscription.serviceName,
        action
      });

      if (preview.execution === "UNSUPPORTED") {
        return send(res, 409, preview);
      }

      if (preview.premiumRequired) {
        return send(res, 402, preview);
      }

      const record = await createActionRecord({
        userId: auth.id,
        subscriptionId: subscription.id,
        action,
        execution: preview.execution,
        providerSlug: subscription.billingProviderSlug,
        requiresConfirmation: preview.requiresConfirmation,
        redirectUrl: preview.redirectUrl,
        explanation: preview.explanation
      });

      return send(res, 201, { action: record, preview });
    }

    const confirmMatch = url.pathname.match(/^\/v1\/actions\/([^/]+)\/confirm$/);
    if (req.method === "POST" && confirmMatch) {
      const action = await confirmAction(auth.id, confirmMatch[1]);
      if (!action) {
        return send(res, 404, {
          error: "ACTION_NOT_FOUND_OR_NOT_CONFIRMABLE"
        });
      }
      return send(res, 200, action);
    }

    const providerResultMatch =
      url.pathname.match(
        /^\/v1\/actions\/([^/]+)\/provider-result$/
      );

    if (req.method === "POST" && providerResultMatch) {
      const body = await readJson(req);

      const result = String(body.result ?? "");

      if (
        result !== "ACTIVE" &&
        result !== "PAUSED" &&
        result !== "CANCELLED" &&
        result !== "UNCHANGED"
      ) {
        return send(res, 400, {
          error: "INVALID_PROVIDER_RESULT"
        });
      }

      const completed =
        await completeProviderActionResult({
          userId: auth.id,
          actionId: providerResultMatch[1],
          result,
          effectiveDate:
            body.effectiveDate
              ? String(body.effectiveDate)
              : undefined
        });

      if (!completed) {
        return send(res, 404, {
          error: "ACTION_NOT_FOUND_OR_NOT_AWAITING_RESULT"
        });
      }

      return send(res, 200, completed);
    }

    if (
      req.method === "GET" &&
      url.pathname === "/v1/savings"
    ) {
      return send(res, 200, {
        items: await listSavingsEvents(auth.id),
        summary: await getSavingsSummary(auth.id)
      });
    }

    if (req.method === "GET" && url.pathname === "/v1/actions") {
      return send(res, 200, { items: await listActions(auth.id) });
    }

    return send(res, 404, { error: "NOT_FOUND" });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";

    if (message === "PAID_PLAN_REQUIRED") {
      return send(res, 402, { error: message });
    }

    return send(res, 500, { error: "INTERNAL_ERROR", detail: message });
  }
});

ensureSubscriptionMarketSchema()
  .then(() => {
    console.log("subscription market schema ensured");

    server.listen(Number(process.env.PORT ?? 3000), () => {
      console.log(`Savlivo API listening on http://localhost:${process.env.PORT ?? 3000}`);

      void ensureMainlandChinaServices()
        .then(() => console.log("mainland China service catalog ensured"))
        .catch((err) => console.error("mainland China service catalog ensure failed", err));

  const runBackgroundJobs = async () => {
    try {
      await reconcileSavingsEvents();
    } catch (err) {
      console.error(
        "savings reconciliation failed",
        err
      );
    }

    try {
      await dispatchDueNotifications();
    } catch (err) {
      console.error(
        "notification dispatch failed",
        err
      );
    }
  };

  void runBackgroundJobs();

  const runPricingVerification = async () => {
    try {
      const result =
        await refreshVerifiedPricingCountries();

      console.log(
        `pricing verification checked ${result.checked} countries; ` +
        `refreshed ${result.refreshed}; ` +
        `failed ${result.failed.length}`
      );
    } catch (err) {
      console.error(
        "pricing verification failed",
        err
      );
    }
  };

  // Verify official pricing once when the API starts.
  void runPricingVerification();

  // Re-check all verified pricing countries every 24 hours.
  const pricingVerificationTimer = setInterval(
    () => void runPricingVerification(),
    24 * 60 * 60 * 1000
  );

  if (
    typeof pricingVerificationTimer === "object" &&
    "unref" in pricingVerificationTimer
  ) {
    pricingVerificationTimer.unref();
  }

  const backgroundTimer = setInterval(
    () => void runBackgroundJobs(),
    15 * 60 * 1000
  );

  if (
    typeof backgroundTimer === "object" &&
    "unref" in backgroundTimer
  ) {
    backgroundTimer.unref();
  }
  });
  })
  .catch((err) => {
    console.error("subscription market schema ensure failed", err);
    process.exitCode = 1;
  });
