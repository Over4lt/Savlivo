import { pool } from "./db.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type DueNotification = {
  id: string;
  userId: string;
  email: string;
  subscriptionId: string;
  serviceName: string;
  renewalDate: string;
  channel: "PUSH" | "EMAIL";
  destination: string;
};

export async function registerPushToken(userId: string, token: string, platform?: string) {
  if (!/^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(token)) {
    throw new Error("INVALID_EXPO_PUSH_TOKEN");
  }
  await pool.query(
    `INSERT INTO notification_endpoints (user_id, channel, destination, platform, enabled, updated_at)
     VALUES ($1, 'PUSH', $2, $3, true, now())
     ON CONFLICT (user_id, channel, destination)
     DO UPDATE SET enabled = true, platform = EXCLUDED.platform, updated_at = now()`,
    [userId, token, platform ?? null]
  );
}

export async function setNotificationPreferences(userId: string, args: { renewalReminders?: boolean; savingsOpportunities?: boolean; emailEnabled?: boolean }) {
  await pool.query(
    `INSERT INTO notification_preferences (user_id, renewal_reminders, savings_opportunities, email_enabled)
     VALUES ($1, COALESCE($2, true), COALESCE($3, true), COALESCE($4, true))
     ON CONFLICT (user_id) DO UPDATE SET
       renewal_reminders = COALESCE($2, notification_preferences.renewal_reminders),
       savings_opportunities = COALESCE($3, notification_preferences.savings_opportunities),
       email_enabled = COALESCE($4, notification_preferences.email_enabled),
       updated_at = now()`,
    [userId, args.renewalReminders ?? null, args.savingsOpportunities ?? null, args.emailEnabled ?? null]
  );
}

export async function queueRenewalReminders() {
  // Renewal dates are calendar dates, not instants.
  //
  // Build the reminder at 09:00 in the user's configured timezone,
  // then let PostgreSQL convert that local wall-clock time to timestamptz.
  //
  // Before inserting the current reminder, remove stale UNSENT renewal
  // jobs. This matters when a user edits the renewal date, timezone,
  // destination, or notification preferences. Sent history is preserved.
  await pool.query(`
    DELETE FROM notification_jobs j
    WHERE j.kind = 'RENEWAL_REMINDER'
      AND j.sent_at IS NULL
      AND j.subscription_id IN (
        SELECT s.id
        FROM subscriptions s
        WHERE s.renewal_date IS NULL
           OR NOT (
             s.status = 'ACTIVE'
             OR (
               s.status IN ('PAUSED', 'CANCELLED')
               AND s.status_effective_date IS NOT NULL
               AND s.status_effective_date > s.renewal_date
             )
           )
           OR s.renewal_date < CURRENT_DATE
           OR s.renewal_date >= CURRENT_DATE + 30
      )
  `);

  // Remove unsent reminders that are no longer eligible because
  // the user disabled reminders/email, the push endpoint disappeared,
  // or the subscription is no longer active.
  await pool.query(`
    DELETE FROM notification_jobs j
    USING subscriptions s
    LEFT JOIN notification_preferences p
      ON p.user_id = s.user_id
    WHERE j.subscription_id = s.id
      AND j.kind = 'RENEWAL_REMINDER'
      AND j.sent_at IS NULL
      AND (
        NOT (
          s.status = 'ACTIVE'
          OR (
            s.status IN ('PAUSED', 'CANCELLED')
            AND s.status_effective_date IS NOT NULL
            AND s.status_effective_date > s.renewal_date
          )
        )
        OR s.renewal_date IS NULL
        OR COALESCE(p.renewal_reminders, true) = false
        OR (
          j.channel = 'EMAIL'
          AND COALESCE(p.email_enabled, true) = false
        )
        OR (
          j.channel = 'PUSH'
          AND NOT EXISTS (
            SELECT 1
            FROM notification_endpoints e
            WHERE e.user_id = s.user_id
              AND e.channel = 'PUSH'
              AND e.destination = j.destination
              AND e.enabled = true
          )
        )
      )
  `);

  await pool.query(`
    DELETE FROM notification_jobs j
    USING subscriptions s, users u
    WHERE j.subscription_id = s.id
      AND u.id = s.user_id
      AND j.kind = 'RENEWAL_REMINDER'
      AND j.sent_at IS NULL
      AND j.scheduled_for <>
        (
          (s.renewal_date - 3) + time '09:00:00'
        ) AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC')
  `);

  await pool.query(`
    INSERT INTO notification_jobs (
      user_id,
      subscription_id,
      kind,
      channel,
      destination,
      scheduled_for,
      payload
    )
    SELECT
      u.id,
      s.id,
      'RENEWAL_REMINDER',
      e.channel,
      e.destination,
      (
        (s.renewal_date - 3) + time '09:00:00'
      ) AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC'),
      jsonb_build_object(
        'title', svc.name || ' renews soon',
        'body',
          'Renews ' ||
          to_char(s.renewal_date, 'Mon DD') ||
          '. Tap to review.',
        'subscriptionId', s.id,
        'field', 'renewalDate',
        'deepLink',
          'savlivo://subscription/' ||
          s.id ||
          '?field=renewalDate'
      )
    FROM subscriptions s
    JOIN users u
      ON u.id = s.user_id
    JOIN services svc
      ON svc.id = s.service_id
    JOIN notification_endpoints e
      ON e.user_id = u.id
     AND e.enabled = true
    LEFT JOIN notification_preferences p
      ON p.user_id = u.id
    WHERE (
        s.status = 'ACTIVE'
        OR (
          s.status IN ('PAUSED', 'CANCELLED')
          AND s.status_effective_date IS NOT NULL
          AND s.status_effective_date > s.renewal_date
        )
      )
      AND s.renewal_date IS NOT NULL
      AND COALESCE(p.renewal_reminders, true) = true
      AND s.renewal_date >= CURRENT_DATE
      AND s.renewal_date < CURRENT_DATE + 30
    ON CONFLICT (
      subscription_id,
      kind,
      channel,
      destination,
      scheduled_for
    ) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO notification_jobs (
      user_id,
      subscription_id,
      kind,
      channel,
      destination,
      scheduled_for,
      payload
    )
    SELECT
      u.id,
      s.id,
      'RENEWAL_REMINDER',
      'EMAIL',
      u.email,
      (
        (s.renewal_date - 3) + time '09:00:00'
      ) AT TIME ZONE COALESCE(NULLIF(u.timezone, ''), 'UTC'),
      jsonb_build_object(
        'title', svc.name || ' renews soon',
        'body',
          'Your ' ||
          svc.name ||
          ' subscription renews ' ||
          to_char(s.renewal_date, 'Mon DD') ||
          '.',
        'subscriptionId', s.id,
        'field', 'renewalDate',
        'deepLink',
          'savlivo://subscription/' ||
          s.id ||
          '?field=renewalDate'
      )
    FROM subscriptions s
    JOIN users u
      ON u.id = s.user_id
    JOIN services svc
      ON svc.id = s.service_id
    LEFT JOIN notification_preferences p
      ON p.user_id = u.id
    WHERE (
        s.status = 'ACTIVE'
        OR (
          s.status IN ('PAUSED', 'CANCELLED')
          AND s.status_effective_date IS NOT NULL
          AND s.status_effective_date > s.renewal_date
        )
      )
      AND s.renewal_date IS NOT NULL
      AND COALESCE(p.renewal_reminders, true) = true
      AND COALESCE(p.email_enabled, true) = true
      AND s.renewal_date >= CURRENT_DATE
      AND s.renewal_date < CURRENT_DATE + 30
    ON CONFLICT (
      subscription_id,
      kind,
      channel,
      destination,
      scheduled_for
    ) DO NOTHING
  `);
}

async function dueJobs(): Promise<DueNotification[]> {
  const result = await pool.query(`
    SELECT
      j.id,
      j.user_id AS "userId",
      u.email,
      j.subscription_id AS "subscriptionId",
      svc.name AS "serviceName",
      to_char(
        s.renewal_date::date,
        'YYYY-MM-DD'
      ) AS "renewalDate",
      j.channel,
      j.destination,
      j.payload
    FROM notification_jobs j
    JOIN users u
      ON u.id = j.user_id
    JOIN subscriptions s
      ON s.id = j.subscription_id
    JOIN services svc
      ON svc.id = s.service_id
    LEFT JOIN notification_preferences p
      ON p.user_id = u.id
    WHERE j.sent_at IS NULL
      AND j.failed_at IS NULL
      AND j.scheduled_for <= now()
      AND (
        s.status = 'ACTIVE'
        OR (
          s.status IN ('PAUSED', 'CANCELLED')
          AND s.status_effective_date IS NOT NULL
          AND s.status_effective_date > s.renewal_date
        )
      )
      AND s.renewal_date IS NOT NULL
      AND COALESCE(
        p.renewal_reminders,
        true
      ) = true
      AND (
        (
          j.channel = 'EMAIL'
          AND COALESCE(
            p.email_enabled,
            true
          ) = true
        )
        OR (
          j.channel = 'PUSH'
          AND EXISTS (
            SELECT 1
            FROM notification_endpoints e
            WHERE e.user_id = u.id
              AND e.channel = 'PUSH'
              AND e.destination = j.destination
              AND e.enabled = true
          )
        )
      )
    ORDER BY j.scheduled_for
    LIMIT 100
  `);

  return result.rows;
}

async function sendPush(job: any) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      to: job.destination,
      sound: "default",
      title: job.payload.title,
      body: job.payload.body,
      data: { subscriptionId: job.subscriptionId, field: job.payload.field, deepLink: job.payload.deepLink }
    })
  });
  if (!response.ok) throw new Error(`EXPO_PUSH_${response.status}`);
}

async function sendEmail(job: any) {
  const webhook = process.env.SAVLIVO_EMAIL_WEBHOOK_URL;
  if (!webhook) throw new Error("EMAIL_WEBHOOK_NOT_CONFIGURED");
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: job.destination, subject: job.payload.title, text: `${job.payload.body}\n\nOpen Savlivo: ${job.payload.deepLink}` })
  });
  if (!response.ok) throw new Error(`EMAIL_WEBHOOK_${response.status}`);
}

export async function dispatchDueNotifications() {
  await queueRenewalReminders();
  const jobs: any[] = await dueJobs();
  let sent = 0;
  for (const job of jobs) {
    try {
      if (job.channel === "PUSH") await sendPush(job);
      else await sendEmail(job);
      await pool.query(`UPDATE notification_jobs SET sent_at = now(), last_error = NULL WHERE id = $1`, [job.id]);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "UNKNOWN_NOTIFICATION_ERROR";
      // Missing email transport is configuration, not a permanently bad job; keep it retryable.
      if (message === "EMAIL_WEBHOOK_NOT_CONFIGURED") {
        await pool.query(`UPDATE notification_jobs SET last_error = $2 WHERE id = $1`, [job.id, message]);
      } else {
        await pool.query(`UPDATE notification_jobs SET failed_at = now(), last_error = $2 WHERE id = $1`, [job.id, message]);
      }
    }
  }
  return { queuedOrDue: jobs.length, sent };
}
