const LEDGER_DIRECTIONS = new Set(['debit', 'credit']);
const PAYMENT_STATUSES = new Set(['created', 'awaiting_customer_action', 'pending_verification', 'pending_provider', 'authorized', 'paid', 'refund_pending', 'refunded', 'failed', 'rejected']);

function money(value) {
  const amount = Math.round(Number(value || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid monetary amount');
  return amount;
}

function assertNonEmpty(value, label) {
  const clean = String(value || '').trim();
  if (!clean) throw new Error(`${label} is required`);
  return clean;
}

function buildLedgerEntry({entryId, entryGroupId, account, direction, amount, currency = 'SYP', sourceType, sourceId, actorId = null, orderId = null, paymentId = null, settlementId = null, metadata = {}}) {
  if (entryId !== undefined) assertNonEmpty(entryId, 'entryId');
  if (!LEDGER_DIRECTIONS.has(direction)) throw new Error('Invalid ledger direction');
  const value = money(amount);
  if (value <= 0) throw new Error('Ledger amount must be positive');
  return {
    ...(entryId ? {entry_id: entryId} : {}),
    entry_group_id: assertNonEmpty(entryGroupId, 'entryGroupId'),
    account: assertNonEmpty(account, 'account'),
    direction,
    amount: value,
    currency: assertNonEmpty(currency, 'currency'),
    source_type: assertNonEmpty(sourceType, 'sourceType'),
    source_id: assertNonEmpty(sourceId, 'sourceId'),
    ...(actorId ? {actor_id: actorId} : {}),
    ...(orderId ? {order_id: orderId} : {}),
    ...(paymentId ? {payment_id: paymentId} : {}),
    ...(settlementId ? {settlement_id: settlementId} : {}),
    metadata,
  };
}

function buildBalancedPair({entryGroupId, amount, currency, sourceType, sourceId, debitAccount, creditAccount, actorId, orderId, paymentId, settlementId, metadata}) {
  return [
    buildLedgerEntry({entryId: `${entryGroupId}_debit`, entryGroupId, account: debitAccount, direction: 'debit', amount, currency, sourceType, sourceId, actorId, orderId, paymentId, settlementId, metadata}),
    buildLedgerEntry({entryId: `${entryGroupId}_credit`, entryGroupId, account: creditAccount, direction: 'credit', amount, currency, sourceType, sourceId, actorId, orderId, paymentId, settlementId, metadata}),
  ];
}

function assertPaymentTransition(from, to) {
  if (!PAYMENT_STATUSES.has(to)) throw new Error('Invalid payment status');
  const transitions = {
    created: ['awaiting_customer_action', 'pending_verification', 'pending_provider', 'failed'],
    awaiting_customer_action: ['pending_verification', 'failed'],
    pending_verification: ['paid', 'rejected', 'failed'],
    pending_provider: ['authorized', 'paid', 'failed'],
    authorized: ['paid', 'failed'],
    paid: ['refund_pending'],
    refund_pending: ['refunded', 'failed'],
    refunded: [],
    rejected: [],
    failed: [],
  };
  if (!transitions[String(from || 'created')]?.includes(to)) throw new Error(`Invalid payment transition: ${from} -> ${to}`);
}

function bankTransferLedgerEntries({paymentId, orderId, amount, currency = 'SYP', actorId}) {
  const group = `bank_transfer_${paymentId}_paid`;
  return buildBalancedPair({
    entryGroupId: group,
    amount,
    currency,
    sourceType: 'bank_transfer_manual_review',
    sourceId: paymentId,
    debitAccount: 'bank_clearing',
    creditAccount: 'customer_receivable',
    actorId,
    orderId,
    paymentId,
    metadata: {review: 'manual', immutable: true},
  });
}

module.exports = {LEDGER_DIRECTIONS, PAYMENT_STATUSES, money, buildLedgerEntry, buildBalancedPair, assertPaymentTransition, bankTransferLedgerEntries};
