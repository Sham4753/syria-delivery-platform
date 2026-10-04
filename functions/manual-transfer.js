const {createHash} = require('crypto');

const CHANNELS = ['bank_transfer', 'syriatel_cash', 'sham_cash'];
const DEFAULT_CHANNEL = {
  enabled: false,
  display_name: '',
  account_label: '',
  instructions: '',
  min_amount: 0,
  max_amount: 1000000000,
};

function normalizeArabicDigits(value) {
  return String(value || '').replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    const index = arabic.indexOf(digit);
    return String(index >= 0 ? index : persian.indexOf(digit));
  });
}

function normalizeReference(value) {
  const reference = normalizeArabicDigits(value).trim().toUpperCase();
  if (!/^[A-Z0-9._:/-]{4,80}$/.test(reference)) throw new Error('مرجع التحويل غير صالح');
  return reference;
}

function referenceHash(reference) {
  return createHash('sha256').update(normalizeReference(reference), 'utf8').digest('hex');
}

function referenceReservationId(channel, reference) {
  return `${channel}_${referenceHash(reference)}`;
}

function normalizeChannel(value) {
  const channel = String(value || 'bank_transfer').trim().toLowerCase();
  if (!CHANNELS.includes(channel)) throw new Error('قناة التحويل غير مدعومة');
  return channel;
}

function money(value) {
  const amount = Math.round(Number(value || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0) throw new Error('المبلغ غير صالح');
  return amount;
}

function validateChannelSettings(channel, value = {}) {
  const input = {...DEFAULT_CHANNEL, ...(value || {})};
  const minAmount = money(input.min_amount);
  const maxAmount = money(input.max_amount);
  if (minAmount > maxAmount) throw new Error(`حدود قناة ${channel} غير صالحة`);
  return {
    enabled: input.enabled === true,
    display_name: String(input.display_name || '').trim().slice(0, 100),
    account_label: String(input.account_label || '').trim().slice(0, 200),
    instructions: String(input.instructions || '').trim().slice(0, 1000),
    min_amount: minAmount,
    max_amount: maxAmount,
  };
}

function buildManualTransferSettings(input = {}) {
  const legacy = input.bank_transfer || {};
  const suppliedChannels = input.manual_transfer?.channels || {};
  const bankChannel = validateChannelSettings('bank_transfer', {
    ...suppliedChannels.bank_transfer,
    enabled: suppliedChannels.bank_transfer?.enabled ?? legacy.enabled === true,
    display_name: suppliedChannels.bank_transfer?.display_name ?? legacy.display_name_ar ?? 'تحويل بنكي',
    account_label: suppliedChannels.bank_transfer?.account_label ?? [legacy.bank_name, legacy.account_holder, legacy.account_number_masked].filter(Boolean).join(' — '),
    instructions: suppliedChannels.bank_transfer?.instructions ?? legacy.instructions_ar ?? '',
    min_amount: suppliedChannels.bank_transfer?.min_amount ?? 0,
    max_amount: suppliedChannels.bank_transfer?.max_amount ?? 1000000000,
  });
  const channels = {
    bank_transfer: bankChannel,
    syriatel_cash: validateChannelSettings('syriatel_cash', suppliedChannels.syriatel_cash),
    sham_cash: validateChannelSettings('sham_cash', suppliedChannels.sham_cash),
  };
  return {
    bank_transfer: {
      ...legacy,
      enabled: bankChannel.enabled,
      requires_manual_review: legacy.requires_manual_review !== false,
      display_name_ar: legacy.display_name_ar || bankChannel.display_name,
      bank_name: legacy.bank_name || '',
      account_holder: legacy.account_holder || '',
      account_number_masked: legacy.account_number_masked || '',
      currency: String(legacy.currency || 'SYP').trim().slice(0, 8),
      instructions_ar: legacy.instructions_ar || bankChannel.instructions,
    },
    manual_transfer: {channels},
  };
}

function assertAmountWithinChannel(amount, channelSettings) {
  const value = money(amount);
  if (value <= 0) throw new Error('مبلغ الطلب غير صالح');
  if (value < channelSettings.min_amount || value > channelSettings.max_amount) {
    throw new Error('مبلغ الطلب خارج حدود قناة التحويل');
  }
  return value;
}

function assertManualTransferChannel(config, channel, amount) {
  const settings = buildManualTransferSettings(config || {}).manual_transfer.channels[channel] || null;
  if (!settings?.enabled) throw new Error('قناة التحويل غير متاحة حاليًا');
  if (amount !== undefined) assertAmountWithinChannel(amount, settings);
  return settings;
}

function clearingAccountForChannel(channel) {
  return channel === 'bank_transfer' ? 'bank_clearing' : `${channel}_clearing`;
}

module.exports = {
  CHANNELS,
  normalizeArabicDigits,
  normalizeReference,
  referenceHash,
  referenceReservationId,
  normalizeChannel,
  validateChannelSettings,
  buildManualTransferSettings,
  assertAmountWithinChannel,
  assertManualTransferChannel,
  clearingAccountForChannel,
};
