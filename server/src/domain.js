const DAMASCUS = 'Asia/Damascus';

function damascusMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: DAMASCUS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

function isVendorOpen(vendor, now = new Date()) {
  const hours = vendor?.opening_hours;
  if (!hours || typeof hours !== 'object') return true;
  const parse = (value) => {
    const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const open = parse(hours.open ?? '00:00');
  const close = parse(hours.close ?? '23:59');
  if (open == null || close == null) return false;
  const current = damascusMinutes(now);
  return open <= close ? current >= open && current <= close : current >= open || current <= close;
}

function safeReference(value) {
  const reference = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9_-]{3,120}$/.test(reference) ? reference : null;
}

function isFreshCourier(courier, maxAgeMs = 10 * 60 * 1000, now = Date.now()) {
  const timestamp = courier?.last_location_at?.toMillis?.() ?? (courier?.last_location_at ? new Date(courier.last_location_at).getTime() : 0);
  return Number.isFinite(timestamp) && now - timestamp <= maxAgeMs;
}

module.exports = {damascusMinutes, isVendorOpen, safeReference, isFreshCourier};
