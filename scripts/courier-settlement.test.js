const assert = require('assert');
const {courierDebtForDeliveredOrder} = require('../functions/courier-settlement');

assert.strictEqual(
  courierDebtForDeliveredOrder({subtotal: 100000, delivery_fee: 10000, discount_amount: 20000, cash_due: 90000}),
  90000,
  'discounted COD orders must record the amount actually collected',
);
assert.strictEqual(
  courierDebtForDeliveredOrder({subtotal: 100000, delivery_fee: 10000, discount_amount: 0, wallet_amount: 30000, cash_due: 80000}),
  80000,
  'wallet-paid amounts must not be included in courier cash debt',
);
assert.strictEqual(
  courierDebtForDeliveredOrder({subtotal: 100000, delivery_fee: 10000, loyalty_points_used: 10000, cash_due: 100000}),
  100000,
  'loyalty-paid amounts must not be included in courier cash debt',
);
assert.strictEqual(courierDebtForDeliveredOrder({subtotal: 100000}), 0, 'missing cash_due must be safe');
assert.strictEqual(courierDebtForDeliveredOrder({cash_due: -5}), 0, 'negative cash_due must be clamped');

console.log('Courier settlement tests passed.');
