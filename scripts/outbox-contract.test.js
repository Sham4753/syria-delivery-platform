const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('customer_app/lib/services/order_outbox.dart', 'utf8');

assert(
  /onlyKey\s*==\s*null\s*&&\s*item\[['"]blocked['"]\]\s*==\s*true/.test(source),
  'Public outbox flush must skip blocked items',
);
assert(
  /remaining\.add\(item\);\s*\n\s*continue;/.test(source),
  'Skipped blocked items must remain queued',
);
assert(
  /static Future<void> retryBlocked/.test(source),
  'Blocked items must be retried explicitly through retryBlocked',
);

console.log('outbox blocked-item contract tests passed');
