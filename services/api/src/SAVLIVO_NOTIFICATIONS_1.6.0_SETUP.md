# Savlivo 1.6.0 — notifications + one-tap data health

## Files
- `savlivo-home-build-1.6.0.tsx` → replace the current Expo home screen.
- `savlivo-mobile-notifications-build-1.6.0.ts` → save as `apps/mobile/src/notifications.ts`.
- `savlivo-server-build-1.6.0.ts` → replace the API `server.ts`.
- `savlivo-notifications-build-1.6.0.ts` → save beside API `server.ts` as `notifications.ts`.
- `savlivo-migration-notifications-1.6.0.sql` → run against the Savlivo database.

## Expo dependency
From the mobile app package:

```bash
npx expo install expo-notifications
```

For native builds, ensure the app has the URL scheme `savlivo` in Expo config. The push payload also contains `subscriptionId` directly, so notification taps work through the listener even before universal/deep-link routing is expanded.

## Email transport
Set `SAVLIVO_EMAIL_WEBHOOK_URL` on the API to an HTTPS endpoint that accepts:

```json
{ "to": "user@example.com", "subject": "Netflix renews soon", "text": "..." }
```

This keeps the API provider-neutral; the webhook can later be backed by Resend, Postmark, SES, etc. If the variable is absent, email jobs remain retryable and push delivery still runs.

## Behavior
- Device push token registers after login/registration and notification permission.
- API queues renewal reminders 3 days before renewal at 09:00 in the user's configured timezone and dispatches every 15 minutes.
- Push tap opens Subscriptions and immediately opens the exact subscription editor.
- Home data-health checks flag missing renewal date, billing route, price, or status. `Fix now` opens that exact subscription editor.
- Notification jobs are idempotent via a database uniqueness constraint.

## Production follow-up
Move the 15-minute dispatcher from the API process to a durable scheduled worker before horizontally scaling the API. Add Expo push receipt reconciliation and a concrete email provider adapter before launch.
