import assert from "node:assert/strict";
import test from "node:test";

import { pool } from "./db.js";
import { reconcileSavingsEvents } from "./savings.js";
import {
  completeProviderActionResult
} from "./repositories.js";

async function requireCatalogRows() {
  const service = await pool.query(
    `SELECT id
     FROM services
     WHERE slug = 'netflix'
     LIMIT 1`
  );

  const provider = await pool.query(
    `SELECT id
     FROM billing_providers
     WHERE slug = 'direct'
     LIMIT 1`
  );

  assert.ok(service.rows[0]);
  assert.ok(provider.rows[0]);

  return {
    serviceId: service.rows[0].id as string,
    providerId: provider.rows[0].id as string
  };
}

async function createFixture() {
  const {
    serviceId,
    providerId
  } = await requireCatalogRows();

  const suffix =
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const user = await pool.query(
    `INSERT INTO users (
       email,
       password_hash,
       country_code,
       currency,
       timezone
     )
     VALUES (
       $1,
       'integration-test',
       'NO',
       'NOK',
       'Europe/Oslo'
     )
     RETURNING id`,
    [`action-test-${suffix}@example.com`]
  );

  const userId = user.rows[0].id as string;

  const subscription = await pool.query(
    `INSERT INTO subscriptions (
       user_id,
       service_id,
       billing_provider_id,
       status,
       monthly_price_minor,
       currency,
       plan_name
     )
     VALUES (
       $1,
       $2,
       $3,
       'ACTIVE',
       12900,
       'NOK',
       'Standard'
     )
     RETURNING id`,
    [
      userId,
      serviceId,
      providerId
    ]
  );

  const subscriptionId =
    subscription.rows[0].id as string;

  const action = await pool.query(
    `INSERT INTO subscription_actions (
       subscription_id,
       user_id,
       action,
       execution,
       status,
       provider_slug,
       requires_confirmation,
       metadata
     )
     VALUES (
       $1,
       $2,
       'CANCEL',
       'PROVIDER_REDIRECT',
       'AWAITING_USER_ACTION',
       'direct',
       true,
       '{}'::jsonb
     )
     RETURNING id`,
    [
      subscriptionId,
      userId
    ]
  );

  return {
    userId,
    subscriptionId,
    actionId: action.rows[0].id as string
  };
}

async function cleanup(userId: string) {
  await pool.query(
    `DELETE FROM users
     WHERE id = $1`,
    [userId]
  );
}

test(
  "provider result completes action and subscription atomically",
  async () => {
    const fixture = await createFixture();

    try {
      const result =
        await completeProviderActionResult({
          userId: fixture.userId,
          actionId: fixture.actionId,
          result: "CANCELLED",
          effectiveDate: "2026-09-15"
        });

      assert.ok(result);
      assert.equal(
        result?.action.status,
        "COMPLETED"
      );
      assert.equal(
        result?.subscription?.status,
        "CANCELLED"
      );
      assert.equal(
        result?.subscription?.statusEffectiveDate,
        "2026-09-15"
      );

      const action = await pool.query(
        `SELECT
           status,
           executed_at,
           completed_at,
           metadata
         FROM subscription_actions
         WHERE id = $1`,
        [fixture.actionId]
      );

      assert.equal(
        action.rows[0].status,
        "COMPLETED"
      );
      assert.ok(action.rows[0].executed_at);
      assert.ok(action.rows[0].completed_at);
      assert.equal(
        action.rows[0].metadata.providerResult,
        "CANCELLED"
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "UNCHANGED closes action without changing subscription",
  async () => {
    const fixture = await createFixture();

    try {
      const result =
        await completeProviderActionResult({
          userId: fixture.userId,
          actionId: fixture.actionId,
          result: "UNCHANGED"
        });

      assert.ok(result);
      assert.equal(
        result?.action.status,
        "CANCELLED"
      );
      assert.equal(
        result?.subscription,
        null
      );

      const subscription = await pool.query(
        `SELECT status
         FROM subscriptions
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        subscription.rows[0].status,
        "ACTIVE"
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "wrong user cannot complete another user's action",
  async () => {
    const fixture = await createFixture();

    const otherUser = await pool.query(
      `INSERT INTO users (
         email,
         password_hash
       )
       VALUES (
         $1,
         'integration-test'
       )
       RETURNING id`,
      [
        `other-${Date.now()}@example.com`
      ]
    );

    const otherUserId =
      otherUser.rows[0].id as string;

    try {
      const result =
        await completeProviderActionResult({
          userId: otherUserId,
          actionId: fixture.actionId,
          result: "CANCELLED",
          effectiveDate: "2026-09-15"
        });

      assert.equal(result, null);

      const subscription = await pool.query(
        `SELECT status
         FROM subscriptions
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        subscription.rows[0].status,
        "ACTIVE"
      );
    } finally {
      await cleanup(fixture.userId);
      await cleanup(otherUserId);
    }
  }
);

test(
  "completed action cannot be replayed",
  async () => {
    const fixture = await createFixture();

    try {
      const first =
        await completeProviderActionResult({
          userId: fixture.userId,
          actionId: fixture.actionId,
          result: "CANCELLED",
          effectiveDate: "2026-09-15"
        });

      assert.ok(first);

      const replay =
        await completeProviderActionResult({
          userId: fixture.userId,
          actionId: fixture.actionId,
          result: "ACTIVE",
          effectiveDate: "2026-09-16"
        });

      assert.equal(replay, null);

      const subscription = await pool.query(
        `SELECT
           status,
           to_char(
             status_effective_date::date,
             'YYYY-MM-DD'
           ) AS "effectiveDate"
         FROM subscriptions
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        subscription.rows[0].status,
        "CANCELLED"
      );
      assert.equal(
        subscription.rows[0].effectiveDate,
        "2026-09-15"
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "completed cancellation records one estimated billed month",
  async () => {
    const fixture = await createFixture();

    try {
      await completeProviderActionResult({
        userId: fixture.userId,
        actionId: fixture.actionId,
        result: "CANCELLED",
        effectiveDate: "2026-09-15"
      });

      const savings = await pool.query(
        `SELECT
           amount_minor,
           currency,
           kind,
           to_char(
             period_start,
             'YYYY-MM-DD'
           ) AS "periodStart",
           to_char(
             period_end,
             'YYYY-MM-DD'
           ) AS "periodEnd"
         FROM savings_events
         WHERE action_id = $1`,
        [fixture.actionId]
      );

      assert.equal(savings.rows.length, 1);
      assert.equal(
        savings.rows[0].amount_minor,
        12900
      );
      assert.equal(
        savings.rows[0].currency,
        "NOK"
      );
      assert.equal(
        savings.rows[0].kind,
        "ESTIMATED"
      );
      assert.equal(
        savings.rows[0].periodStart,
        "2026-09-15"
      );
      assert.equal(
        savings.rows[0].periodEnd,
        "2026-10-14"
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "UNCHANGED creates no savings event",
  async () => {
    const fixture = await createFixture();

    try {
      await completeProviderActionResult({
        userId: fixture.userId,
        actionId: fixture.actionId,
        result: "UNCHANGED"
      });

      const savings = await pool.query(
        `SELECT count(*)::integer AS count
         FROM savings_events
         WHERE action_id = $1`,
        [fixture.actionId]
      );

      assert.equal(
        savings.rows[0].count,
        0
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "elapsed inactive period becomes verified savings",
  async () => {
    const fixture = await createFixture();

    try {
      await completeProviderActionResult({
        userId: fixture.userId,
        actionId: fixture.actionId,
        result: "CANCELLED",
        effectiveDate: "2025-01-01"
      });

      await reconcileSavingsEvents();

      const savings = await pool.query(
        `SELECT kind, amount_minor, currency
         FROM savings_events
         WHERE action_id = $1
         ORDER BY kind`,
        [fixture.actionId]
      );

      assert.equal(savings.rows.length, 2);

      const estimated = savings.rows.find(
        (row) => row.kind === "ESTIMATED"
      );
      const verified = savings.rows.find(
        (row) => row.kind === "VERIFIED"
      );

      assert.ok(estimated);
      assert.ok(verified);

      assert.equal(
        verified.amount_minor,
        estimated.amount_minor
      );
      assert.equal(
        verified.currency,
        estimated.currency
      );

      // Reconciliation must be idempotent.
      await reconcileSavingsEvents();

      const replay = await pool.query(
        `SELECT count(*)::integer AS count
         FROM savings_events
         WHERE action_id = $1
           AND kind = 'VERIFIED'`,
        [fixture.actionId]
      );

      assert.equal(replay.rows[0].count, 1);
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "later re-pause cannot verify an older estimated period",
  async () => {
    const fixture = await createFixture();

    try {
      await completeProviderActionResult({
        userId: fixture.userId,
        actionId: fixture.actionId,
        result: "CANCELLED",
        effectiveDate: "2025-01-01"
      });

      // Simulate a later reactivation followed by another pause.
      // The current inactive state therefore did not cover the
      // original estimated period continuously.
      await pool.query(
        `UPDATE subscriptions
         SET status = 'PAUSED',
             status_effective_date = '2025-03-01'
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      await reconcileSavingsEvents();

      const verified = await pool.query(
        `SELECT count(*)::integer AS count
         FROM savings_events
         WHERE action_id = $1
           AND kind = 'VERIFIED'`,
        [fixture.actionId]
      );

      assert.equal(verified.rows[0].count, 0);
    } finally {
      await cleanup(fixture.userId);
    }
  }
);


test.after(async () => {
  await pool.end();
});

test(
  "ACTIVE provider result clears status effective date",
  async () => {
    const fixture = await createFixture();

    try {
      await pool.query(
        `UPDATE subscriptions
         SET status = 'CANCELLED',
             status_effective_date = '2026-09-22'
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      const result =
        await completeProviderActionResult({
          userId: fixture.userId,
          actionId: fixture.actionId,
          result: "ACTIVE",
          effectiveDate: "2026-08-25"
        });

      assert.ok(result);

      const subscription = await pool.query(
        `SELECT
           status,
           status_effective_date
         FROM subscriptions
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        subscription.rows[0].status,
        "ACTIVE"
      );

      assert.equal(
        subscription.rows[0].status_effective_date,
        null
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);
