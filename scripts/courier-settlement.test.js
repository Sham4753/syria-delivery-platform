const assert = require('assert');
const {courierDebtForDeliveredOrder} = require('../functions/courier-settlement');

assert.strictEqual(
  courierDebtForDeliveredOrder({subtotal: 1000, delivery_fee: 100, discount_amount: 200, cash_due: 900}),
  900,
  'discounted COD orders must record the amount actually collected',
);
assert.strictEqual(
  courierDebtForDeliveredOrder({subtotal: 1000, delivery_fee: 100, discount_amount: 0, wallet_amount: 300, cash_due: 800}),
  800,
  'wallet-paid amounts must not be included in courier cash debt',
);
assert.strictEqual(
  courierDebtForDeliveredOrder({subtotal: 1000, delivery_fee: 100, loyalty_points_used: 10000, cash_due: 1000}),
  1000,
  'loyalty-paid amounts must not be included in courier cash debt',
);
assert.strictEqual(courierDebtForDeliveredOrder({subtotal: 1000}), 0, 'missing cash_due must be safe');
assert.strictEqual(courierDebtForDeliveredOrder({cash_due: -5}), 0, 'negative cash_due must be clamped');
assert.strictEqual(courierDebtForDeliveredOrder({cash_due: 500, status: 'delivered'}), 500, 'full delivery records collected COD');
assert.strictEqual(courierDebtForDeliveredOrder({cash_due: 0, status: 'delivered'}), 0, 'prepaid or partial cash collection cannot create debt');
assert.strictEqual(courierDebtForDeliveredOrder({cash_due: 250, status: 'cancelled'}), 250, 'settlement uses the server-calculated cash due');

console.log('Courier settlement tests passed.');
