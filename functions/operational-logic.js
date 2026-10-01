const DEFAULT_COURIER_CREDIT_LIMIT = 1000000;
const SYRIA_TIME_ZONE = 'Asia/Damascus';

function effectiveCourierCreditLimit(wallet = {}) {
  const configured = Number(wallet.credit_limit);
  // 100 was the old hard-coded default and is not a meaningful SYP limit.
  return configured === 100 || !Number.isFinite(configured) || configured <= 0 ? DEFAULT_COURIER_CREDIT_LIMIT : configured;
}

function courierCashDebt(order = {}) {
  if (order.payment_method === 'wallet') return 0;
  const cashDue = Number(order.cash_due);
  if (Number.isFinite(cashDue)) return Math.max(0, cashDue - Math.max(0, Number(order.delivery_fee || 0)));
  if (order.payment_method === 'cash_on_delivery') return Math.max(0, Number(order.subtotal || 0));
  return 0;
}

function minutesInSyria(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SYRIA_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

function isVendorOpen(vendor, now = new Date()) {
  const hours = vendor?.opening_hours;
  if (!hours || typeof hours !== 'object') return true;
  const [openH, openM] = String(hours.open || '00:00').split(':').map(Number);
  const [closeH, closeM] = String(hours.close || '23:59').split(':').map(Number);
  if (![openH, openM, closeH, closeM].every(Number.isFinite)) return false;
  const current = minutesInSyria(now);
  const open = openH * 60 + openM;
  const close = closeH * 60 + closeM;
  return open <= close ? current >= open && current <= close : current >= open || current <= close;
}

module.exports = {DEFAULT_COURIER_CREDIT_LIMIT, SYRIA_TIME_ZONE, effectiveCourierCreditLimit, courierCashDebt, minutesInSyria, isVendorOpen};
