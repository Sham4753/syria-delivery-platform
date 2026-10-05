const LEDGER_DIRECTIONS = new Set(['debit', 'credit']);
const PAYMENT_STATUSES = new Set(['created', 'awaiting_customer_action', 'pending_verification', 'pending_provider', 'authorized', 'paid', 'refund_pending', 'refunded', 'failed', 'rejected']);
const {clearingAccountForChannel} = require('./manual-transfer');

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

function buildBalancedPair({entryGroupId, amount, currency, sourceType, sourceId, actorId, orderId, paymentId, settlementId, debitAccount, creditAccount, metadata}) {
  return [
    buildLedgerEntry({entryId: `${entryGroupId}_debit`, entryGroupId, account: debitAccount, direction: 'debit', amount, currency, sourceType, sourceId, actorId, orderId, paymentId, settlementId, metadata}),
    buildLedgerEntry({entryId: `${entryGroupId}_credit`, entryGroupId, account: creditAccount, direction: 'credit', amount, currency, sourceType, sourceId, actorId, orderId, paymentId, settlementId, metadata}),
  ];
}

function assertBalancedEntries(entries) {
  const totals = new Map();
  for (const entry of entries) {
    const key = `${entry.entry_group_id}:${entry.currency}`;
    const signed = entry.direction === 'debit' ? entry.amount : -entry.amount;
    totals.set(key, Math.round(((totals.get(key) || 0) + signed) * 100) / 100);
  }
  for (const [key, total] of totals) {
    if (total !== 0) throw new Error(`Unbalanced ledger group: ${key}`);
  }
  return true;
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

function manualTransferLedgerEntries({paymentId, orderId, amount, currency = 'SYP', actorId, channel = 'bank_transfer'}) {
  const entries = buildBalancedPair({
    entryGroupId: `manual_transfer_${channel}_${paymentId}_paid`,
    amount,
    currency,
    sourceType: 'manual_transfer_review',
    sourceId: paymentId,
    debitAccount: clearingAccountForChannel(channel),
    creditAccount: 'customer_receivable',
    actorId,
    orderId,
    paymentId,
    metadata: {review: 'manual', immutable: true},
  });
  assertBalancedEntries(entries);
  return entries;
}

function changeToWalletLedgerEntries({orderId, amount, currency = 'SYP', actorId, customerId, courierId}) {
  const entries = buildBalancedPair({
    entryGroupId: `change_to_wallet_${orderId}`,
    amount,
    currency,
    sourceType: 'change_to_wallet',
    sourceId: orderId,
    actorId,
    orderId,
    debitAccount: 'courier_cash_receivable',
    creditAccount: 'customer_wallet_liability',
    metadata: {customer_id: customerId, courier_id: courierId, immutable: true},
  });
  assertBalancedEntries(entries);
  return entries;
}

function commissionLedgerEntries({orderId, vendorId, amount, currency = 'SYP', rate, actorId}) {
  if (!(Number(amount) > 0)) return [];
  const entries = buildBalancedPair({
    entryGroupId: `commission_${orderId}`,
    amount,
    currency,
    sourceType: 'order_commission',
    sourceId: orderId,
    actorId,
    orderId,
    debitAccount: 'vendor_commission_receivable',
    creditAccount: 'platform_revenue',
    metadata: {vendor_id: vendorId, rate, immutable: true},
  });
  assertBalancedEntries(entries);
  return entries;
}

function settlementApplication({remitted, currentDebt, variance = 0, writeOffShortage = false}) {
  const actualRemitted = money(remitted);
  const debt = money(currentDebt);
  const applied = Math.min(actualRemitted, debt);
  const shortage = Math.max(0, -Number(variance || 0));
  const writeOff = writeOffShortage ? Math.min(shortage, Math.max(0, debt - applied)) : 0;
  const overpayment = Math.max(0, actualRemitted - applied);
  return {
    remitted: actualRemitted,
    currentDebt: debt,
    applied: money(applied),
    shortage: money(shortage),
    writeOff: money(writeOff),
    overpayment: money(overpayment),
    reviewNeeded: overpayment > 0,
    remainingDebt: money(debt - applied - writeOff),
  };
}

function settlementDecision({countedCash, openingCash, currentDebt, variance = 0, writeOffShortage = false}) {
  const counted = Number(countedCash || 0);
  const opening = Number(openingCash || 0);
  const rawRemitted = counted - opening;
  if (!Number.isFinite(rawRemitted)) throw new Error('Invalid counted or opening cash');
  const remitted = Math.max(0, rawRemitted);
  const shortage = Math.max(0, -Number(variance || 0));
  const writeOffAllowed = writeOffShortage === true && rawRemitted >= 0;
  const application = settlementApplication({remitted, currentDebt, variance, writeOffShortage: writeOffAllowed});
  const reviewReason = application.reviewNeeded ? 'overpayment' : (rawRemitted < 0 && shortage > 0 ? 'below_opening' : null);
  return {
    ...application,
    rawRemitted,
    writeOffAllowed,
    writeOffApplied: application.writeOff,
    reviewNeeded: reviewReason !== null,
    reviewReason,
  };
}

function settlementLedgerEntries({settlementId, remitted, currentDebt, variance = 0, currency = 'SYP', actorId, ownerId, writeOffShortage = false}) {
  const application = settlementApplication({remitted, currentDebt, variance, writeOffShortage});
  const entries = [];
  if (application.remitted > 0 && application.applied > 0) {
    entries.push(...buildBalancedPair({
      entryGroupId: `settlement_${settlementId}_remittance`,
      amount: application.applied,
      currency,
      sourceType: 'shift_cash_remittance',
      sourceId: settlementId,
      actorId,
      settlementId,
      debitAccount: 'cash_on_hand',
      creditAccount: 'courier_cash_receivable',
      metadata: {owner_id: ownerId, remitted: application.remitted, applied: application.applied, immutable: true},
    }));
  }
  if (application.overpayment > 0) {
    entries.push(...buildBalancedPair({
      entryGroupId: `settlement_${settlementId}_overpayment`,
      amount: application.overpayment,
      currency,
      sourceType: 'shift_cash_overpayment',
      sourceId: settlementId,
      actorId,
      settlementId,
      debitAccount: 'cash_on_hand',
      creditAccount: 'courier_overpayment_payable',
      metadata: {owner_id: ownerId, variance, review_needed: true, immutable: true},
    }));
  }
  if (application.writeOff > 0) {
    entries.push(...buildBalancedPair({
      entryGroupId: `settlement_${settlementId}_shortage_writeoff`,
      amount: application.writeOff,
      currency,
      sourceType: 'shift_cash_shortage_writeoff',
      sourceId: settlementId,
      actorId,
      settlementId,
      debitAccount: 'cash_variance_loss',
      creditAccount: 'courier_cash_receivable',
      metadata: {owner_id: ownerId, variance, write_off: true, immutable: true},
    }));
  }
  assertBalancedEntries(entries);
  return entries;
}

const bankTransferLedgerEntries = (args) => manualTransferLedgerEntries({...args, channel: 'bank_transfer'});

module.exports = {
  LEDGER_DIRECTIONS,
  PAYMENT_STATUSES,
  money,
  buildLedgerEntry,
  buildBalancedPair,
  assertBalancedEntries,
  assertPaymentTransition,
  manualTransferLedgerEntries,
  bankTransferLedgerEntries,
  changeToWalletLedgerEntries,
  commissionLedgerEntries,
  settlementApplication,
  settlementDecision,
  settlementLedgerEntries,
};
