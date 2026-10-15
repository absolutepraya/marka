# Mobile startup verification

Issue #104 covers each fresh document load, including repeat visits and installed PWA launches. A responsive desktop viewport verifies layout, but does not verify a native platform launch screen or an installed application.

## Repeatable browser matrix

Build and serve the web app in production mode against a local test instance. Development mode deliberately unregisters service workers, so it cannot verify the cold offline fallback. Use the repository's Node 24.18.1 runtime for the server and test runner.

Supply a signed-in Playwright storage-state file belonging to that test instance:

```bash
MARKA_STARTUP_BASE_URL=http://localhost:3000 \
MARKA_STARTUP_STORAGE_STATE=/path/to/local-test-state.json \
MARKA_STARTUP_FAILURE_BASE_URL=http://localhost:3122 \
mise exec node@24.18.1 -- node scripts/startup-smoke.mjs
```

For the server-error case, run a second local production server on the failure URL with `DATA_DIR` pointing to an empty disposable directory and the same local authentication secret. This deliberately makes authenticated initialization fail without changing the working instance. Without `MARKA_STARTUP_FAILURE_BASE_URL`, the server-error case is omitted.

The runner exits unsuccessfully if any case fails. It writes a case report and loading/recovery screenshots under `.dev/startup/`. Set `MARKA_STARTUP_REPORT_DIR` to change the output directory, or `MARKA_STARTUP_CASE` to run only cases whose names contain that text.

The matrix covers signed-in and signed-out launches, both system themes, delayed JavaScript, unavailable fonts, fresh and repeat visits, fast redirects, direct protected and settings URLs, ordinary client navigation, history/resume events, saved theme overrides, reduced motion, viewport changes, failed JavaScript, stalled recovery and retry, desktop visibility, background requests that remain unfinished, fatal server initialization, and the service worker's cold offline root fallback. Service workers are blocked for controlled network-failure cases so cached JavaScript cannot bypass the injected delay; the offline case uses the real worker.

The startup stream test separately delays the real root layout's authentication provider and checks that branding, the status region and recovery script are sent before authentication completes. Service-worker tests verify that the new cold fallback returns only the public offline page and never another user's cached document. Existing update-activation and session-cache tests remain authoritative for those safety rules.

## Installed platform checks

Install from the browser's real installation flow. Close the installed app completely, then launch its home-screen icon. Record the browser/OS version, launch presentation, application loader, and interactive destination. Repeat in both themes, under a delayed connection, and offline. Returning to an already-loaded app must not replay the loader.

A fresh emulator may require initial OS/browser setup. Android's WebAPK installation through Google Play can require a signed-in Play account; a Chrome shortcut that opens a browser tab does not establish installed-PWA verification. iOS Simulator and Android Emulator results should be recorded as simulator/emulator evidence, separately from physical devices.

## Verification on 2026-10-14

- Production build, web typecheck and focused lint/format checks passed.
- All 43 startup, manifest and service-worker tests passed.
- All 12 browser matrix groups passed, including eight delayed launches across authentication, theme and repeat-visit combinations.
- The wider web suite passed 233 tests and failed eight unrelated keyboard-navigation tests. Running that test alone reproduced the missing `useRefreshBookmark` mock export. Its source and implementation were unchanged by this work.
- Android 16 / Chrome 133.0.6943.137 loaded the production sign-in screen. Native WebAPK installation reported Google Play `unknown_account`; the user chose to leave installed Android verification pending.
- iOS 27.0 / iPhone 17 Pro Simulator: installed through Safari with Open as Web App enabled. The native installation recorded `FullScreen=true` and the manifest start URL `/`. A launch with JavaScript delayed by eight seconds per request showed the platform-owned blank presentation, Marka loading status, slow-start recovery, then the usable sign-in form with working keyboard focus. After terminating `com.apple.webapp`, a repeat cold launch in dark mode also reached the interactive form. Returning from Home reused the same web-app process and usable screen. This verifies the signed-out installed path; authenticated launch combinations and offline behavior were verified in the browser matrix. No physical-device cold-launch result is claimed.
