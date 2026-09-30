function customerReferralDefaults(data = {}, fallbackCode = '') {
  return {
    referral_code: data.referral_code ?? fallbackCode,
    referral_rewarded: data.referral_rewarded ?? false,
    ...(Object.prototype.hasOwnProperty.call(data, 'wallet_balance') ? {} : {wallet_balance: 0}),
    ...(Object.prototype.hasOwnProperty.call(data, 'loyalty_points') ? {} : {loyalty_points: 0}),
  };
}

module.exports = {customerReferralDefaults};
