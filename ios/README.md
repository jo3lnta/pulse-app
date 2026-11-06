# PULSE for iPhone

Native SwiftUI application, iOS 17+, with email/password authentication, secure session storage in Keychain, manual measurements, history, HealthKit permission/consent and daily sync to the same Supabase account as the web app. No third-party iOS packages are required.

## Open and build

Open `Pulse.xcodeproj` in Xcode on macOS. Select an iPhone simulator and run the Pulse scheme. The project is checked in; `python3 generate-project.py` regenerates it after adding source files. GitHub Actions builds for iPhone without signing and tests interval aggregation on a simulator. A build without signing is not an App Store binary.

For a real iPhone, select your Apple development team in Signing & Capabilities. Confirm the bundle identifier (development default: `com.jo3lnta.pulse`) is registered to your team. Enable HealthKit and HealthKit Background Delivery on the App ID and provisioning profile. Reading Health requires a real supported device and explicit user permission. Neither permission authorization success nor an empty response proves that the user granted every metric.

Health observers register at launch for connected accounts. Delivery is best effort under iOS scheduling, not a continuous timer. The app also resends the last seven days when opened; values update by metric/date. Sleep intervals are merged to avoid counting overlapping stages or devices twice; each sample is attributed to the day it ends. Deletions in Apple Health are not propagated as removals of previously imported PULSE summaries in this version. Disconnecting preserves history. Creating a native Health connection rotates the existing Shortcut key, so disable the old automation when moving to native sync.

## Backend and rollout status

Health tables/RPC migration has been applied to the live PULSE Supabase project. The public registration/email recovery blocker is the unconfigured production email provider. Follow `docs/auth-setup.html`; do not disable email confirmation or embed an SMTP/admin key in the app.

Account removal code is included in `supabase/functions/pulse-delete-account/index.ts` and has mocked authorization tests. Automatic review blocked deployment, and the owner explicitly declined to activate the endpoint. It has NOT been deployed, and the removal buttons have been removed from both clients. Do not submit the iOS app before deploying and verifying this endpoint. It derives the target user from a verified session, revokes sessions, then deletes that user; foreign keys cascade the PULSE records.

## App Store release requirements

The owner confirmed that they do not yet have Apple Developer or App Store Connect access. No store listing, signed archive, TestFlight upload, review submission, or publication has taken place.

1. Enroll in the Apple Developer Program at https://developer.apple.com/programs/enroll/ and accept Apple's agreements yourself. Any membership fee is paid by the owner.
2. Register the final bundle identifier and enable HealthKit. Configure your team in Xcode and select a valid distribution signing identity/profile.
3. Configure the production email provider and allowed auth redirects in Supabase, and verify sign-up, confirmation, password sign-in and recovery with an external account on a real iPhone.
4. Implement an App Store compliant account-removal flow. The owner currently declined deployment of the prepared removal endpoint, so this is a release blocker. If that decision changes, deploy and test the endpoint before restoring its buttons. Test consent refusal, partial Health permissions, app relaunch, background delivery, offline recovery, session expiry, and account switching. Test with real Health data; simulator unit tests are not an end-to-end HealthKit test.
5. Review `docs/privacy.html` and add the owner's final legal identity/contact information before public store submission. Confirm the App Privacy questionnaire matches actual processing: linked email, user ID, health and fitness for app functionality; no tracking. Include technical diagnostics if retained by service providers. The privacy manifest is a starting disclosure, not a substitute for the App Store questionnaire.
6. Create the app record in App Store Connect. Use real device screenshots and a review account that works with production SMTP; select the intended countries and regions. Use the published privacy/support URLs below.
7. In Xcode: Product > Archive > Validate App > Distribute App > App Store Connect. Test via TestFlight, complete age rating/export compliance and submit for Apple's review. HealthKit entitlement and any further review questions must be resolved with Apple. Publication depends on approval.

Privacy URL: https://jo3lnta.github.io/pulse-app/docs/privacy.html
Support URL: https://jo3lnta.github.io/pulse-app/docs/support.html

Suggested listing copy (review before submission):

- Name: PULSE — Salud personal
- Subtitle: Tu historial de salud y hábitos
- Description: Consulta tus registros de pulso, variabilidad cardíaca, sueño y pasos. Añade mediciones manuales o conecta Apple Salud con tu permiso para sincronizar resúmenes diarios con tu cuenta PULSE. Controla la conexión desde Perfil. Las actualizaciones en segundo plano dependen de iOS. PULSE es un registro de bienestar y no ofrece diagnósticos ni consejo médico.
