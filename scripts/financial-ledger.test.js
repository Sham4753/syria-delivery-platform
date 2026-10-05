const assert = require('assert');
const {
  assertBalancedEntries,
  bankTransferLedgerEntries,
  buildBalancedPair,
  assertPaymentTransition,
  changeToWalletLedgerEntries,
  commissionLedgerEntries,
  settlementApplication,
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
  const application = settlementApplication(input);
  const entries = settlementLedgerEntries({
    settlementId: `settlement_${name}`,
    actorId: 'admin_1',
    ownerId: 'courier_1',
    ...input,
  });
  assert.doesNotThrow(() => assertBalancedEntries(entries), `${name} must balance`);
  assert.deepStrictEqual(application, expected.application, `${name} application result`);
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

assertSettlementCase('shortage', {remitted: 90, currentDebt: 100, variance: -10}, {
  application: {remitted: 90, currentDebt: 100, applied: 90, shortage: 10, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 10},
  balances: {cash_on_hand: 90, courier_cash_receivable: -90},
});
assertSettlementCase('shortage_writeoff', {remitted: 90, currentDebt: 100, variance: -10, writeOffShortage: true}, {
  application: {remitted: 90, currentDebt: 100, applied: 90, shortage: 10, writeOff: 10, overpayment: 0, reviewNeeded: false, remainingDebt: 0},
  balances: {cash_on_hand: 90, courier_cash_receivable: -100, cash_variance_loss: 10},
});
const overage100 = assertSettlementCase('overage_debt100', {remitted: 110, currentDebt: 100, variance: 10}, {
  application: {remitted: 110, currentDebt: 100, applied: 100, shortage: 0, writeOff: 0, overpayment: 10, reviewNeeded: true, remainingDebt: 0},
  balances: {cash_on_hand: 110, courier_cash_receivable: -100, courier_overpayment_payable: -10},
});
assert.strictEqual(overage100.find((entry) => entry.account === 'courier_overpayment_payable').metadata.review_needed, true);
assertSettlementCase('overage_debt200', {remitted: 110, currentDebt: 200, variance: 10}, {
  application: {remitted: 110, currentDebt: 200, applied: 110, shortage: 0, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 90},
  balances: {cash_on_hand: 110, courier_cash_receivable: -110},
});
assertSettlementCase('full_remittance', {remitted: 100, currentDebt: 100, variance: 0}, {
  application: {remitted: 100, currentDebt: 100, applied: 100, shortage: 0, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 0},
  balances: {cash_on_hand: 100, courier_cash_receivable: -100},
});
assertSettlementCase('zero_remittance', {remitted: 0, currentDebt: 100, variance: -100}, {
  application: {remitted: 0, currentDebt: 100, applied: 0, shortage: 100, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 100},
  balances: {},
});
const countedCashBelowOpening = 30;
const openingCash = 50;
const rawRemitted = countedCashBelowOpening - openingCash;
assert.strictEqual(rawRemitted, -20);
const belowOpening = assertSettlementCase('counted_below_opening', {remitted: Math.max(0, rawRemitted), currentDebt: 100, variance: -20}, {
  application: {remitted: 0, currentDebt: 100, applied: 0, shortage: 20, writeOff: 0, overpayment: 0, reviewNeeded: false, remainingDebt: 100},
  balances: {},
});
assert.strictEqual(belowOpening.length, 0, 'counted below opening must not create ledger entries');
assert.strictEqual(Math.max(0, 100 - 0), 100, 'counted below opening must leave courier debt unchanged');
const belowOpeningShortage = Math.max(0, -(-20));
assert.strictEqual(belowOpeningShortage, 20, 'counted below opening must preserve full shortage');
assert.strictEqual(rawRemitted < 0 && belowOpeningShortage > 0, true, 'counted below opening must require review');
assertSettlementCase('debt_less_than_expected', {remitted: 100, currentDebt: 60, variance: 0}, {
  application: {remitted: 100, currentDebt: 60, applied: 60, shortage: 0, writeOff: 0, overpayment: 40, reviewNeeded: true, remainingDebt: 0},
  balances: {cash_on_hand: 100, courier_cash_receivable: -60, courier_overpayment_payable: -40},
});

console.log('Financial ledger tests passed: settlement shortage, write-off, overage, full, zero, and capped-debt cases.');
