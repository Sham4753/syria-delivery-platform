const assert = require('assert');
const {minutesOfDayInDamascus, isWithinOpeningHours} = require('../functions/time-utils');

// 12:00 UTC = 15:00 بتوقيت دمشق (UTC+3)
assert.strictEqual(minutesOfDayInDamascus(new Date('2026-10-02T12:00:00Z')), 15 * 60);
// 22:30 UTC = 01:30 بعد منتصف الليل في دمشق (اليوم التالي)
assert.strictEqual(minutesOfDayInDamascus(new Date('2026-10-02T22:30:00Z')), 90);
// الشتاء والصيف نفس الفرق (لا توقيت صيفي)
assert.strictEqual(minutesOfDayInDamascus(new Date('2026-01-15T12:00:00Z')), 15 * 60);
assert.strictEqual(minutesOfDayInDamascus(new Date('2026-07-15T12:00:00Z')), 15 * 60);

const day = {open: '09:00', close: '23:00'};
// 07:00 UTC = 10:00 دمشق → مفتوح (كان سيُحسب 07:00 = مغلق قبل الإصلاح)
assert.strictEqual(isWithinOpeningHours(day, new Date('2026-10-02T07:00:00Z')), true);
// 20:30 UTC = 23:30 دمشق → مغلق (كان سيُحسب 20:30 = مفتوح قبل الإصلاح)
assert.strictEqual(isWithinOpeningHours(day, new Date('2026-10-02T20:30:00Z')), false);

// متجر يعمل بعد منتصف الليل: 18:00 إلى 02:00
const night = {open: '18:00', close: '02:00'};
assert.strictEqual(isWithinOpeningHours(night, new Date('2026-10-02T22:30:00Z')), true);  // 01:30 دمشق
assert.strictEqual(isWithinOpeningHours(night, new Date('2026-10-02T12:00:00Z')), false); // 15:00 دمشق
assert.strictEqual(isWithinOpeningHours(night, new Date('2026-10-02T16:00:00Z')), true);  // 19:00 دمشق

// بدون ساعات = مفتوح، ساعات تالفة = مغلق
assert.strictEqual(isWithinOpeningHours(undefined), true);
assert.strictEqual(isWithinOpeningHours({open: 'abc', close: '10:00'}), false);

console.log('time-utils tests passed');
