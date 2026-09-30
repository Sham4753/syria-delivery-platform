// اختبارات نقية للدوال الجغرافية والرسم: node scripts/test-errand-geo.js
const assert = require('assert');
const {normalizePoint, pointInPolygon, pickZone, haversineKm, computeErrandFee} = require('../functions/geo');

const sq = (lat0, lng0, lat1, lng1) => [{lat: lat0, lng: lng0}, {lat: lat0, lng: lng1}, {lat: lat1, lng: lng1}, {lat: lat1, lng: lng0}];
const P = (latitude, longitude) => ({latitude, longitude});

// تطبيع النقاط
assert.deepStrictEqual(normalizePoint({lat: 33.5, lng: 36.3}), P(33.5, 36.3));
assert.deepStrictEqual(normalizePoint({latitude: 33.5, longitude: 36.3}), P(33.5, 36.3));
const callableAddress = {location: {latitude: 33.5, longitude: 36.3}};
assert.deepStrictEqual(normalizePoint(callableAddress.location), P(33.5, 36.3));
for (const bad of [null, undefined, 'x', {}, {latitude: '33', longitude: '36'}, {latitude: NaN, longitude: 1}, {latitude: 91, longitude: 0}, {latitude: 0, longitude: 181}, {latitude: Infinity, longitude: 0}]) {
  assert.strictEqual(normalizePoint(bad), null, `should reject ${JSON.stringify(bad)}`);
}

// نقطة داخل مضلع (مربع + شكل L مقعّر)
const square = sq(33, 36, 34, 37).map(normalizePoint);
assert.ok(pointInPolygon(P(33.5, 36.5), square));
assert.ok(!pointInPolygon(P(34.5, 36.5), square));
assert.ok(!pointInPolygon(P(33.5, 37.5), square));
const L = [P(0, 0), P(0, 10), P(5, 10), P(5, 5), P(10, 5), P(10, 0)];
assert.ok(pointInPolygon(P(2, 8), L));
assert.ok(pointInPolygon(P(8, 2), L));
assert.ok(!pointInPolygon(P(8, 8), L), 'the concave notch is outside');

// اختيار المنطقة: الأصغر عند التداخل، وتجاهل غير النشطة، وتجاهل المضلعات التالفة
const zones = [
  {id: 'big', polygon: sq(33, 36, 34, 37), active: true},
  {id: 'small', polygon: sq(33.4, 36.4, 33.6, 36.6), active: true},
  {id: 'off', polygon: sq(35, 36, 36, 37), active: false},
  {id: 'broken', polygon: [{lat: 1, lng: 1}], active: true},
];
assert.strictEqual(pickZone(P(33.5, 36.5), zones), 'small');
assert.strictEqual(pickZone(P(33.1, 36.1), zones), 'big');
assert.strictEqual(pickZone(P(35.5, 36.5), zones), null, 'inactive zone must not match');
assert.strictEqual(pickZone(P(40, 40), zones), null);

// المسافة (دمشق ← حمص تقريبًا 140 كم)
const km = haversineKm(P(33.5138, 36.2765), P(34.7324, 36.7137));
assert.ok(km > 130 && km < 150, `distance ${km}`);

// الرسم: نفس منطق createOrder
assert.strictEqual(computeErrandFee({zone: {delivery_fee_base: 10000}, config: {}, distanceKm: 5}).fee, 10000);
assert.strictEqual(computeErrandFee({zone: {delivery_fee_base: 10000, surge_multiplier: 1.5}, config: {surge_enabled: true, surge_multiplier: 2}}).fee, 30000);
assert.strictEqual(computeErrandFee({zone: {delivery_fee_base: 10000}, config: {surge_enabled: false, surge_multiplier: 5}}).fee, 10000, 'global surge only when enabled');
assert.strictEqual(computeErrandFee({zone: {delivery_fee_base: 1000}, config: {errand_fee_per_km: 500}, distanceKm: 4}).fee, 3000);
assert.strictEqual(computeErrandFee({zone: {delivery_fee_base: 1000}, config: {errand_min_fee: 5000}}).fee, 5000);
assert.strictEqual(computeErrandFee({zone: {}, config: {default_delivery_fee: 7000}}).fee, 7000, 'falls back to default fee');
assert.strictEqual(computeErrandFee({zone: {}, config: {}}).fee, 0, 'misconfigured fee is 0 (callable rejects it)');
console.log('geo tests passed');
