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
