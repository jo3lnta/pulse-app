# PULSE — personal health dashboard

PULSE is a static web app with Supabase email/password accounts, private measurement history and daily Apple Health imports. Open https://jo3lnta.github.io/pulse-app/ or install it with Safari > Share > Add to Home Screen on iPhone. This web installation is separate from an App Store download.

## Health sync

In Profile, create a revocable connection key and follow [the Apple Shortcuts guide](docs/apple-health.html). Daily submissions update by metric/date without duplicates. Manual entries remain separate. The dashboard refreshes on sign-in, when returning to the tab and every minute while visible. Health migration `health_shortcuts` has been applied to the live Supabase project, version `20261106150739`.

## Authentication and email

The reported `email rate limit exceeded` failure was confirmed in Auth logs. Public sign-up and password recovery still require production SMTP and a verified sender; see [email configuration](docs/auth-setup.html). Email confirmation has not been disabled. Client fixes clarify quota/credential errors, keep password recovery state, and open a successful session independently of data sync failures.

The deployed `pulse-delete-account` endpoint allows each signed-in user to delete only their own account after confirmation. It verifies the user and revokes sessions before permanent deletion. Deployment did not delete any existing account.

## Native iPhone app

A SwiftUI/HealthKit app and release instructions are prepared in [the native app review branch](https://github.com/jo3lnta/pulse-app/tree/codex/apple-health-auto-log/ios). It is not yet published in the App Store. Apple Developer enrollment, signing, production SMTP, real device tests and Apple review remain necessary.

## Validation

Run `node tests/auth.test.cjs`, `node tests/health-sync.test.cjs`, `node tests/delete-account.test.mjs`. The live smoke test (`node tests/live-auth-smoke.mjs`) checks Auth reachability and anonymous deletion rejection without creating accounts, sending emails or deleting data. GitHub Actions also applies the Health migration and tests it on a disposable PostgreSQL database.

Publish the repository root. `PULSE-WebApp/` is a legacy snapshot.
