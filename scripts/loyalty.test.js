const assert = require('assert');
const {
  loyaltyPointsDivisor,
  loyaltyPointsForOrder,
  loyaltyDiscountForPoints,
} = require('../functions/loyalty');

assert.strictEqual(loyaltyPointsForOrder({subtotal: 250, discount: 0, rate: 1, config: {loyalty_points_divisor: 10}}), 25);
assert.strictEqual(loyaltyPointsForOrder({subtotal: 250, discount: 50, rate: 1, config: {loyalty_points_divisor: 10}}), 20);
assert.strictEqual(loyaltyPointsDivisor({}), 10, 'missing divisor defaults to 10');
assert.strictEqual(loyaltyPointsDivisor({loyalty_points_divisor: 0}), 10, 'zero divisor defaults to 10');
assert.strictEqual(loyaltyPointsDivisor({loyalty_points_divisor: -2}), 10, 'negative divisor defaults to 10');
assert.strictEqual(loyaltyPointsDivisor({loyalty_points_divisor: 1000001}), 10, 'oversized divisor defaults to 10');
assert.strictEqual(loyaltyDiscountForPoints(10, 0.1), 1, '10 points at 0.1 SYP per point equals 1 SYP');
assert.strictEqual(loyaltyDiscountForPoints(10, 0.1) / 100, 0.01, '1 SYP is 1% of a 100 SYP order');

console.log('Loyalty calculation tests passed.');
