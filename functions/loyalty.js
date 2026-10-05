const DEFAULT_LOYALTY_POINTS_DIVISOR = 10;
const MAX_LOYALTY_POINTS_DIVISOR = 1000000;

function loyaltyPointsDivisor(config = {}) {
  const divisor = Number(config.loyalty_points_divisor);
  return Number.isFinite(divisor) && divisor >= 1 && divisor <= MAX_LOYALTY_POINTS_DIVISOR ?
    divisor :
    DEFAULT_LOYALTY_POINTS_DIVISOR;
}

function loyaltyPointsForOrder({subtotal = 0, discount = 0, rate = 0, config = {}} = {}) {
  const eligibleAmount = Math.max(0, Number(subtotal || 0) - Number(discount || 0));
  const pointsRate = Math.max(0, Number(rate || 0));
  return Math.floor((eligibleAmount / loyaltyPointsDivisor(config)) * pointsRate);
}

function loyaltyDiscountForPoints(points, pointValue) {
  return Math.max(0, Number(points || 0)) * Math.max(0, Number(pointValue || 0));
}

module.exports = {
  DEFAULT_LOYALTY_POINTS_DIVISOR,
  MAX_LOYALTY_POINTS_DIVISOR,
  loyaltyPointsDivisor,
  loyaltyPointsForOrder,
  loyaltyDiscountForPoints,
};
