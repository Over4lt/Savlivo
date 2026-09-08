# iOS warning audit — d14b608

## Scope and result

Starting HEAD d14b608, branch build10-final, tracked tree clean; unrelated untracked `.htaccess` untouched. No application/configuration/dependency changes were justified. **READY — NO ACTIONABLE SAVLIVO WARNINGS REMAIN**, within this unsigned Release compilation audit. This is not signed archive validation, App Store acceptance or a claim that every dependency warning is harmless.

Xcode 26.6 (17F113), iPhoneOS 26.5 SDK, arm64, Release, deployment target 15.1, Swift 5 setting, Hermes, Expo 54 / React Native 0.81.5. Bundle ID com.thomashodne.savlivo and native build 12 unchanged. Existing workspace and shared Savlivo scheme were used; ArchiveAction also selects Release. No EAS production command was used (that profile has autoIncrement).

## Reproduction and evidence

```sh
xcodebuild -workspace apps/mobile/ios/Savlivo.xcworkspace -scheme Savlivo \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/savlivo-warning-audit-clean \
  CODE_SIGNING_ALLOWED=NO build > /tmp/savlivo-warning-clean.log 2>&1
```

The initial sandbox attempt failed accessing Xcode services (exit 66); the authorized native builds succeeded. No provisioning update, signed archive, upload or device installation was attempted. Signing warnings cannot be assessed with signing disabled.

First fresh-derived-data build: success, 1,903 warning occurrences observed. Repeated incremental build: success, 61 occurrences. A second separate fresh-derived-data build: success, **1,852 occurrences / 636 distinct diagnostic lines**. No source/config changed between them. Differences reflect compilation/cache emission, not fixes. Do not report the incremental count or 51-occurrence difference as a reduction achieved by cleanup. Shared compiler caches are not necessarily reset by a fresh DerivedData directory.

The complete final unfiltered log is `/tmp/savlivo-warning-clean.log`; SHA-256 is recorded in [ios-warnings-d14b608.json](ios-warnings-d14b608.json). That inventory retains every exact warning diagnostic (workspace/DerivedData prefixes and App Intents timestamp normalized), source location where emitted, count, owner and classification. Raw logs remain local because Xcode prints build environment information; they are not committed. The first log was reused by the incremental run; the separate final full log is the retained reproducible baseline. No production code was changed before or after any capture.

## Classification and disposition

A = Savlivo-actionable; B = safely dependency-actionable without upgrade; C = generated/dependency/toolchain, documented; D = potentially risky, requires review before changing. Final counts: **A 0, B 0, C 1,719, D 133**. D is deliberately conservative; a successful compilation is not evidence of safe execution for every path.

| Group | Occurrences | Owner / disposition / future removal |
|---|---:|---|
| Umbrella headers missing included headers | 1,020 | CocoaPods/React Native prebuilt module packaging. C. Compilation succeeded. Fix requires upstream module packaging correction and tested dependency integration; do not hand-edit generated umbrellas. |
| Other native compiler diagnostics | 751 | Expo modules, React Native/screens/safe-area, datetimepicker, OpenIAP and generated Pod headers. C or D per exact inventory. Details below. |
| Hermes undeclared runtime globals | 54 | Hermes compiler of the generated bundle, including application Intl use and dependency globals. D pending runtime-context checks, not evidence each global is absent. Do not add fake declarations/polyfills or disable all warnings. Future compiler/runtime integration or source feature-guard correction only after a reproduced runtime failure. |
| Empty archive object members | 24 | Apple libtool/dependency category or generated state objects: `has no symbols`. C; successful final link. Upstream object packaging could omit these; not a reason to delete source/category objects locally. |
| Hermes replacement script missing outputs | 1 | React Native hermes-engine podspec. C. Script intentionally selects Debug/Release engine on build; inventing an output stamp risks stale engine reuse. Upstream supported dependency-analysis metadata can remove it; no local Pods patch. |
| App Intents metadata | 1 | Xcode: `Metadata extraction skipped. No AppIntents.framework dependency found.` C. No App Intents feature is configured; do not add a framework/feature solely to silence this. Toolchain behavior may change. |
| Metro cache | 1 | `Bundler cache is empty, rebuilding (this may take a minute)`. C. Expected fresh build work, not application defect. Warm cache removes it without a code change. |

The inventory distinguishes exact native warning texts and files. Main native families and release significance:

- Nullability, documentation/deprecation annotation mismatches, deprecated APIs, unused values/functions, optional coercion/interpolation, and Objective-C category/property annotations: upstream-owned. Leave documented; local changes could alter API bridging or lifecycle behavior. Future targeted dependency/SDK maintenance, not deployment-target increase or global suppression.
- Swift generic parameter shadowing and Expo Router non-final Sendable exception: explicitly future Swift 6 errors. Current build passes in its existing language configuration. Do not opt into Swift 6 during this task; review supported Expo updates before doing so.
- React Native prebuilt Yoga non-portable include case: packaging risk for case-sensitive build environments. Current local build succeeds; a different host filesystem needs rehearsal. Requires upstream casing/package correction rather than changes to Savlivo's deployment target.
- Expo `DynamicDataType.swift:14` always-failing `type is Data.Type`: actual upstream suspicious comparison, inspected in source. Do not replace it with guessed equality semantics in node_modules. Needs upstream fix and typed-array conversion regression tests; no Savlivo runtime failure demonstrated here.
- Integer narrowing, unhandled switch/protocol implementations, incompatible pointers/non-null arguments, undeclared selectors and duplicate category definitions: flagged D in the inventory. Review upstream/runtime paths before changing; successful build alone does not clear these. Device acceptance should exercise navigation, notifications, PDF/file sharing and purchase flows.
- Hermes global diagnostics include ordinary runtime APIs (Intl, timers, fetch) and dependency feature-detection names. They are not native Savlivo source errors. Validate representative amount/date formatting and navigation on the actual Release runtime; do not infer runtime availability solely from these compiler diagnostics.

No actionable deployment-target, duplicate-resource, Savlivo Swift/Objective-C, or privacy-manifest warning was observed in this build. This does not substitute for signed archive/export/App Store privacy checks. Savlivo's generated Expo/bundle phases already explicitly run every build and emit notes, not missing-output warnings; preserve their behavior. Hermes podspec was inspected: its configuration replacement script has no output declaration, so simply inventing a cached output is unsafe.

## Validation and preservation

- Three authorized unsigned Release builds passed (fresh, incremental, separate fresh-derived-data).
- `node --import tsx --test apps/mobile/lib/*.test.ts`: **107 passed**, zero failed/skipped, including existing browser tests.
- `./node_modules/.bin/tsc --noEmit -p apps/mobile/tsconfig.json`: passed.
- From apps/mobile: `npx expo export --platform ios --output-dir /tmp/savlivo-warning-hermes`: passed; 1,291 modules, 3.66 MB iOS Hermes bundle.
- No shared/API code changed; API tests were not rerun for this documentation-only audit.
- Native project, Podfile/lock, generated Pods, dependencies, app config, build/version, markets/pricing/catalog/AI/manual subscription/multi-country/PDF/reminder/entitlement/browser behavior, analytics/admin gates and passkeys were not edited.

No warning suppression or warning-driven production fix was applied. Only this report and the exact diagnostic inventory are committed. Nothing pushed/deployed/merged; no migrations; `.htaccess` untouched.

Before release, perform separately authorized signed archive validation and physical Release/TestFlight acceptance, especially amount/date formatting, file/PDF sharing, reminders, screen navigation, purchases and system-browser return confirmation. SDK/dependency updates require a separate reviewed task; none performed here.
