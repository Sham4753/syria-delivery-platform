const assert = require('assert');
const {
  assertBalancedEntries,
  bankTransferLedgerEntries,
  buildBalancedPair,
  assertPaymentTransition,
  changeToWalletLedgerEntries,
  commissionLedgerEntries,
  settlementDecision,
  settlementLedgerEntries,
} = require('../functions/financial-ledger');

function accountBalances(entries) {
  return entries.reduce((balances, entry) => {
    const signed = entry.direction === 'debit' ? entry.amount : -entry.amount;
    balances[entry.account] = Math.round(((balances[entry.account] || 0) + signed) * 100) / 100;
    return balances;
  }, {});
}

function assertSettlementCase(name, input, expected) {
  const decision = settlementDecision(input);
  const entries = settlementLedgerEntries({
    settlementId: `settlement_${name}`,
    actorId: 'admin_1',
    ownerId: 'courier_1',
    remitted: decision.remitted,
    currentDebt: input.currentDebt,
    variance: input.variance,
    writeOffShortage: decision.writeOffAllowed,
  });
  assert.doesNotThrow(() => assertBalancedEntries(entries), `${name} must balance`);
  assert.deepStrictEqual(decision, expected.decision, `${name} decision result`);
  assert.deepStrictEqual(accountBalances(entries), expected.balances, `${name} final account balances`);
  return entries;
}

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
]) {
  assert.doesNotThrow(() => assertBalancedEntries(entries));
  assert.strictEqual(entries.reduce((sum, entry) => sum + (entry.direction === 'debit' ? entry.amount : -entry.amount), 0), 0);
}

assertSettlementCase('shortage', {countedCash: 90, openingCash: 0, currentDebt: 100, variance: -10}, {
  decision: {remitted: 90, currentDebt: 100, applied: 90, shortage: 10, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 10, rawRemitted: 90, writeOffAllowed: false, writeOffApplied: 0, reviewReason: null},
  balances: {cash_on_hand: 90, courier_cash_receivable: -90},
});
assertSettlementCase('shortage_writeoff', {countedCash: 90, openingCash: 0, currentDebt: 100, variance: -10, writeOffShortage: true}, {
  decision: {remitted: 90, currentDebt: 100, applied: 90, shortage: 10, writeOff: 10, overpayment: 0, reviewNeeded: false, remainingDebt: 0, rawRemitted: 90, writeOffAllowed: true, writeOffApplied: 10, reviewReason: null},
  balances: {cash_on_hand: 90, courier_cash_receivable: -100, cash_variance_loss: 10},
});
assertSettlementCase('overage_debt100', {countedCash: 110, openingCash: 0, currentDebt: 100, variance: 10}, {
  decision: {remitted: 110, currentDebt: 100, applied: 100, shortage: 0, writeOff: 0, overpayment: 10, reviewNeeded: true, remainingDebt: 0, rawRemitted: 110, writeOffAllowed: false, writeOffApplied: 0, reviewReason: 'overpayment'},
  balances: {cash_on_hand: 110, courier_cash_receivable: -100, courier_overpayment_payable: -10},
});
assertSettlementCase('overage_debt200', {countedCash: 110, openingCash: 0, currentDebt: 200, variance: 10}, {
  decision: {remitted: 110, currentDebt: 200, applied: 110, shortage: 0, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 90, rawRemitted: 110, writeOffAllowed: false, writeOffApplied: 0, reviewReason: null},
  balances: {cash_on_hand: 110, courier_cash_receivable: -110},
});
assertSettlementCase('full_remittance', {countedCash: 100, openingCash: 0, currentDebt: 100, variance: 0}, {
  decision: {remitted: 100, currentDebt: 100, applied: 100, shortage: 0, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 0, rawRemitted: 100, writeOffAllowed: false, writeOffApplied: 0, reviewReason: null},
  balances: {cash_on_hand: 100, courier_cash_receivable: -100},
});
assertSettlementCase('counted_below_opening', {countedCash: 30, openingCash: 50, currentDebt: 100, variance: -20, writeOffShortage: true}, {
  decision: {remitted: 0, currentDebt: 100, applied: 0, shortage: 20, writeOff: 0, overpayment: 0, reviewNeeded: true, remainingDebt: 100, rawRemitted: -20, writeOffAllowed: false, writeOffApplied: 0, reviewReason: 'below_opening'},
  balances: {},
});
assertSettlementCase('debt_less_than_expected', {countedCash: 100, openingCash: 0, currentDebt: 60, variance: 0}, {
  decision: {remitted: 100, currentDebt: 60, applied: 60, shortage: 0, writeOff: 0, overpayment: 40, reviewNeeded: true, remainingDebt: 0, rawRemitted: 100, writeOffAllowed: false, writeOffApplied: 0, reviewReason: 'overpayment'},
  balances: {cash_on_hand: 100, courier_cash_receivable: -60, courier_overpayment_payable: -40},
});

console.log('Financial ledger tests passed: pure settlement decisions and all remittance cases.');
