const test = require('node:test');
const assert = require('node:assert/strict');
const {isVendorOpen, safeReference} = require('../src/domain');

test('opening hours are evaluated in Damascus time and support overnight windows', () => {
  const open = {opening_hours: {open: '18:00', close: '02:00'}};
  assert.equal(isVendorOpen(open, new Date('2026-01-01T20:00:00Z')), true); // 23:00 Damascus
  assert.equal(isVendorOpen(open, new Date('2026-01-01T22:00:00Z')), true); // 01:00 next day in Damascus
  assert.equal(isVendorOpen(open, new Date('2026-01-01T10:00:00Z')), false);
});

test('wallet references cannot escape a document id', () => {
  assert.equal(safeReference(' ab/c '), null);
  assert.equal(safeReference('VOUCHER-123'), 'VOUCHER-123');
});
