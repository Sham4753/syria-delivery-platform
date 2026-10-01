const assert = require('assert');
const {
  normalizeProviderConfig,
  signPayload,
  verifySignature,
  providerEvent,
  providerStatusForEvent,
  providerLedgerEntries,
} = require('../functions/payment-provider');

assert.deepStrictEqual(normalizeProviderConfig({provider_id: 'demo_provider', environment: 'sandbox', enabled: true}), {provider_id: 'demo_provider', environment: 'sandbox', enabled: true, currency: 'SYP', webhook_secret_ref: 'env:PAYMENT_WEBHOOK_SECRET'});
assert.throws(() => normalizeProviderConfig({provider_id: 'bad provider'}));
const body = Buffer.from('{"id":"evt_1"}');
const signature = signPayload(body, 'secret');
assert.strictEqual(verifySignature(body, signature, 'secret'), true);
assert.strictEqual(verifySignature(body, signature, 'wrong'), false);
const event = providerEvent({id: 'evt_1', type: 'payment.paid', data: {provider_reference: 'ref_1', amount: 12500, currency: 'SYP'}});
assert.strictEqual(event.providerReference, 'ref_1');
assert.strictEqual(providerStatusForEvent(event.type), 'paid');
const reversed = providerLedgerEntries({paymentId: 'p1', orderId: 'o1', amount: 12500, currency: 'SYP', status: 'refunded', providerReference: 'ref_1'});
assert.strictEqual(reversed[0].account, 'customer_receivable');
assert.strictEqual(reversed[1].account, 'provider_clearing');
assert.strictEqual(reversed[0].amount, reversed[1].amount);
console.log('Payment provider tests passed.');
