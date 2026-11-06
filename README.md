# PULSE WebApp — Windows starter

## Run it
1. Download and extract `PULSE-WebApp.zip`.
2. Open the extracted folder.
3. Double-click `index.html` to launch it in Chrome or Edge.

No installation, account, server, or subscription is required.

## What works
- Responsive WHOOP-inspired dark dashboard.
- Overview, Recovery, Sleep, Activity, and Profile sections.
- Add manual heart-rate, HRV, sleep-duration, and step-count entries.
- Entries are saved locally in the browser using localStorage.
- Clear all locally stored entries from Profile.

## Important limitations
- This is a browser prototype. It does not read sensors from a Windows PC or iPhone.
- Do not enter guessed measurements. PULSE intentionally does not generate a recovery score from missing data.
- Health data stays in this browser profile; clearing browser site data may remove it.
- No medical diagnosis or training-readiness advice is provided.

## Next development steps
1. Add validated charts for logged measurements.
2. Add data export/import so entries can be moved between devices.
3. Later, connect supported health sources. Native Apple HealthKit access requires an iOS app and Apple's platform tooling; this Windows prototype cannot access it directly.

This PWA still cannot read Apple Health / HealthKit directly. That requires a native iOS app and a separate integration phase.


## Automatic Apple Health logging (iPhone Shortcuts)

The root application now includes a write-only Health ingestion API and account-scoped dashboard sync. This is an iPhone Shortcuts integration, not direct browser HealthKit access.

1. Apply `supabase/migrations/202611060001_health_shortcuts.sql` to the existing Supabase project (SQL editor or migrations workflow). It adds separate tables and RPC functions; it does not change existing manual entries.
2. Deploy the root static files, including `health-sync.js` and `docs/apple-health.html`.
3. In Profile, create a connection key, then follow [the iPhone setup guide](docs/apple-health.html) to build and enable a personal automation. iOS may require unlocking for Health access.

One daily value per metric/date is upserted, so retries do not duplicate records. Manual entries remain separate; imported records show their source. Health records are read on sign-in, when returning to the dashboard, and every minute while visible. Keys can be rotated or revoked from Profile and are stored hashed on the server. No user ID or administrator credential belongs in the Shortcut. Revocation retains history.

The legacy `PULSE-WebApp/` snapshot is unchanged. Publish from the repository root for this feature.

Validation: `node tests/health-sync.test.cjs` and `node --check app.js`, `node --check health-sync.js`, `node --check service-worker.js`. Run `tests/health-sync.sql` in a disposable Supabase database after the migration to verify ingestion, key revocation and account isolation; it rolls its fixtures back. End-to-end Health access must also be verified on a real iPhone.

## Authentication and iPhone app

Web authentication now opens a successful session independently of optional data synchronization, preserves password recovery state when the SDK consumes the URL hash, handles auth callbacks outside the SDK lock, prevents overlapping form submissions and displays actionable error messages. The reported error was confirmed in Auth logs as email quota failures. Production SMTP and a verified sender domain are still required; see [configuration instructions](docs/auth-setup.html). Email confirmation has not been disabled.

The repository includes a native SwiftUI iPhone app under [ios/](ios/README.md) with direct HealthKit integration. It is not published in the App Store. The owner still needs Apple Developer enrollment, signing, a real device validation pass and Apple's review. Account deletion source is prepared but its deployment needs specific approval after automatic review rejected it. Do not submit the app until the backend removal flow and production email have been activated and verified.

Run `node tests/auth.test.cjs`, `node tests/health-sync.test.cjs` and `node tests/delete-account.test.mjs`. The GitHub Actions workflow also runs disposable Postgres migration tests and an unsigned iOS build/simulator tests. See actual workflow results before claiming the iOS build passes.
