# Savlivo MVP Architecture

## Core principle

The user sees one consistent control layer. Provider complexity is isolated in adapters.

```text
React Native App
      |
      v
Savlivo API
      |
      +-- Identity & Entitlements
      +-- Subscription Registry
      +-- Capability Engine
      +-- Action Router
      +-- Savings Engine
      +-- Autopilot Engine
                     |
                     v
             Provider Adapters
```

## MVP proof cases

### 1. Netflix / direct billing
Expected route: DIRECT mock capability.
Purpose: proves Savlivo's direct-action UX.

### 2. Max / Apple billing
Expected route: PROVIDER_REDIRECT.
Purpose: proves provider-routing UX without claiming false automation.

### 3. Disney+ / direct billing
Expected route: DIRECT with Pause flagged Premium-only.
Purpose: proves entitlement gating and future Autopilot scheduling.

## Trust boundaries

- Mobile client is untrusted.
- Entitlements are verified server-side.
- Provider capabilities are determined server-side.
- Action history is append-oriented/auditable.
- Streaming account passwords are not stored in MVP.
- Browser automation is explicitly out of scope for MVP.

## Production components to add

- Postgres repository layer
- authentication
- StoreKit 2 receipt / transaction verification
- Google Play Billing verification
- encrypted secret management
- queue/worker for scheduled Autopilot jobs
- provider verification callbacks/polling where officially supported
- analytics and error monitoring
