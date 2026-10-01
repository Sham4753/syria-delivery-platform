function courierDebtForDeliveredOrder(order = {}) {
  return Math.max(0, Number(order.cash_due || 0));
}

module.exports = {courierDebtForDeliveredOrder};
