# Savlivo Mobile

Recommended MVP stack:

- React Native
- Expo / EAS
- TypeScript
- native StoreKit 2 / Google Play Billing integration behind an entitlement service

Initial screens:

1. Welcome
2. Add streaming services
3. Select billing provider
4. Savings preview
5. Paywall
6. Dashboard
7. Action confirmation
8. Provider redirect / guided action
9. Action history
10. Premium Autopilot settings

The mobile app must never infer that a provider-side action succeeded merely
because the user returned from a deep link. Success should be confirmed by a
supported API, explicit user confirmation, or later verification.
