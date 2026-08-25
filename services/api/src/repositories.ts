import { pool } from "./db.js";
import type { SavlivoPlan, ActionType } from "../../../packages/contracts/src/index.js";

export async function createUser(email: string, passwordHash: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, country_code, currency, timezone, created_at`,
      [email.toLowerCase(), passwordHash]
    );
    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO entitlements (user_id, plan) VALUES ($1, 'VIEWER')`,
      [user.id]
    );

    await client.query("COMMIT");
    return user;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function findUserByEmail(email: string) {
  const result = await pool.query(
    `SELECT id, email, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  return result.rows[0] ?? null;
}


export async function updateUserTimezone(
  userId: string,
  timezone: string
) {
  const normalized = timezone.trim();

  if (!normalized) {
    throw new Error("INVALID_TIMEZONE");
  }

  const result = await pool.query(
    `UPDATE users
     SET timezone = $2,
         updated_at = now()
     WHERE id = $1
       AND EXISTS (
         SELECT 1
         FROM pg_timezone_names
         WHERE name = $2
       )
     RETURNING id, email, country_code, currency, timezone, created_at`,
    [userId, normalized]
  );

  if (!result.rows[0]) {
    throw new Error("INVALID_TIMEZONE");
  }

  return result.rows[0];
}

export async function getEntitlement(userId: string): Promise<SavlivoPlan> {
  const result = await pool.query(
    `SELECT plan FROM entitlements WHERE user_id = $1`,
    [userId]
  );
  return (result.rows[0]?.plan ?? "VIEWER") as SavlivoPlan;
}

export async function listSubscriptions(userId: string) {
  const result = await pool.query(
    `SELECT
       s.id,
       svc.slug AS "serviceSlug",
       svc.name AS "serviceName",
       bp.slug AS "billingProviderSlug",
       s.status,
       s.monthly_price_minor AS "monthlyPriceMinor",
       s.currency,
       CASE
         WHEN s.renewal_date IS NULL THEN NULL
         ELSE to_char(s.renewal_date::date, 'YYYY-MM-DD')
       END AS "renewalDate",
       s.plan_name AS "planName",
       to_char(
         s.status_effective_date::date,
         'YYYY-MM-DD'
       ) AS "statusEffectiveDate",

       COALESCE(
        (
          SELECT SUM(
            ROUND(
              s.monthly_price_minor *
              GREATEST(
                0,
                (
                  LEAST(
                    CURRENT_DATE,
                    COALESCE(
                      (
                        SELECT MIN(next_h.effective_date)
                        FROM subscription_status_history next_h
                        WHERE next_h.subscription_id = h.subscription_id
                          AND next_h.effective_date > h.effective_date
                          AND next_h.new_status = 'ACTIVE'
                      ),
                      CURRENT_DATE
                    )
                  ) - h.effective_date
                )
              )::numeric / 30.436875
            )
          )
          FROM subscription_status_history h
          WHERE h.subscription_id = s.id
            AND h.new_status IN ('PAUSED', 'CANCELLED')
            AND h.effective_date <= CURRENT_DATE
            AND s.monthly_price_minor IS NOT NULL
        ),
        0
      )::integer AS "savedSoFarMinor",

       s.updated_at AS "updatedAt"
     FROM subscriptions s
     JOIN services svc ON svc.id = s.service_id
     JOIN billing_providers bp ON bp.id = s.billing_provider_id
     WHERE s.user_id = $1
     ORDER BY svc.name`,
    [userId]
  );

  return result.rows;
}

export async function getSubscription(userId: string, id: string) {
  const result = await pool.query(
    `SELECT
       s.id,
       svc.slug AS "serviceSlug",
       svc.name AS "serviceName",
       bp.slug AS "billingProviderSlug",
       s.status,
       s.monthly_price_minor AS "monthlyPriceMinor",
       s.currency,
       CASE
         WHEN s.renewal_date IS NULL THEN NULL
         ELSE to_char(s.renewal_date::date, 'YYYY-MM-DD')
       END AS "renewalDate",
       s.plan_name AS "planName",
       to_char(s.status_effective_date::date, 'YYYY-MM-DD') AS "statusEffectiveDate",
       s.updated_at AS "updatedAt"
     FROM subscriptions s
     JOIN services svc ON svc.id = s.service_id
     JOIN billing_providers bp ON bp.id = s.billing_provider_id
     WHERE s.user_id = $1 AND s.id = $2`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

export async function addSubscription(args: {
  userId: string;
  serviceSlug: string;
  billingProviderSlug: string;
  monthlyPriceMinor?: number;
  currency?: string;
  renewalDate?: string;
  planName?: string;
}) {
  const result = await pool.query(
    `INSERT INTO subscriptions (
       user_id, service_id, billing_provider_id, status,
       monthly_price_minor, currency, renewal_date, plan_name
     )
     SELECT
       $1, svc.id, bp.id, 'ACTIVE',
       $4, $5, $6, $7
     FROM services svc, billing_providers bp
     WHERE svc.slug = $2 AND bp.slug = $3
     RETURNING id`,
    [
      args.userId,
      args.serviceSlug,
      args.billingProviderSlug,
      args.monthlyPriceMinor ?? null,
      args.currency ?? "USD",
      args.renewalDate ?? null,
      args.planName ?? null
    ]
  );

  if (!result.rows[0]) {
    throw new Error("UNKNOWN_SERVICE_OR_BILLING_PROVIDER");
  }

  return getSubscription(args.userId, result.rows[0].id);
}


export async function updateSubscription(args: {
  userId: string;
  subscriptionId: string;
  serviceSlug: string;
  billingProviderSlug: string;
  monthlyPriceMinor?: number;
  currency?: string;
  renewalDate?: string;
  planName?: string;
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE subscriptions s
       SET
         service_id = svc.id,
         billing_provider_id = bp.id,
         monthly_price_minor = $5,
         currency = $6,
         renewal_date = CASE
           WHEN $7::text IS NULL OR $7::text = '' THEN NULL
           ELSE ($7::date + time '12:00:00')
         END,
         plan_name = $8,
         updated_at = now()
       FROM services svc, billing_providers bp
       WHERE s.id = $2
         AND s.user_id = $1
         AND svc.slug = $3
         AND bp.slug = $4
       RETURNING s.id, s.service_id, s.billing_provider_id`,
      [
        args.userId,
        args.subscriptionId,
        args.serviceSlug,
        args.billingProviderSlug,
        args.monthlyPriceMinor ?? null,
        args.currency ?? "USD",
        args.renewalDate ?? null,
        args.planName ?? null
      ]
    );

    if (!result.rows[0]) {
      throw new Error("SUBSCRIPTION_NOT_FOUND_OR_INVALID_ROUTE");
    }

    await client.query("COMMIT");
    return getSubscription(args.userId, args.subscriptionId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSubscriptionStatus(args: {
  userId: string;
  subscriptionId: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  effectiveDate?: string;
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT status
       FROM subscriptions
       WHERE user_id = $1
         AND id = $2
       FOR UPDATE`,
      [
        args.userId,
        args.subscriptionId
      ]
    );

    const current = currentResult.rows[0];

    if (!current) {
      throw new Error("SUBSCRIPTION_NOT_FOUND");
    }

    const previousStatus = String(current.status);

    /*
     * A same-status confirmation is verification, not a transition.
     *
     * Do not reset status_effective_date and do not create history.
     */
    if (previousStatus === args.status) {
      await client.query(
        `UPDATE subscriptions
         SET last_verified_at = now(),
             updated_at = now()
         WHERE user_id = $1
           AND id = $2`,
        [
          args.userId,
          args.subscriptionId
        ]
      );

      await client.query("COMMIT");

      return getSubscription(
        args.userId,
        args.subscriptionId
      );
    }

    const effectiveDate =
      args.effectiveDate ??
      new Date().toISOString().slice(0, 10);

    await client.query(
      `UPDATE subscriptions
       SET status = $3::subscription_status,
           status_effective_date = $4,
           last_verified_at = now(),
           updated_at = now()
       WHERE user_id = $1
         AND id = $2`,
      [
        args.userId,
        args.subscriptionId,
        args.status,
        effectiveDate
      ]
    );

    await client.query(
      `INSERT INTO subscription_status_history (
         subscription_id,
         user_id,
         previous_status,
         new_status,
         effective_date
       )
       VALUES (
         $1,
         $2,
         $3::subscription_status,
         $4::subscription_status,
         $5
       )`,
      [
        args.subscriptionId,
        args.userId,
        previousStatus,
        args.status,
        effectiveDate
      ]
    );

    await client.query("COMMIT");

    return getSubscription(
      args.userId,
      args.subscriptionId
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteSubscription(
  userId: string,
  subscriptionId: string
) {
  const result = await pool.query(
    `DELETE FROM subscriptions
     WHERE user_id = $1
       AND id = $2
     RETURNING id`,
    [userId, subscriptionId]
  );

  return Boolean(result.rows[0]);
}

export async function createActionRecord(args: {
  userId: string;
  subscriptionId: string;
  action: ActionType;
  execution: string;
  providerSlug: string;
  requiresConfirmation: boolean;
  redirectUrl?: string;
  explanation: string;
}) {
  const status = args.requiresConfirmation
    ? "AWAITING_CONFIRMATION"
    : args.execution === "PROVIDER_REDIRECT"
      ? "AWAITING_USER_ACTION"
      : "REQUESTED";

  const result = await pool.query(
    `INSERT INTO subscription_actions (
       subscription_id, user_id, action, execution, status,
       provider_slug, requires_confirmation, redirect_url, metadata
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING *`,
    [
      args.subscriptionId,
      args.userId,
      args.action,
      args.execution,
      status,
      args.providerSlug,
      args.requiresConfirmation,
      args.redirectUrl ?? null,
      JSON.stringify({ explanation: args.explanation })
    ]
  );

  return result.rows[0];
}

/**
 * Confirms an action and persists the subscription status for DIRECT flows.
 *
 * Provider redirects deliberately do not modify subscription state here.
 * They remain AWAITING_USER_ACTION until a later provider verification /
 * completion flow confirms the actual external change.
 */
export async function confirmAction(userId: string, actionId: string) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const actionResult = await client.query(
      `SELECT *
       FROM subscription_actions
       WHERE id = $1
         AND user_id = $2
         AND status = 'AWAITING_CONFIRMATION'
       FOR UPDATE`,
      [actionId, userId]
    );

    const action = actionResult.rows[0] ?? null;

    if (!action) {
      await client.query("ROLLBACK");
      return null;
    }

    if (action.execution === "PROVIDER_REDIRECT") {
      const routed = await client.query(
        `UPDATE subscription_actions
         SET status = 'AWAITING_USER_ACTION',
             confirmed_at = now()
         WHERE id = $1
         RETURNING *`,
        [actionId]
      );

      await client.query("COMMIT");
      return routed.rows[0];
    }

    if (action.execution !== "DIRECT") {
      const guided = await client.query(
        `UPDATE subscription_actions
         SET status = 'AWAITING_USER_ACTION',
             confirmed_at = now()
         WHERE id = $1
         RETURNING *`,
        [actionId]
      );

      await client.query("COMMIT");
      return guided.rows[0];
    }

    const nextSubscriptionStatus =
      action.action === "PAUSE"
        ? "PAUSED"
        : action.action === "CANCEL"
          ? "CANCELLED"
          : "ACTIVE";

    await client.query(
      `UPDATE subscriptions
       SET status = $1::subscription_status,
           last_verified_at = now(),
           updated_at = now()
       WHERE id = $2
         AND user_id = $3`,
      [nextSubscriptionStatus, action.subscription_id, userId]
    );

    const completed = await client.query(
      `UPDATE subscription_actions
       SET status = 'COMPLETED',
           confirmed_at = now(),
           executed_at = now(),
           completed_at = now()
       WHERE id = $1
       RETURNING *`,
      [actionId]
    );

    await client.query("COMMIT");
    return completed.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function completeProviderActionResult(args: {
  userId: string;
  actionId: string;
  result: "ACTIVE" | "PAUSED" | "CANCELLED" | "UNCHANGED";
  effectiveDate?: string;
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const actionResult = await client.query(
      `SELECT *
       FROM subscription_actions
       WHERE id = $1
         AND user_id = $2
         AND execution IN ('PROVIDER_REDIRECT', 'GUIDED')
         AND status IN (
           'AWAITING_CONFIRMATION',
           'AWAITING_USER_ACTION'
         )
       FOR UPDATE`,
      [
        args.actionId,
        args.userId
      ]
    );

    const action = actionResult.rows[0] ?? null;

    if (!action) {
      await client.query("ROLLBACK");
      return null;
    }

    if (args.result === "UNCHANGED") {
      const unchanged = await client.query(
        `UPDATE subscription_actions
         SET status = 'CANCELLED',
             confirmed_at = COALESCE(confirmed_at, now()),
             completed_at = now(),
             metadata =
               metadata ||
               jsonb_build_object(
                 'providerResult',
                 'UNCHANGED'
               )
         WHERE id = $1
         RETURNING *`,
        [args.actionId]
      );

      await client.query("COMMIT");

      return {
        action: unchanged.rows[0],
        subscription: null
      };
    }

    const updatedSubscription = await client.query(
      `UPDATE subscriptions
       SET status = $1::subscription_status,
           status_effective_date =
             CASE
               WHEN $1::subscription_status = 'ACTIVE'
                 THEN NULL
               ELSE $2::date
             END,
           last_verified_at = now(),
           updated_at = now()
       WHERE id = $3
         AND user_id = $4
       RETURNING
         id,
         monthly_price_minor,
         currency,
         status_effective_date`,
      [
        args.result,
        args.effectiveDate ?? null,
        action.subscription_id,
        args.userId
      ]
    );

    if (!updatedSubscription.rows[0]) {
      throw new Error("SUBSCRIPTION_NOT_FOUND");
    }

    const subscription =
      updatedSubscription.rows[0];

    // A confirmed pause/cancellation establishes projected avoided spend,
    // but not yet money that has definitely been saved.
    //
    // Record one monthly billing period as ESTIMATED.
    // VERIFIED savings will be reconciled only after an avoided billing
    // period has actually elapsed.
    if (
      (args.result === "PAUSED" ||
        args.result === "CANCELLED") &&
      Number.isInteger(subscription.monthly_price_minor) &&
      subscription.monthly_price_minor > 0 &&
      subscription.currency
    ) {
      await client.query(
        `INSERT INTO savings_events (
           user_id,
           subscription_id,
           action_id,
           amount_minor,
           currency,
           kind,
           period_start,
           period_end
         )
         VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           'ESTIMATED',
           COALESCE($6::date, CURRENT_DATE),
           (
             COALESCE($6::date, CURRENT_DATE)
             + interval '1 month'
             - interval '1 day'
           )::date
         )
         ON CONFLICT (action_id, kind)
         WHERE action_id IS NOT NULL
         DO NOTHING`,
        [
          args.userId,
          action.subscription_id,
          args.actionId,
          subscription.monthly_price_minor,
          subscription.currency,
          args.effectiveDate ?? null
        ]
      );
    }

    const completed = await client.query(
      `UPDATE subscription_actions
       SET status = 'COMPLETED',
           confirmed_at = COALESCE(confirmed_at, now()),
           executed_at = now(),
           completed_at = now(),
           metadata =
             metadata ||
             jsonb_build_object(
               'providerResult',
               $2::text,
               'effectiveDate',
               $3::text
             )
       WHERE id = $1
       RETURNING *`,
      [
        args.actionId,
        args.result,
        args.effectiveDate ?? null
      ]
    );

    await client.query("COMMIT");

    return {
      action: completed.rows[0],
      subscription: await getSubscription(
        args.userId,
        action.subscription_id
      )
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listSavingsEvents(
  userId: string
) {
  const result = await pool.query(
    `SELECT
       se.id,
       se.subscription_id AS "subscriptionId",
       se.action_id AS "actionId",
       se.amount_minor AS "amountMinor",
       se.currency,
       se.kind,
       CASE
         WHEN se.period_start IS NULL THEN NULL
         ELSE to_char(
           se.period_start,
           'YYYY-MM-DD'
         )
       END AS "periodStart",
       CASE
         WHEN se.period_end IS NULL THEN NULL
         ELSE to_char(
           se.period_end,
           'YYYY-MM-DD'
         )
       END AS "periodEnd",
       se.created_at AS "createdAt",
       svc.slug AS "serviceSlug",
       svc.name AS "serviceName"
     FROM savings_events se
     LEFT JOIN subscriptions sub
       ON sub.id = se.subscription_id
     LEFT JOIN services svc
       ON svc.id = sub.service_id
     WHERE se.user_id = $1
     ORDER BY
       se.period_start DESC NULLS LAST,
       se.created_at DESC`,
    [userId]
  );

  return result.rows;
}

export async function getSavingsSummary(
  userId: string
) {
  const result = await pool.query(
    `WITH effective_events AS (
       SELECT DISTINCT ON (
         COALESCE(
           action_id::text,
           id::text
         )
       )
         amount_minor,
         currency,
         kind
       FROM savings_events
       WHERE user_id = $1
       ORDER BY
         COALESCE(
           action_id::text,
           id::text
         ),
         CASE
           WHEN kind = 'VERIFIED'
             THEN 2
           ELSE 1
         END DESC,
         created_at DESC
     )
     SELECT
       currency,
       COALESCE(
         SUM(
           CASE
             WHEN kind = 'VERIFIED'
               THEN amount_minor
             ELSE 0
           END
         ),
         0
       )::integer AS "verifiedMinor",
       COALESCE(
         SUM(
           CASE
             WHEN kind = 'ESTIMATED'
               THEN amount_minor
             ELSE 0
           END
         ),
         0
       )::integer AS "estimatedMinor",
       COALESCE(
         SUM(amount_minor),
         0
       )::integer AS "effectiveMinor"
     FROM effective_events
     GROUP BY currency
     ORDER BY currency`
    ,
    [userId]
  );

  return result.rows;
}

export async function listActions(userId: string) {
  const result = await pool.query(
    `SELECT id, subscription_id, action, execution, status, provider_slug,
            requires_confirmation, redirect_url, requested_at,
            confirmed_at, completed_at, metadata
     FROM subscription_actions
     WHERE user_id = $1
     ORDER BY requested_at DESC
     LIMIT 100`,
    [userId]
  );
  return result.rows;
}
