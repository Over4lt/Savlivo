# Savlivo MVP

Savlivo is a subscription-control layer for streaming services.

This repository is an MVP foundation with:

- PostgreSQL schema
- REST API contract
- entitlement model: VIEWER / MANUAL / PREMIUM
- capability engine
- action router
- mock provider adapters for:
  - Netflix direct billing
  - Max via Apple billing
  - Disney+ Premium/Autopilot flow
- React Native / Expo app placeholder
- clear boundary between provider-specific logic and product logic

## Repository layout

```text
savlivo-mvp/
  apps/
    mobile/                React Native / Expo client skeleton
  services/
    api/                   TypeScript API service
  packages/
    contracts/             Shared API/domain types
    provider-sdk/          Provider adapter interface + mock adapters
  db/
    schema.sql             PostgreSQL schema
  docs/
    api.md                 REST API contract
    architecture.md        System design
```

## Core execution types

- `DIRECT` — Savlivo can execute a supported action directly.
- `PROVIDER_REDIRECT` — user is routed to Apple / Google / Amazon / provider management.
- `GUIDED` — Savlivo guides the user through a verified manual flow.
- `UNSUPPORTED` — action is not currently supported.

## Plans

- `VIEWER`: can view dashboard and savings estimates.
- `MANUAL`: $19/year. Unlocks manual Pause / Cancel / Reactivate controls.
- `PREMIUM`: $39/year. Adds Autopilot, scheduling and Watchlist Optimizer.

## Safety principle

Savlivo must never pretend an action happened when it only redirected the user.
Every requested action gets an auditable action record.

## Local development

The code here is a clean MVP skeleton rather than a production deployment.
Use Node.js 20+, PostgreSQL 15+ and TypeScript 5+.

Start by applying `db/schema.sql`, then implement the API handlers in
`services/api/src/server.ts` against your chosen Postgres client.

## Current runnable milestone

This version now includes:

- PostgreSQL repository layer using `pg`
- email/password authentication with scrypt password hashing
- signed JWT bearer tokens
- protected subscription endpoints
- action-preview and action-record endpoints
- Docker Compose PostgreSQL
- Expo / React Native MVP client
- demo onboarding via account creation + demo subscriptions

### Quick start

```bash
cp .env.example .env
docker compose up -d postgres
export DATABASE_URL=postgres://savlivo:savlivo@localhost:5432/savlivo
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/migrations/002_auth.sql

npm install
npm run api:dev
```

In another shell:

```bash
export EXPO_PUBLIC_API_URL=http://localhost:3000
npm run mobile:start
```

For a physical phone, point `EXPO_PUBLIC_API_URL` to your computer's LAN IP rather than localhost.

### Important

The provider adapters remain mocks. No real Netflix, Disney+, Max, Apple, Google,
or Amazon account is modified by this code.

## Billing and provider-routing milestone

This version adds:

- annual product IDs for Manual and Premium
- server-owned entitlement updates after purchase verification
- a pluggable `StoreVerifier` interface
- mock purchase verification for local MVP testing
- purchase event audit table
- Apple / Google Play / Amazon provider routing helpers
- React Native paywall for $19/year and $39/year plans
- provider deep-link handling in the mobile client

### Production replacements required

The current `MockStoreVerifier` must be replaced before release:

- iOS: App Store Server API / signed transaction verification
- Android: Google Play Developer API purchase verification

The app must never grant Premium based solely on a client-side purchase callback.
