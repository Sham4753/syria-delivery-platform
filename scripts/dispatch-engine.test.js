const assert = require('assert');
const {distanceKm, courierScore, rankCouriers} = require('../functions/dispatch-engine');

const pickup = {latitude: 33.5138, longitude: 36.2765};
assert(distanceKm(pickup, pickup) < 0.001);
const near = {id: 'near', current_location: pickup, updated_at: {toMillis: () => Date.now()}, active_orders: 0, debt: 0, credit_limit: 100};
const far = {id: 'far', current_location: {latitude: 33.60, longitude: 36.40}, updated_at: {toMillis: () => Date.now()}, active_orders: 1, debt: 80, credit_limit: 100};
assert(courierScore({courier: near, pickupPoint: pickup}).score < courierScore({courier: far, pickupPoint: pickup}).score);
const zeroLimit = courierScore({courier: {...near, credit_limit: 0, debt: 10}, pickupPoint: pickup});
assert(Number.isFinite(zeroLimit.score));
assert.strictEqual(zeroLimit.debtRatio, 0);
assert.deepStrictEqual(rankCouriers([far, near], {pickupPoint: pickup}).map((x) => x.id), ['near', 'far']);
assert.strictEqual(rankCouriers([{id: 'missing', current_location: null}], {pickupPoint: pickup}).length, 0);
console.log('Dispatch engine tests passed.');
