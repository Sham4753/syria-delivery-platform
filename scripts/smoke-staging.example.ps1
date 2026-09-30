# Copy this file to smoke-staging.local.ps1 and fill in staging-only test values.
# Do not commit the copied local file or any API keys/passwords.

$env:SMOKE_TARGET = "staging"
$env:GCLOUD_PROJECT = "YOUR_STAGING_PROJECT_ID"
$env:SMOKE_AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_WEB_API_KEY"
$env:SMOKE_CALLABLE_URL = "https://us-central1-YOUR_STAGING_PROJECT_ID.cloudfunctions.net/createOrder"
$env:SMOKE_FIRESTORE_URL = "https://firestore.googleapis.com/v1/projects/YOUR_STAGING_PROJECT_ID/databases/(default)/documents"
$env:SMOKE_TEST_PASSWORD = "YOUR_STAGING_TEST_PASSWORD"
$env:SMOKE_CUSTOMER_EMAIL = "staging-customer-01@example.test"
$env:SMOKE_OTHER_CUSTOMER_EMAIL = "staging-customer-02@example.test"
$env:SMOKE_VENDOR_EMAIL = "staging-vendor@example.test"

# Never set SMOKE_ATOMICITY_TEST for staging.
node scripts/smoke-order.js
