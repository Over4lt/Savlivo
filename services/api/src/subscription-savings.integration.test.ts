import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "./db.js";
import { listSubscriptions } from "./repositories.js";

async function createFixture() {
  const service = await pool.query(`
    SELECT id
    FROM services
    WHERE slug = 'netflix'
    LIMIT 1
  `);

  const provider = await pool.query(`
    SELECT id
    FROM billing_providers
    WHERE slug = 'direct'
    LIMIT 1
  `);

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
    [`savings-test-${suffix}@example.com`]
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
      'ACTIVE',
      CURRENT_DATE - 8,
      7900,
      'NOK',
      'Test Plan'
    )
    RETURNING id`,
    [
      userId,
      service.rows[0].id,
      provider.rows[0].id
    ]
  );

  const subscriptionId =
    subscription.rows[0].id as string;

  /*
   * Historical interval:
   *
   * ACTIVE -> PAUSED  50 days ago
   * PAUSED -> ACTIVE   8 days ago
   *
   * Total inactive time = 42 days.
   */
  await pool.query(
    `INSERT INTO subscription_status_history (
      subscription_id,
      user_id,
      previous_status,
      new_status,
      effective_date,
      recorded_at
    )
    VALUES
      (
        $1,
        $2,
        'ACTIVE',
        'PAUSED',
        CURRENT_DATE - 50,
        now() - interval '50 days'
      ),
      (
        $1,
        $2,
        'PAUSED',
        'ACTIVE',
        CURRENT_DATE - 8,
        now() - interval '8 days'
      )`,
    [
      subscriptionId,
      userId
    ]
  );

  return {
    userId,
    subscriptionId
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
  "saved so far uses daily proration for partial months",
  async () => {
    const fixture = await createFixture();

    try {
      const subscriptions =
        await listSubscriptions(fixture.userId);

      const subscription =
        subscriptions.find(
          item => item.id === fixture.subscriptionId
        );

      assert.ok(subscription);

      const expected = Math.round(
        7900 * 42 / 30.436875
      );

      console.log(
        "42-day expected savings:",
        expected
      );

      console.log(
        "API savedSoFarMinor:",
        subscription.savedSoFarMinor
      );

      assert.equal(
        subscription.savedSoFarMinor,
        expected
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "saved so far accumulates multiple separate pause periods",
  async () => {
    const fixture = await createFixture();

    try {
      /*
       * createFixture already contains:
       *
       * PAUSED 50 days ago
       * ACTIVE  8 days ago
       *
       * = 42 saved days
       *
       * Add an older independent interval:
       *
       * PAUSED 80 days ago
       * ACTIVE  70 days ago
       *
       * = 10 additional saved days
       *
       * Expected total = 52 days.
       */
      await pool.query(
        `INSERT INTO subscription_status_history (
          subscription_id,
          user_id,
          previous_status,
          new_status,
          effective_date,
          recorded_at
        )
        VALUES
          (
            $1,
            $2,
            'ACTIVE',
            'PAUSED',
            CURRENT_DATE - 80,
            now() - interval '80 days'
          ),
          (
            $1,
            $2,
            'PAUSED',
            'ACTIVE',
            CURRENT_DATE - 70,
            now() - interval '70 days'
          )`,
        [
          fixture.subscriptionId,
          fixture.userId
        ]
      );

      const subscriptions =
        await listSubscriptions(fixture.userId);

      const subscription =
        subscriptions.find(
          item => item.id === fixture.subscriptionId
        );

      assert.ok(subscription);

      /*
       * SQL rounds each inactive interval independently:
       *
       * ROUND(7900 * 42 / 30.436875)
       * +
       * ROUND(7900 * 10 / 30.436875)
       */
      const expected =
        Math.round(7900 * 42 / 30.436875) +
        Math.round(7900 * 10 / 30.436875);

      console.log(
        "52-day expected savings:",
        expected
      );

      console.log(
        "API savedSoFarMinor:",
        subscription.savedSoFarMinor
      );

      assert.equal(
        subscription.savedSoFarMinor,
        expected
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);

test(
  "saved so far includes an open pause through today",
  async () => {
    const fixture = await createFixture();

    try {
      /*
       * createFixture contains a completed 42-day pause.
       *
       * Add a new pause beginning 5 days ago with no later
       * ACTIVE transition.
       *
       * Completed interval: 42 days
       * Open interval:       5 days
       */
      await pool.query(
        `INSERT INTO subscription_status_history (
          subscription_id,
          user_id,
          previous_status,
          new_status,
          effective_date,
          recorded_at
        )
        VALUES (
          $1,
          $2,
          'ACTIVE',
          'PAUSED',
          CURRENT_DATE - 5,
          now() - interval '5 days'
        )`,
        [
          fixture.subscriptionId,
          fixture.userId
        ]
      );

      await pool.query(
        `UPDATE subscriptions
         SET status = 'PAUSED',
             status_effective_date = CURRENT_DATE - 5
         WHERE id = $1`,
        [fixture.subscriptionId]
      );

      const subscriptions =
        await listSubscriptions(fixture.userId);

      const subscription =
        subscriptions.find(
          item => item.id === fixture.subscriptionId
        );

      assert.ok(subscription);

      const expected =
        Math.round(7900 * 42 / 30.436875) +
        Math.round(7900 * 5 / 30.436875);

      console.log(
        "47-day expected savings:",
        expected
      );

      console.log(
        "API savedSoFarMinor:",
        subscription.savedSoFarMinor
      );

      assert.equal(
        subscription.savedSoFarMinor,
        expected
      );
    } finally {
      await cleanup(fixture.userId);
    }
  }
);
