const assert = require('assert');
const {
  bankTransferLedgerEntries,
  buildBalancedPair,
  assertPaymentTransition,
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
console.log('Financial ledger tests passed.');
