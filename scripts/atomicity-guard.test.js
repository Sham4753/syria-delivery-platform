const assert = require('assert');
const {prepareCreateOrderPayload} = require('../functions/atomicity-guard');

const ordinary = {idempotency_key: 'smoke-order-unit-test'};
assert.throws(
  () => prepareCreateOrderPayload({...ordinary, __smoke_fail_after_order_write: true}, {functionsEmulator: false}),
  (error) => error.code === 'invalid-argument',
  'production-like mode must reject the smoke field',
);

const emulator = prepareCreateOrderPayload({...ordinary, __smoke_fail_after_order_write: true}, {functionsEmulator: true});
assert.strictEqual(emulator.shouldInjectFailure, true);
assert.strictEqual(Object.hasOwn(emulator.payload, '__smoke_fail_after_order_write'), false);
assert.strictEqual(emulator.payload.idempotency_key, ordinary.idempotency_key);

assert.throws(
  () => prepareCreateOrderPayload({__smoke_unknown: true}, {functionsEmulator: true}),
  (error) => error.code === 'invalid-argument',
  'unknown smoke fields must be rejected even in the emulator',
);

console.log('atomicity guard tests passed');
