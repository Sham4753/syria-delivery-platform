# Demo Data Sources and Test Accounts

The emulator fixture adds 10 restaurants, 10 pharmacies, and 10 grocery stores in Damascus and Damascus countryside. The business names, public business phone numbers, and short public addresses were collected from public directory or business pages and are stored with each vendor as `source_url`. Directory addresses may be approximate and require field verification before any real commercial use.

The fixture also creates 10 synthetic courier accounts and 10 synthetic customer accounts. They use `@test.local` addresses and generated demo phone numbers; they are not real people and must not be used outside the local emulator.

## Demo credentials

The original four accounts remain:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@test.local` | `test123456` |
| Vendor | `vendor@test.local` | `test123456` |
| Courier | `courier@test.local` | `test123456` |
| Customer | `customer@test.local` | `test123456` |

Additional synthetic accounts follow the same password:

- Couriers: `courier01@test.local` through `courier10@test.local`
- Customers: `customer01@test.local` through `customer10@test.local`

## Local order smoke test

After the emulators are ready and the seed has completed, run from the repository root:

```bat
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
set GCLOUD_PROJECT=demo-syria-delivery
node scripts\smoke-order.js
```

The smoke test signs in as `customer01@test.local` and calls the local `createOrder` function with two products, hybrid payment, wallet contribution, loyalty points, and a COD change request. It does not contact a real payment provider or place a real-world order.

## Source links

Restaurant data uses public entries from Dalylak and the public Makoolat Al-Sham site. Pharmacy data uses the public Cybo Damascus directory. Grocery data uses public Dalel Syria entries, Cybo, and public business pages. These sources are preserved per record in `scripts/syria-business-fixtures.json`.
