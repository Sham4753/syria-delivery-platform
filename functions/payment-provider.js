const crypto = require('crypto');

const PROVIDER_EVENTS = new Set(['payment.authorized', 'payment.paid', 'payment.failed', 'payment.refunded']);
const PROVIDER_STATUSES = new Set(['pending_provider', 'authorized', 'paid', 'failed', 'refund_pending', 'refunded']);

function normalizeProviderConfig(input = {}) {
  const providerId = String(input.provider_id || 'none').trim().toLowerCase();
  const environment = String(input.environment || 'sandbox').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(providerId)) throw new Error('Invalid provider id');
  if (!['sandbox', 'production'].includes(environment)) throw new Error('Invalid provider environment');
  return {provider_id: providerId, environment, enabled: input.enabled === true, currency: String(input.currency || 'SYP').trim().toUpperCase(), webhook_secret_ref: 'env:PAYMENT_WEBHOOK_SECRET'};
}

function signPayload(rawBody, secret) {
  return crypto.createHmac('sha256', String(secret || '')).update(rawBody).digest('hex');
}

function verifySignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = signPayload(rawBody, secret);
  const actual = String(signature).replace(/^sha256=/, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(actual)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

function providerEvent(input = {}) {
  const id = String(input.id || input.event_id || '').trim();
  const type = String(input.type || input.event_type || '').trim();
  const data = input.data && typeof input.data === 'object' ? input.data : input;
  const reference = String(data.provider_reference || data.payment_reference || data.reference || '').trim();
  const amount = Number(data.amount);
  const currency = String(data.currency || '').trim().toUpperCase();
  if (!id || !PROVIDER_EVENTS.has(type) || !reference || !Number.isFinite(amount) || amount <= 0 || !currency) throw new Error('Invalid provider event');
  return {id, type, providerReference: reference, amount, currency, raw: input};
}

function providerStatusForEvent(type) {
  return {'payment.authorized': 'authorized', 'payment.paid': 'paid', 'payment.failed': 'failed', 'payment.refunded': 'refunded'}[type];
}

function providerLedgerEntries({paymentId, orderId, amount, currency, actorId, status, providerReference}) {
  const group = `provider_${paymentId}_${status}`;
  const debitAccount = status === 'refunded' ? 'customer_receivable' : 'provider_clearing';
  const creditAccount = status === 'refunded' ? 'provider_clearing' : 'customer_receivable';
  return [
    {entry_id: `${group}_debit`, entry_group_id: group, account: debitAccount, direction: 'debit', amount, currency, source_type: `provider_${status}`, source_id: paymentId, order_id: orderId, payment_id: paymentId, actor_id: actorId, metadata: {provider_reference: providerReference}},
    {entry_id: `${group}_credit`, entry_group_id: group, account: creditAccount, direction: 'credit', amount, currency, source_type: `provider_${status}`, source_id: paymentId, order_id: orderId, payment_id: paymentId, actor_id: actorId, metadata: {provider_reference: providerReference}},
  ];
}

module.exports = {PROVIDER_EVENTS, PROVIDER_STATUSES, normalizeProviderConfig, signPayload, verifySignature, providerEvent, providerStatusForEvent, providerLedgerEntries};
