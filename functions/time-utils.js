'use strict';

// سوريا على UTC+3 دائماً (ألغت التوقيت الصيفي في 2022)، لكن نترك Intl يحسبها
// بالاسم الرسمي للمنطقة حتى لا نعتمد على توقيت السيرفر (UTC على Cloud Functions).
const DAMASCUS_TZ = 'Asia/Damascus';

const minutesFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: DAMASCUS_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// عدد الدقائق منذ منتصف الليل بتوقيت دمشق (0..1439).
function minutesOfDayInDamascus(date = new Date()) {
  const parts = minutesFormatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  return hour * 60 + minute;
}

// opening_hours = {open: 'HH:mm', close: 'HH:mm'}.
// - بدون ساعات عمل: مفتوح دائماً.
// - ساعات غير صالحة: مغلق (نفس السلوك السابق).
// - إذا كان الإغلاق قبل الفتح فالمتجر يعمل بعد منتصف الليل (مثل 18:00 إلى 02:00).
function isWithinOpeningHours(hours, now = new Date()) {
  if (!hours || typeof hours !== 'object') return true;
  const [openH, openM] = String(hours.open || '00:00').split(':').map(Number);
  const [closeH, closeM] = String(hours.close || '23:59').split(':').map(Number);
  if (![openH, openM, closeH, closeM].every(Number.isFinite)) return false;
  const current = minutesOfDayInDamascus(now);
  const open = openH * 60 + openM;
  const close = closeH * 60 + closeM;
  return open <= close ? current >= open && current <= close : current >= open || current <= close;
}

module.exports = {DAMASCUS_TZ, minutesOfDayInDamascus, isWithinOpeningHours};
