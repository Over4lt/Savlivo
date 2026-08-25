import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "./db.js";
import { updateSubscriptionStatus } from "./repositories.js";

async function createFixture() {
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
    [`status-test-${suffix}@example.com`]
  );

  const userId = user.rows[0].id as string;

  const subscription = await pool.query(
    `INSERT INTO subscriptions (
       user_id,
       service_id,
       billing_provider_id,
       status,
       status_effective_date,
       monthly_price_minor,
       currency,
       plan_name
     )
     VALUES (
       $1,
       $2,
       $3,
       'PAUSED',
       DATE '2026-08-01',
       21900,
       'NOK',
       'Standard'
     )
     RETURNING id`,
    [
      userId,
      service.rows[0].id,
      provider.rows[0].id
    ]
  );

  return {
    userId,
    subscriptionId: subscription.rows[0].id as string
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
  "same-status verification preserves effective date and creates no history",
  async () => {
    const fixture = await createFixture();

    try {
      await updateSubscriptionStatus({
        userId: fixture.userId,
        subscriptionId: fixture.subscriptionId,
        status: "PAUSED",
        effectiveDate: "2026-09-30"
      });

      const subscription = await pool.query(
        `SELECT
           status,
           to_char(
             status_effective_date,
             'YYYY-MM-DD'
           ) AS effective_date
         FROM subscriptions
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        subscription.rows[0].status,
        "PAUSED"
      );

      assert.equal(
        subscription.rows[0].effective_date,
        "2026-08-01"
      );

      const history = await pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM subscription_status_history
         WHERE subscription_id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        history.rows[0].count,
        0
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "real status transition updates effective date and creates one history row",
  async () => {
    const fixture = await createFixture();

    try {
      await updateSubscriptionStatus({
        userId: fixture.userId,
        subscriptionId: fixture.subscriptionId,
        status: "ACTIVE",
        effectiveDate: "2026-08-15"
      });

      const subscription = await pool.query(
        `SELECT
           status,
           to_char(
             status_effective_date,
             'YYYY-MM-DD'
           ) AS effective_date
         FROM subscriptions
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        subscription.rows[0].status,
        "ACTIVE"
      );

      assert.equal(
        subscription.rows[0].effective_date,
        "2026-08-15"
      );

      const history = await pool.query(
        `SELECT
           previous_status,
           new_status,
           to_char(
             effective_date,
             'YYYY-MM-DD'
           ) AS effective_date
         FROM subscription_status_history
         WHERE subscription_id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(history.rowCount, 1);

      assert.deepEqual(
        history.rows[0],
        {
          previous_status: "PAUSED",
          new_status: "ACTIVE",
          effective_date: "2026-08-15"
        }
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "future cancellation stores target status and future effective date",
  async () => {
    const fixture = await createFixture();

    try {
      /*
       * Fixture starts PAUSED. First make it ACTIVE so this test
       * represents a real ACTIVE -> CANCELLED transition.
       */
      await updateSubscriptionStatus({
        userId: fixture.userId,
        subscriptionId: fixture.subscriptionId,
        status: "ACTIVE",
        effectiveDate: "2026-08-15"
      });

      await updateSubscriptionStatus({
        userId: fixture.userId,
        subscriptionId: fixture.subscriptionId,
        status: "CANCELLED",
        effectiveDate: "2026-09-22"
      });

      const subscription = await pool.query(
        `SELECT
           status,
           to_char(
             status_effective_date,
             'YYYY-MM-DD'
           ) AS effective_date
         FROM subscriptions
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      assert.equal(
        subscription.rows[0].status,
        "CANCELLED"
      );

      assert.equal(
        subscription.rows[0].effective_date,
        "2026-09-22"
      );

      const history = await pool.query(
        `SELECT
           previous_status,
           new_status,
           to_char(
             effective_date,
             'YYYY-MM-DD'
           ) AS effective_date
         FROM subscription_status_history
         WHERE subscription_id = $1
         ORDER BY recorded_at`,
        [fixture.subscriptionId]
      );

      assert.equal(history.rowCount, 2);

      assert.deepEqual(
        history.rows[1],
        {
          previous_status: "ACTIVE",
          new_status: "CANCELLED",
          effective_date: "2026-09-22"
        }
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);
