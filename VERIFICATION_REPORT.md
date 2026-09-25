# Syria Delivery Performance and Production Audit

## Implemented in this pass

The customer app now uses a strict three-second Firestore timeout for initial system configuration and vendor/menu queries. Successful responses are cached with `shared_preferences`; when the network or emulator does not answer, the app reads the last cached JSON data and renders a bounded offline state instead of leaving an endless spinner. Product streams also terminate with a user-facing offline message after the same timeout.

The admin dashboard now cancels the Firebase auth listener on unmount, ignores stale asynchronous authorization responses, times out profile authorization checks after five seconds, and explicitly returns unsubscribe functions for vendor, audit-log, and settings listeners. This prevents route changes from retaining active subscriptions or applying state after a page has been replaced.

The admin control center now exposes minimum order value, primary and secondary theme colors, delivery pricing tiers, Google/Facebook/WhatsApp OTP and guest-shopping flags, app logo uploads, and banner uploads. Browser-side image processing converts uploaded images to WebP, scales and recompresses them to a maximum target of 150KB, uploads them with long-lived immutable cache headers, and records asset URLs in local browser storage for low-bandwidth re-entry.

## Validation

| Check | Result |
|---|---|
| Admin dashboard lint | Passed, 0 errors; 4 non-blocking warnings remain |
| Admin dashboard production build | Passed; 96 modules transformed |
| JSON configuration | Passed for `firebase.json` and `firestore.indexes.json` |
| Cloud Functions syntax | Passed with `node --check functions/index.js` |
| Dart structural check | Passed bracket-balance scan across 22 files |
| Flutter compile/analyze | Not available in this sandbox because Flutter/Dart SDK is missing |
| Live Firebase/device flows | Not run because no configured project/device is available |

The remaining lint warnings concern an existing Fast Refresh export, an unused map import, one synchronous effect state update, and a deliberately minified source file. They do not block the production build.


## Emulator startup fix

The Windows launcher was corrected after a startup race was observed: it previously proceeded after Firestore accepted connections while Auth was still unavailable, causing `ECONNREFUSED 127.0.0.1:9099` during demo seeding. It now waits for Firestore (`8080`), Auth (`9099`), and Functions (`5001`) to accept TCP connections before running the seed script, then retries seeding up to 15 times with a two-second warm-up delay between attempts.

The corrected launcher was checked for the new readiness and retry branches. JSON, JavaScript, and Dart structural validation passed, and the admin dashboard production build passed again.
