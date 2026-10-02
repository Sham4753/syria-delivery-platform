const assert = require('assert');
const {customerReferralDefaults} = require('../functions/referral-profile');

const preset = {
  wallet_balance: 875,
  loyalty_points: 42,
  referral_code: 'PRESET42',
  referral_rewarded: true,
};
const firstPresetRun = customerReferralDefaults(preset, 'FALLBACK');
const firstPresetMerged = {...preset, ...firstPresetRun};
const secondPresetRun = customerReferralDefaults(firstPresetMerged, 'FALLBACK');
const secondPresetMerged = {...firstPresetMerged, ...secondPresetRun};
assert.deepStrictEqual(firstPresetMerged, preset, 'pre-existing referral and balances must be preserved');
assert.deepStrictEqual(secondPresetMerged, firstPresetMerged, 're-running referral initialization must be idempotent');

const missing = customerReferralDefaults({}, 'ABC123');
assert.deepStrictEqual(missing, {
  referral_code: 'ABC123',
  referral_rewarded: false,
  wallet_balance: 0,
  loyalty_points: 0,
}, 'missing referral fields must receive safe defaults');
assert.deepStrictEqual({...missing, ...customerReferralDefaults(missing, 'OTHER')}, missing, 'defaults must remain stable on replay');

const partialSource = {wallet_balance: 12, loyalty_points: 7};
const partial = {...partialSource, ...customerReferralDefaults(partialSource, 'PARTIAL')};
assert.strictEqual(partial.wallet_balance, 12);
assert.strictEqual(partial.loyalty_points, 7);
assert.strictEqual(partial.referral_code, 'PARTIAL');
assert.strictEqual(partial.referral_rewarded, false);

console.log('referral profile regression tests passed');
