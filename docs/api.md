# Savlivo API v1

## GET /health

Returns API health.

## GET /v1/subscriptions

Returns subscriptions for the authenticated user.

Planned response:

```json
{
  "items": [
    {
      "id": "uuid",
      "serviceSlug": "max",
      "serviceName": "Max",
      "billingProviderSlug": "apple",
      "status": "ACTIVE",
      "monthlyPriceMinor": 1299,
      "currency": "USD",
      "renewalDate": "2026-09-01"
    }
  ]
}
```

## GET /v1/subscriptions/:id/capabilities

Returns the available actions for the current service + billing route.

## POST /v1/subscriptions/:id/actions/preview

Request:

```json
{
  "action": "CANCEL"
}
```

Response:

```json
{
  "action": "CANCEL",
  "subscriptionId": "uuid",
  "serviceName": "Max",
  "billingProvider": "apple",
  "execution": "PROVIDER_REDIRECT",
  "requiresConfirmation": true,
  "premiumRequired": false,
  "redirectUrl": "https://apps.apple.com/account/subscriptions",
  "explanation": "Apple manages this subscription..."
}
```

A `VIEWER` user receives `402 PAID_PLAN_REQUIRED`.

## POST /v1/subscriptions/:id/actions

Creates an auditable action record after confirmation.

Rules:

- MANUAL is required for manual actions.
- PREMIUM is required for Autopilot-only capabilities.
- irreversible actions must be explicitly confirmed unless a valid Premium
  rule authorizes automation for a capability that is technically supported.
- provider redirect is never marked `COMPLETED` solely because a redirect opened.

## POST /v1/actions/:id/confirm

Confirms an action that requires explicit user approval.

## POST /v1/actions/:id/complete-user-step

User reports that a provider-routed or guided action was completed.
The action should remain subject to later verification where available.

## GET /v1/savings

Returns estimated and verified savings separately.

## GET /v1/autopilot/rules
## POST /v1/autopilot/rules
## PATCH /v1/autopilot/rules/:id

PREMIUM only.
