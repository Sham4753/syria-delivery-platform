const assert = require('assert');
const fs = require('fs');
const {
  CHANNELS,
  normalizeReference,
  referenceHash,
  referenceReservationId,
  buildManualTransferSettings,
  assertAmountWithinChannel,
} = require('../functions/manual-transfer');
const {manualTransferLedgerEntries, bankTransferLedgerEntries} = require('../functions/financial-ledger');

assert.deepStrictEqual(CHANNELS, ['bank_transfer', 'syriatel_cash', 'sham_cash']);
assert.strictEqual(normalizeReference('  ab-١٢٣٤  '), 'AB-1234');
assert.strictEqual(referenceHash('ab-1234'), referenceHash(' AB-١٢٣٤ '));
assert.match(referenceReservationId('syriatel_cash', 'AB-1234'), /^syriatel_cash_[a-f0-9]{64}$/);
assert.throws(() => normalizeReference('abc'), /مرجع/);
assert.throws(() => normalizeReference('AB 1234'), /مرجع/);

const legacy = buildManualTransferSettings({bank_transfer: {
  enabled: true,
  requires_manual_review: true,
  display_name_ar: 'تحويل بنكي',
  bank_name: 'مصرف تجريبي',
  account_holder: 'حساب المقاصة',
  account_number_masked: '****1234',
  currency: 'SYP',
  instructions_ar: 'حوّل ثم أرسل المرجع',
}});
assert.strictEqual(legacy.manual_transfer.channels.bank_transfer.enabled, true);
assert.match(legacy.manual_transfer.channels.bank_transfer.account_label, /مصرف تجريبي/);
assert.strictEqual(legacy.manual_transfer.channels.syriatel_cash.enabled, false);
const configured = buildManualTransferSettings({manual_transfer: {channels: {
  syriatel_cash: {enabled: true, display_name: 'سيريتل كاش', account_label: 'وجهة سيريتل', instructions: 'تعليمات', min_amount: 100, max_amount: 500},
  sham_cash: {enabled: true, display_name: 'شام كاش', account_label: 'وجهة شام', instructions: 'تعليمات', min_amount: 50, max_amount: 1000},
}}});
assert.strictEqual(configured.manual_transfer.channels.syriatel_cash.min_amount, 100);
assert.doesNotThrow(() => assertAmountWithinChannel(100, configured.manual_transfer.channels.syriatel_cash));
assert.doesNotThrow(() => assertAmountWithinChannel(500, configured.manual_transfer.channels.syriatel_cash));
assert.throws(() => assertAmountWithinChannel(99, configured.manual_transfer.channels.syriatel_cash), /حدود/);
assert.throws(() => assertAmountWithinChannel(501, configured.manual_transfer.channels.syriatel_cash), /حدود/);
assert.throws(() => buildManualTransferSettings({manual_transfer: {channels: {sham_cash: {min_amount: 10, max_amount: 1}}}}), /حدود/);

for (const channel of CHANNELS) {
  const entries = manualTransferLedgerEntries({paymentId: 'pay_1', orderId: 'order_1', amount: 125, channel, actorId: 'admin_1'});
  assert.strictEqual(entries[0].account, channel === 'bank_transfer' ? 'bank_clearing' : `${channel}_clearing`);
  assert.strictEqual(entries[1].account, 'customer_receivable');
  assert.strictEqual(entries[0].entry_group_id, entries[1].entry_group_id);
}
assert.strictEqual(bankTransferLedgerEntries({paymentId: 'pay_1', orderId: 'order_1', amount: 1})[0].account, 'bank_clearing');

// نموذج حجز ذري صغير يطابق عقد tx.create: أول فائز فقط يحجز المرجع.
class ReferenceStore {
  constructor() { this.records = new Map(); }
  async reserve(channel, reference, paymentId) {
    const id = referenceReservationId(channel, reference);
    await new Promise((resolve) => setImmediate(resolve));
    if (this.records.has(id)) return this.records.get(id).payment_id === paymentId ? 'idempotent' : 'duplicate';
    this.records.set(id, {payment_id: paymentId, channel, reference_hash: referenceHash(reference)});
    return 'reserved';
  }
  release(channel, reference) { this.records.delete(referenceReservationId(channel, reference)); }
}
(async () => {
  const store = new ReferenceStore();
  const race = await Promise.all(Array.from({length: 20}, (_, i) => store.reserve('sham_cash', 'RACE-1234', `pay_${i}`)));
  assert.strictEqual(race.filter((value) => value === 'reserved').length, 1, 'سباق الحجز يجب أن ينتج فائزًا واحدًا');
  assert.strictEqual(race.filter((value) => value === 'duplicate').length, 19);
  assert.strictEqual(await store.reserve('sham_cash', 'RACE-1234', 'pay_0'), 'idempotent');
  assert.strictEqual(await store.reserve('syriatel_cash', 'RACE-1234', 'pay_other'), 'reserved', 'المرجع نفسه مسموح في قناة أخرى');
  store.release('sham_cash', 'RACE-1234');
  assert.strictEqual(await store.reserve('sham_cash', 'RACE-1234', 'pay_new'), 'reserved', 'إعادة المحاولة تحرر الحجز القديم');

  const source = fs.readFileSync(require('path').join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const rules = fs.readFileSync(require('path').join(__dirname, '..', 'firestore.rules'), 'utf8');
  assert.match(source, /reference_attempts: FieldValue\.increment\(1\)/);
  assert.match(source, /attempts >= 3/);
  assert.match(source, /review_started_at/);
  assert.match(source, /tx\.create\(reservationRef/);
  assert.match(source, /tx\.delete\(db\.doc\(`manual_transfer_references/);
  assert.match(source, /action: 'manual_transfer_review'/);
  assert.match(source, /reason \|\| null/);
  assert.match(source, /notifyUser\(reviewedPayment\.customer_id/);
  assert.match(source, /exports\.createBankTransferIntent = exports\.createManualTransferIntent/);
  assert.match(source, /exports\.submitBankTransferProof = exports\.submitManualTransferProof/);
  assert.match(source, /exports\.reviewBankTransfer = exports\.reviewManualTransfer/);
  assert.match(rules, /match \/databases\/{database}\/documents/);
  assert(!/match \/manual_transfer_references\//.test(rules), 'manual_transfer_references يجب أن تبقى مرفوضة بالقاعدة الافتراضية');
  console.log('Manual transfer tests passed: normalization, duplicate/channel isolation, concurrent reservation, bounds, retry, idempotency, legacy compatibility, ledger accounts, and default-deny rules.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
