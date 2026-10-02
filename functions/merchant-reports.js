function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function dayBounds(dateText) {
  const value = String(dateText || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('date must use YYYY-MM-DD');
  // Syria is UTC+03:00; using explicit bounds keeps the report stable on servers in UTC.
  const start = new Date(`${value}T00:00:00+03:00`);
  const end = new Date(`${value}T23:59:59.999+03:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('invalid date');
  return {start, end};
}

function timestampToMillis(value) {
  return value?.toDate?.()?.getTime?.() || 0;
}

function aggregateOrders(docs) {
  const top = new Map();
  const report = {
    orders_count: 0,
    gross_sales: 0,
    merchandise_sales: 0,
    delivery_fees: 0,
    discounts: 0,
    platform_commission: 0,
    vendor_net: 0,
    cash_collected: 0,
  };
  for (const doc of docs) {
    const order = doc.data ? doc.data() : doc;
    if (order.status !== 'delivered') continue;
    report.orders_count += 1;
    const subtotal = Math.max(0, Number(order.subtotal || 0));
    const total = Math.max(0, Number(order.total || 0));
    const deliveryFee = Math.max(0, Number(order.delivery_fee || 0));
    const discount = Math.max(0, Number(order.discount_amount || 0));
    const commission = Math.max(0, Number(order.commission || 0));
    report.gross_sales += total;
    report.merchandise_sales += subtotal;
    report.delivery_fees += deliveryFee;
    report.discounts += discount;
    report.platform_commission += commission;
    report.vendor_net += Math.max(0, subtotal - discount - commission);
    report.cash_collected += Math.max(0, Number(order.cash_due || 0) - deliveryFee);
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const name = String(item?.name || item?.product_id || 'صنف غير مسمى').trim();
      const quantity = Math.max(0, Number(item?.quantity || 0));
      const revenue = Math.max(0, Number(item?.price || 0) * quantity);
      const current = top.get(name) || {name, quantity: 0, revenue: 0};
      current.quantity += quantity;
      current.revenue += revenue;
      top.set(name, current);
    }
  }
  Object.keys(report).forEach((key) => { report[key] = key === 'orders_count' ? report[key] : money(report[key]); });
  report.top_products = [...top.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 10)
    .map((item) => ({...item, quantity: money(item.quantity), revenue: money(item.revenue)}));
  return report;
}

async function aggregateMerchantReports({db, vendorId, date}) {
  const {start, end} = dayBounds(date);
  const orderSnap = await db.collection('orders')
    .where('vendor_id', '==', vendorId)
    .where('created_at', '>=', start)
    .where('created_at', '<=', end)
    .limit(1000)
    .get();
  const report = aggregateOrders(orderSnap.docs);

  const [shiftSnap, settlementSnap] = await Promise.all([
    db.collection('shifts').where('owner_type', '==', 'vendor').where('owner_id', '==', vendorId).limit(100).get(),
    db.collection('settlements').where('vendor_id', '==', vendorId).limit(100).get(),
  ]);
  const shifts = shiftSnap.docs.map((doc) => ({id: doc.id, ...doc.data()}));
  const settlements = settlementSnap.docs
    .map((doc) => ({id: doc.id, ...doc.data()}))
    .filter((item) => timestampToMillis(item.created_at) >= start.getTime() && timestampToMillis(item.created_at) <= end.getTime())
    .sort((a, b) => timestampToMillis(b.created_at) - timestampToMillis(a.created_at));
  const activeShift = shifts.find((item) => item.status === 'open') || null;
  const dayShifts = shifts.filter((item) => {
    const opened = timestampToMillis(item.opened_at);
    return opened >= start.getTime() && opened <= end.getTime();
  });
  const settlement = settlements.reduce((sum, item) => ({
    expected_cash: sum.expected_cash + Number(item.expected_cash || 0),
    counted_cash: sum.counted_cash + Number(item.counted_cash || 0),
    variance: sum.variance + Number(item.variance || 0),
    approved: sum.approved + (item.status === 'approved' ? 1 : 0),
    pending: sum.pending + (item.status === 'pending_approval' ? 1 : 0),
  }), {expected_cash: 0, counted_cash: 0, variance: 0, approved: 0, pending: 0});
  return {
    date,
    ...report,
    settlement: {
      ...Object.fromEntries(Object.entries(settlement).map(([key, value]) => [key, key === 'approved' || key === 'pending' ? value : money(value)])),
      shifts_count: dayShifts.length,
      active_shift: activeShift ? {id: activeShift.id, opened_at: activeShift.opened_at || null, opening_cash: money(activeShift.opening_cash)} : null,
      latest: settlements[0] ? {
        id: settlements[0].id,
        status: settlements[0].status,
        expected_cash: money(settlements[0].expected_cash),
        counted_cash: money(settlements[0].counted_cash),
        variance: money(settlements[0].variance),
      } : null,
    },
  };
}

module.exports = {dayBounds, aggregateOrders, aggregateMerchantReports};
