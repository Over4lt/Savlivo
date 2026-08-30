import assert from "node:assert/strict";
import test from "node:test";

import { pool } from "./db.js";
import {
  queueRenewalReminders
} from "./notifications.js";
import {
  reminderInstantForRenewal
} from "./notification-logic.js";

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

  assert.ok(
    service.rows[0],
    "Netflix service seed is missing"
  );

  assert.ok(
    provider.rows[0],
    "Direct billing provider seed is missing"
  );

  return {
    serviceId: service.rows[0].id as string,
    providerId: provider.rows[0].id as string
  };
}

async function databaseDatePlus(days: number) {
  const result = await pool.query(
    `SELECT
       to_char(
         CURRENT_DATE + $1::integer,
         'YYYY-MM-DD'
       ) AS value`,
    [days]
  );

  return String(result.rows[0].value);
}

async function createFixture(
  renewalDate: string
) {
  const {
    serviceId,
    providerId
  } = await requireCatalogRows();

  const suffix =
    `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

  const userResult = await pool.query(
    `INSERT INTO users (
       email,
       password_hash,
       country_code,
       currency,
       timezone
     )
     VALUES (
       $1,
       $2,
       'NO',
       'NOK',
       'Europe/Oslo'
     )
     RETURNING id`,
    [
      `notification-test-${suffix}@example.com`,
      "integration-test"
    ]
  );

  const userId = userResult.rows[0].id as string;

  const subscriptionResult =
    await pool.query(
      `INSERT INTO subscriptions (
         user_id,
         service_id,
         billing_provider_id,
         status,
         monthly_price_minor,
         currency,
         renewal_date,
         plan_name
       )
       VALUES (
         $1,
         $2,
         $3,
         'ACTIVE',
         12900,
         'NOK',
         $4::date,
         'Standard'
       )
       RETURNING id`,
      [
        userId,
        serviceId,
        providerId,
        renewalDate
      ]
    );

  const subscriptionId =
    subscriptionResult.rows[0].id as string;

  const destination =
    `ExponentPushToken[test-${suffix}]`;

  await pool.query(
    `INSERT INTO notification_endpoints (
       user_id,
       channel,
       destination,
       platform,
       enabled
     )
     VALUES (
       $1,
       'PUSH',
       $2,
       'ios',
       true
     )`,
    [userId, destination]
  );

  // Disable email so each fixture produces exactly one PUSH job.
  await pool.query(
    `INSERT INTO notification_preferences (
       user_id,
       renewal_reminders,
       savings_opportunities,
       email_enabled
     )
     VALUES (
       $1,
       true,
       true,
       false
     )`,
    [userId]
  );

  return {
    userId,
    subscriptionId,
    destination
  };
}

async function cleanupFixture(
  userId: string
) {
  // subscriptions, jobs, endpoints and preferences cascade.
  await pool.query(
    `DELETE FROM users
     WHERE id = $1`,
    [userId]
  );
}

test(
  "production SQL schedules 09:00 in the user's timezone",
  async () => {
    const renewalDate =
      await databaseDatePlus(10);

    const fixture =
      await createFixture(renewalDate);

    try {
      await queueRenewalReminders();

      const result = await pool.query(
        `SELECT scheduled_for
         FROM notification_jobs
         WHERE subscription_id = $1
           AND channel = 'PUSH'
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        result.rows.length,
        1
      );

      const actual =
        new Date(
          result.rows[0].scheduled_for
        ).toISOString();

      const expected =
        reminderInstantForRenewal(
          renewalDate,
          "Europe/Oslo"
        ).toISOString();

      assert.equal(
        actual,
        expected
      );
    } finally {
      await cleanupFixture(
        fixture.userId
      );
    }
  }
);

test(
  "changing renewal date replaces stale unsent schedule",
  async () => {
    const originalRenewal =
      await databaseDatePlus(10);

    const changedRenewal =
      await databaseDatePlus(15);

    const fixture =
      await createFixture(
        originalRenewal
      );

    try {
      await queueRenewalReminders();

      const before = await pool.query(
        `SELECT scheduled_for
         FROM notification_jobs
         WHERE subscription_id = $1
           AND channel = 'PUSH'
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        before.rows.length,
        1
      );

      await pool.query(
        `UPDATE subscriptions
         SET renewal_date = $2::date
         WHERE id = $1`,
        [
          fixture.subscriptionId,
          changedRenewal
        ]
      );

      await queueRenewalReminders();

      const after = await pool.query(
        `SELECT scheduled_for
         FROM notification_jobs
         WHERE subscription_id = $1
           AND channel = 'PUSH'
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        after.rows.length,
        1,
        "Only the new schedule should remain"
      );

      const actual =
        new Date(
          after.rows[0].scheduled_for
        ).toISOString();

      const expected =
        reminderInstantForRenewal(
          changedRenewal,
          "Europe/Oslo"
        ).toISOString();

      assert.equal(
        actual,
        expected
      );

      assert.notEqual(
        new Date(
          before.rows[0].scheduled_for
        ).toISOString(),
        actual
      );
    } finally {
      await cleanupFixture(
        fixture.userId
      );
    }
  }
);

test(
  "disabling renewal reminders removes queued unsent job",
  async () => {
    const renewalDate =
      await databaseDatePlus(10);

    const fixture =
      await createFixture(renewalDate);

    try {
      await queueRenewalReminders();

      const before = await pool.query(
        `SELECT count(*)::integer AS count
         FROM notification_jobs
         WHERE subscription_id = $1
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        before.rows[0].count,
        1
      );

      await pool.query(
        `UPDATE notification_preferences
         SET renewal_reminders = false
         WHERE user_id = $1`,
        [fixture.userId]
      );

      await queueRenewalReminders();

      const after = await pool.query(
        `SELECT count(*)::integer AS count
         FROM notification_jobs
         WHERE subscription_id = $1
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        after.rows[0].count,
        0
      );
    } finally {
      await cleanupFixture(
        fixture.userId
      );
    }
  }
);

test.after(async () => {
  await pool.end();
});

test(
  "future cancellation after renewal still queues reminder",
  async () => {
    const renewalDate =
      await databaseDatePlus(10);

    const cancellationDate =
      await databaseDatePlus(20);

    const fixture =
      await createFixture(renewalDate);

    try {
      await pool.query(
        `UPDATE subscriptions
         SET status = 'CANCELLED',
             status_effective_date = $2::date
         WHERE id = $1`,
        [
          fixture.subscriptionId,
          cancellationDate
        ]
      );

      await queueRenewalReminders();

      const result = await pool.query(
        `SELECT count(*)::integer AS count
         FROM notification_jobs
         WHERE subscription_id = $1
           AND channel = 'PUSH'
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        result.rows[0].count,
        1,
        "A cancellation effective after renewal must not suppress the renewal reminder"
      );
    } finally {
      await cleanupFixture(
        fixture.userId
      );
    }
  }
);

test(
  "cancellation before renewal suppresses reminder",
  async () => {
    const cancellationDate =
      await databaseDatePlus(10);

    const renewalDate =
      await databaseDatePlus(20);

    const fixture =
      await createFixture(renewalDate);

    try {
      await pool.query(
        `UPDATE subscriptions
         SET status = 'CANCELLED',
             status_effective_date = $2::date
         WHERE id = $1`,
        [
          fixture.subscriptionId,
          cancellationDate
        ]
      );

      await queueRenewalReminders();

      const result = await pool.query(
        `SELECT count(*)::integer AS count
         FROM notification_jobs
         WHERE subscription_id = $1
           AND channel = 'PUSH'
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        result.rows[0].count,
        0,
        "A cancellation effective before renewal must suppress the renewal reminder"
      );
    } finally {
      await cleanupFixture(
        fixture.userId
      );
    }
  }
);

test(
  "cancellation effective on renewal date suppresses reminder",
  async () => {
    const renewalDate =
      await databaseDatePlus(10);

    const fixture =
      await createFixture(renewalDate);

    try {
      await pool.query(
        `UPDATE subscriptions
         SET status = 'CANCELLED',
             status_effective_date = $2::date
         WHERE id = $1`,
        [
          fixture.subscriptionId,
          renewalDate
        ]
      );

      await queueRenewalReminders();

      const result = await pool.query(
        `SELECT count(*)::integer AS count
         FROM notification_jobs
         WHERE subscription_id = $1
           AND channel = 'PUSH'
           AND sent_at IS NULL`,
        [fixture.subscriptionId]
      );

      assert.equal(
        result.rows[0].count,
        0,
        "A cancellation effective on the renewal date must suppress the renewal reminder"
      );
    } finally {
      await cleanupFixture(
        fixture.userId
      );
    }
  }
);
