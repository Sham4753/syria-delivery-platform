# Syria Delivery — Priority Gap Analysis

## Firebase initialization

All three Flutter applications now call `WidgetsFlutterBinding.ensureInitialized()` before Firebase setup and guard initialization with `Firebase.apps.isEmpty`. Initialization failures are no longer swallowed: the app shows a clear Firebase startup screen with a retry action instead of starting an app that later crashes with `[core/no-app]`.

The project still requires the deployment-specific Firebase configuration or emulator flags supplied by the build environment. No credentials are embedded in source.

## Live tracking

The courier app already writes the courier's current `GeoPoint` and active-order tracking documents. The customer order screen already listens to `tracking/{orderId}` and renders the latest courier position on an OpenStreetMap map. This iteration preserves that flow and focuses on initialization reliability.

## Auto-dispatch

The Cloud Function now evaluates all available couriers in the order zone that have a current location and selects the nearest courier to the vendor location. It stores the selected courier and calculated dispatch distance in the order's `dispatch_candidates`, `dispatch_status`, and `dispatch_distance_km` fields.

## Product modifiers

Merchants can create and edit add-ons using one `name:price` entry per line. Customers are prompted for each available add-on when adding a product, and the selected modifiers and adjusted price are stored in the cart and order items.

## Wallets and commissions

Courier wallets and order commission calculations were already present in the project. The new account-creation callable also initializes a wallet with zero debt, a credit limit of 100, and zero balance/earnings for newly created couriers.

## Validation limits

The admin dashboard builds successfully and the Functions source passes Node syntax validation. Flutter analysis was not run because the sandbox does not contain the Flutter SDK; it should be run in the target Flutter build environment before release.

## Production polish added in the final iteration

The courier and merchant apps now play a repeating system alert while unclaimed/new orders are present and stop the alert after the queue is cleared. The backend calculates and stores an initial `eta_minutes` estimate from preparation time plus a driving allowance, and the customer order screen displays it. The customer home screen now links to order history with one-tap reorder. Finally, the admin orders table can invoke the protected `overrideDispatch` callable to manually assign an available courier in an exceptional case.

## Full configuration engine release

The admin dashboard now includes a master configuration screen for distance pricing tiers, zone-specific vendor/courier commissions, home banners, section ordering, featured vendors, and audit history. The customer home screen consumes banner, featured-vendor, and busy-mode settings from Firestore.

The operations map now supports right-click quick actions, draggable vendor/courier markers, draggable draft boundary points, geocoded search, and map-based vendor/courier location updates. Merchant operations now support product CRUD, deletion, categories, image URLs, single/multiple modifiers, required/optional modifier flags, daily opening hours, and a busy-mode switch.

Vendor and courier document changes are recorded by Cloud Functions in `audit_logs`. Firestore rules restrict audit history reads to administrators and prevent updates/deletion of existing records.
