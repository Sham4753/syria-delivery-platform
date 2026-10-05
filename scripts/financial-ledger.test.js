const assert = require('assert');
const {
  bankTransferLedgerEntries,
  buildBalancedPair,
  assertPaymentTransition,
  assertBalancedEntries,
  changeToWalletLedgerEntries,
  commissionLedgerEntries,
  settlementLedgerEntries,
} = require('../functions/financial-ledger');

const entries = bankTransferLedgerEntries({paymentId: 'pay_123', orderId: 'order_123', amount: 125, currency: 'SYP', actorId: 'admin_1'});
assert.strictEqual(entries.length, 2);
assert.strictEqual(entries[0].direction, 'debit');
assert.strictEqual(entries[1].direction, 'credit');
assert.strictEqual(entries[0].amount, entries[1].amount);
assert.strictEqual(entries[0].entry_group_id, entries[1].entry_group_id);
assert.strictEqual(entries[0].payment_id, 'pay_123');
assert.strictEqual(entries[0].account, 'bank_clearing');
assert.strictEqual(entries[1].account, 'customer_receivable');
assert.throws(() => buildBalancedPair({entryGroupId: 'x', amount: 0, sourceType: 'test', sourceId: 'x', debitAccount: 'a', creditAccount: 'b'}));
assert.doesNotThrow(() => assertPaymentTransition('awaiting_customer_action', 'pending_verification'));
assert.doesNotThrow(() => assertPaymentTransition('pending_verification', 'paid'));
assert.throws(() => assertPaymentTransition('paid', 'pending_verification'));
assert.throws(() => assertPaymentTransition('pending_verification', 'paid_again'));
for (const entries of [
  changeToWalletLedgerEntries({orderId: 'order_1', amount: 25, actorId: 'admin_1', customerId: 'customer_1', courierId: 'courier_1'}),
  commissionLedgerEntries({orderId: 'order_1', vendorId: 'vendor_1', amount: 10, rate: 5}),
  settlementLedgerEntries({settlementId: 'settlement_1', amount: 100, variance: -5, actorId: 'admin_1', ownerId: 'courier_1'}),
]) {
  assert.doesNotThrow(() => assertBalancedEntries(entries));
  assert.strictEqual(entries.reduce((sum, entry) => sum + (entry.direction === 'debit' ? entry.amount : -entry.amount), 0), 0);
}
assert.deepStrictEqual(settlementLedgerEntries({settlementId: 'settlement_2', amount: 10, variance: 0}).map((entry) => entry.entry_group_id), ['settlement_settlement_2_remittance', 'settlement_settlement_2_remittance']);
console.log('Financial ledger tests passed.');
