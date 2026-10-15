# PWA Version Visibility and Safe Auto-Update Design

**Date:** 2026-08-16  
**Status:** Approved design, manual-update extension implemented

## Goal

Make the installed web app on iOS Safari and Android browsers reliably show which frontend build is running and automatically converge to a newly deployed build without interrupting an active session.

This work also removes upstream-oriented profile actions from the Marka UI and replaces the remaining future product surfaces with non-clickable `Coming soon` placeholders.

## Current state

The web build already derives `SERVER_VERSION` from the Git commit when possible and exposes the same value to the client as `NEXT_PUBLIC_SERVICE_WORKER_BUILD_VERSION`.

`ServiceWorkerRegistration` registers a build-versioned worker URL:

```text
/sw.js?v=<build>
```

with `updateViaCache: "none"` and scope `/`.

The worker uses that build value to namespace shell and thumbnail caches and deletes older shell caches on activation. It currently does not provide an explicit runtime update lifecycle, does not surface update readiness, and does not call `skipWaiting()`.

The fork also already exposes the live server build through `GET /api/version`.

Desktop currently shows the server build in `SidebarVersion`. Mobile has no equivalent version display. The profile dropdown still contains upstream Karakeep links and an upstream social link.

## Product decisions

### Version meaning

The UI must distinguish the frontend build currently running in the browser from the build currently deployed on the server.

The normal state shows the running frontend build. If the server has moved ahead, the UI must additionally show the newer deployed build and whether its worker is available or already installed and waiting.

### Mobile placement

Mobile build information belongs at the bottom of the profile dropdown, not in the floating bottom navigation and not as a permanent header control.

Desktop keeps its existing sidebar placement.

### Automatic update policy

Marka uses a hybrid update policy:

1. Check for a newer deployed build on initial document load.
2. Check again whenever an existing document returns to the foreground.
3. Download and install a newer worker silently when one is available.
4. Never reload the document merely because an update was discovered or finished installing during that document's lifetime.
5. Activate a waiting update on the next safe fresh load or refresh, through an explicit `Update now` action, or allow the browser to activate it naturally after all old clients close.
6. The profile build row exposes compact manual refresh and `Update now` actions. No modal or toast is required for the normal update path.

A running session must not be replaced mid-edit.

### Profile cleanup

Remove the upstream social/X row entirely.

Replace the upstream app and documentation links with Marka-owned, non-clickable future-feature rows:

- `Apps & extensions` with `Coming soon`
- `Documentation` with `Coming soon`

The new visible strings must use the existing web i18n system.

## Architecture

### PWA lifecycle provider

Refactor the current one-way service-worker registration component into a small client-side PWA lifecycle provider mounted under `SessionProvider`.

This provider owns two related responsibilities:

1. Existing service-worker/session responsibilities:
   - register the worker;
   - synchronize the current authenticated user ID with the worker for document-cache scoping;
   - clear private caches when the session becomes unauthenticated;
   - record thumbnail-use messages.
2. New build/update responsibilities:
   - expose the running app build;
   - fetch the latest deployed server build;
   - install a worker for a newer deployed build;
   - track whether an update is available, installing, waiting, blocked from activation, or current;
   - perform a controlled activation handoff only when eligible.

App-shell update state must remain separate from offline-library synchronization state. The PWA lifecycle provider must not own IndexedDB bookmark synchronization, mutation replay, conflict handling, or offline replica freshness.

### Build identities

The provider tracks:

- `appBuild`: the build compiled into the currently running frontend bundle. Use the existing public build-time value rather than an SSR server value so this remains the identity of the browser code that is actually executing.
- `deployedBuild`: the latest build returned by `GET /api/version`.
- `workerBuild`: the target build encoded in the registered or waiting worker URL when known.

The UI must never label `deployedBuild` as the currently running build unless it equals `appBuild`.

### Why the live version endpoint is required

Calling `registration.update()` alone is insufficient for this fork's current versioned worker URL.

An old frontend bundle keeps using its compiled URL, for example:

```text
/sw.js?v=old-build
```

Calling `registration.update()` would therefore continue checking that old worker script URL. It would not discover that a newly deployed frontend expects:

```text
/sw.js?v=new-build
```

The client must first learn the live deployed commit from `/api/version`, then register the versioned worker URL for that deployed commit on the existing `/` scope. Re-registering the same scope with a changed script URL updates the existing registration rather than creating a second independent app scope.

### Version endpoint request

The version check is best-effort and must bypass HTTP caching.

Use a same-origin request to `/api/version` with a no-store cache policy. The existing service worker already treats ordinary API requests as network-only, so the version response must represent the live server when the network is reachable.

A failed version check must not block application startup, authentication, offline-library reads, or existing cached navigation behavior.

## Update lifecycle

### Initial document load

On provider mount:

1. Read the current service-worker registration for scope `/`.
2. Record whether a waiting worker already existed before this document initiated any new update work.
3. If a waiting worker already existed, the document is eligible to request the safe activation handoff described below.
4. Register the worker corresponding to `appBuild` if no suitable registration exists yet.
5. Fetch `/api/version` with no-store semantics.
6. If `deployedBuild` differs from `appBuild`, register `/sw.js?v=<deployedBuild>` on scope `/`.
7. Observe installation state changes and expose them to UI consumers.

A worker that becomes waiting because of step 6 is not force-activated during the same document. It remains ready for the next safe handoff.

### Checks after startup

Automatically check once on a fresh document load, including a reload, new tab, or cold installed-PWA launch. Client-side navigation, returning to an existing tab, and resuming an already open PWA do not initiate another check.

Further checks are user initiated through the version control. A newly discovered build installs in the background and remains ready for manual activation or a later safe load.

Deduplicate manual checks while a previous check is still in progress.

### Natural activation after full close

If all clients using the old worker close, the browser may activate the waiting worker normally. The next PWA launch then starts under the new worker without a forced reload.

This is the preferred path for a phone user who fully closes the installed PWA after the update has already downloaded.

### Controlled activation on fresh load or refresh

If a waiting worker already existed before the current document began update discovery, the provider may request activation.

Send an `ACTIVATE_UPDATE` message to the waiting worker. The waiting worker must check whether force-activation is safe before calling `skipWaiting()`.

A newly discovered waiting worker in the current document is not eligible. This distinction prevents an update from downloading and immediately reloading the session that discovered it.

### Multi-client safety

Before honoring `ACTIVATE_UPDATE`, the waiting worker checks same-origin window clients, including uncontrolled clients when needed for safety.

Force-activation is allowed only when the requesting document is the sole relevant window client using the old app lifecycle.

If other browser tabs, windows, or installed-PWA clients remain open, the worker does not call `skipWaiting()`. It reports that activation is blocked, and the UI changes to `Close other tabs to update` with a retry action rather than forcing another client onto a new worker underneath an old document.

Once the other clients close, one of two things happens:

- the browser naturally activates the waiting worker when no old clients remain; or
- the remaining client performs another fresh load or refresh and can retry the controlled handoff.

### Handoff and single reload

When safe activation is approved:

1. The waiting worker calls `skipWaiting()`.
2. Existing worker activation cleanup runs.
3. The new active worker calls `clients.claim()` as it does today.
4. The browser document receives `controllerchange`.
5. The provider reloads the current document exactly once so the new frontend bundle and new worker are aligned.

Use a per-navigation or session-storage loop guard so `controllerchange` cannot cause repeated reloads.

A `controllerchange` caused by unrelated first-time registration must not trigger the update reload path unless the provider has explicitly armed the handoff.

## UI states

### Shared build presentation

Both desktop and mobile consume the same PWA lifecycle state.

Normal state:

```text
absolutepraya/marka
Build b3f8690
```

If the server has a different build but its worker is not yet waiting:

```text
Build a81d211
Update available · b3f8690
```

If the new worker is waiting:

```text
Build a81d211
Update ready · b3f8690
```

If activation is temporarily blocked by another open client, show `Close other tabs to update` with a retry action. This makes the blocking condition actionable without forcing another client onto a new worker underneath an old document.

Version-check failures do not show a scary error state. The user keeps the current build display and the app retries at the next normal lifecycle trigger.

### Manual update extension

The build row is a horizontal space-between status control:

```text
Build abc1234  [git icon]                         Up to date  [refresh icon]
Build abc1234  [git icon]                         Update now  [download icon]
```

The refresh action performs an immediate no-store `/api/version` check and service-worker update attempt. It shows `Checking...` while active and `Check failed` when the request cannot complete.

The `Update now` action appears only when a valid newer deployed build has a matching waiting worker. It activates that worker and reloads after `controllerchange`. If another window blocks activation, the status becomes `Close other tabs to update` and remains retryable.

Invalid or missing build identities show `Build unknown` with `Update unavailable`; they never produce an update action or notification dot.

The green update dot appears on the profile avatar whenever a valid newer deployed build is known, including while the replacement worker is installing or waiting.

### Desktop

Keep the existing bottom-left sidebar version area.

Refactor `SidebarVersion` so the displayed build comes from the shared PWA lifecycle state rather than treating the current live server build as the browser build.

The repository label and running build SHA remain linkable to `absolutepraya/marka` and the corresponding GitHub commit when the value is a valid SHA.

### Mobile

Add a compact version footer at the bottom of the existing profile dropdown.

The footer should use the same repository/build component or shared presentation logic as desktop where practical, with mobile-appropriate spacing. Do not add another persistent icon to the header or bottom navigation.

### Profile future features

In the shared profile menu:

- remove `Follow upstream Karakeep on X` completely;
- replace the upstream apps link with a disabled `Apps & extensions` row and `Coming soon` secondary text or trailing label;
- replace the upstream documentation link with a disabled `Documentation` row and `Coming soon` secondary text or trailing label.

The rows must have disabled semantics and must not retain hidden upstream hrefs.

## Service-worker changes

Extend the worker message protocol with update lifecycle messages while preserving the current cache/session messages.

At minimum:

- client to waiting worker: `ACTIVATE_UPDATE`;
- waiting worker to requesting client when force-activation cannot proceed because other clients exist: an activation-blocked acknowledgement;
- existing `CLEAR_USER_CACHES`, `SET_DOCUMENT_CACHE_SESSION`, and `THUMBNAIL_USED` behavior remains unchanged.

The worker keeps its existing versioned cache naming and activation cleanup behavior.

Do not purge IndexedDB or offline mutation state during a normal app-shell update.

## Error handling and degradation

1. No service-worker support: the web app continues normally and shows the running build without auto-update state.
2. Offline version check: keep the current app and retry on a later load or foreground event.
3. Malformed or unknown server version: ignore it for update targeting rather than registering an arbitrary worker URL.
4. Worker registration failure: preserve the current worker and current app session.
5. Installation failure: preserve the current worker and retry on a later lifecycle trigger.
6. Multiple open clients: do not force activation.
7. Controller handoff reload failure: normal browser reload behavior applies; no destructive local-data recovery is attempted.
8. Logout remains a privacy boundary. Existing private-cache clearing must continue to work after the provider refactor.

## Security and correctness constraints

- Treat the live version endpoint as same-origin deployment metadata, not as arbitrary script input.
- Validate the returned build identifier before interpolating it into a worker URL. The deployed fork normally uses a Git SHA, so accept the repository's expected build identifier format and fall back safely for development environments.
- Keep worker scope `/` unchanged.
- Keep API and RSC requests network-only under the worker.
- Do not weaken logout cache clearing, authenticated navigation-session scoping, or offline-library ownership checks.
- Do not mix app-shell update state with user data authority or synchronization state.

## Testing

### PWA lifecycle provider

Add or update focused tests covering:

- registration with the current app build;
- no-store deployed-version fetch on initial load;
- no repeat deployed-version fetch during client-side navigation, foregrounding, or history restoration;
- a new deployed-version fetch on a fresh app load or manual check;
- no duplicate check while one is already in flight;
- detecting a newer deployed commit;
- registering `/sw.js?v=<deployedBuild>` for that commit;
- `Update available` while a target worker is installing;
- `Update ready` when the target worker is waiting;
- not force-activating a worker that became waiting during the current document;
- requesting activation when a worker was already waiting before a fresh document mounted;
- arming a reload only for an explicit update handoff;
- exactly one reload on the armed `controllerchange` path;
- harmless version-fetch and registration failures;
- preserving unauthenticated cache-clearing behavior;
- preserving session ID synchronization to the active worker;
- preserving thumbnail-use message handling.

### Service worker

Extend worker tests to cover:

- `ACTIVATE_UPDATE` calls `skipWaiting()` only when the requester is the sole relevant window client;
- activation is refused when another relevant window client exists;
- activation-blocked acknowledgement reaches the requester;
- existing cache versioning and old-shell cleanup remain correct;
- existing user-cache clearing remains correct.

### UI

Cover:

- desktop shows the running app build rather than incorrectly substituting a newer server build;
- desktop shows update availability/readiness when builds differ;
- mobile profile footer shows the same build/update state;
- valid SHAs link to the fork commit;
- upstream apps, docs, and social URLs are absent from the profile menu;
- `Apps & extensions` and `Documentation` render as disabled `Coming soon` features;
- new profile strings use translated keys.

### Device acceptance

Record real-device checks for at least:

- Safari-installed iPhone PWA;
- an Android installed PWA from a supported browser.

Acceptance scenarios:

1. Install/open build A and confirm the UI reports build A.
2. Deploy build B while build A remains open.
3. Foreground build A and confirm build B is discovered and installed without interrupting the session.
4. Confirm the UI reports build A plus `Update ready · B` once the new worker waits.
5. Fully close and reopen the PWA and confirm it runs build B, or refresh a sole remaining client and confirm one controlled handoff reload reaches build B.
6. Repeat with another app tab open and confirm refreshing one client does not force the other client under the new worker.
7. Repeat a version check while offline and confirm the current app remains usable.

## Documentation

Keep the existing offline-PWA design aligned with this lifecycle. Its rule that app-shell updates activate on the next PWA open and do not replace a running app mid-edit remains valid, but the implementation details should point to this design where useful.

Update relevant operator or contributor documentation only if the implementation introduces a new build variable, deployment requirement, or validation command. Do not duplicate mechanics already documented in `AGENTS.md`.

## Out of scope

- Native Expo app versioning or over-the-air updates.
- Browser-extension update behavior.
- Release notes or changelog UX.
- User-selectable update channels.
- Manual rollback from the client.
- Background polling while a document stays hidden.
- Periodic update prompts or notifications.
- Changing the deployment model or Watchtower behavior.
- Replacing Git commit identifiers with semantic application versions.

## Success criteria

The work is successful when:

- an installed mobile PWA clearly exposes the frontend commit it is actually running;
- desktop and mobile report the same running-build truth;
- an old installed PWA discovers a newly deployed commit without relying on its old compiled worker URL;
- the new worker downloads automatically on open, refresh, or foreground checks;
- discovery and installation never unexpectedly reload the active session;
- a waiting update takes over on a later safe load or after old clients close;
- multi-client sessions are not force-upgraded underneath old documents;
- normal offline behavior and private cached data rules remain intact;
- upstream profile links and social surfaces are removed;
- Marka future-feature rows are visible as `Coming soon` and are not clickable.
