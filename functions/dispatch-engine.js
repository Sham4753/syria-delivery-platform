const OFFER_TTL_MS = 90 * 1000;
const MAX_CANDIDATES = 3;

function pointOf(value) {
  if (!value) return null;
  if (Number.isFinite(value.latitude) && Number.isFinite(value.longitude)) return value;
  if (value.location && Number.isFinite(value.location.latitude) && Number.isFinite(value.location.longitude)) return value.location;
  return null;
}

function distanceKm(aValue, bValue) {
  const a = pointOf(aValue); const b = pointOf(bValue);
  if (!a || !b) return Number.MAX_SAFE_INTEGER;
  const lat = (a.latitude - b.latitude) * Math.PI / 180;
  const lng = (a.longitude - b.longitude) * Math.PI / 180;
  const x = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function courierScore({courier = {}, order = {}, pickupPoint, now = Date.now()}) {
  const distance = distanceKm(courier.current_location, pickupPoint);
  const debt = Math.max(0, Number(courier.debt || 0));
  const creditLimit = Math.max(1, Number(courier.credit_limit || 100));
  const debtRatio = Math.min(1, debt / creditLimit);
  const activeOrders = Math.max(0, Number(courier.active_orders || 0));
  const lastLocation = courier.updated_at?.toMillis?.() || courier.updated_at?.toDate?.()?.getTime?.() || now;
  const staleMinutes = Math.max(0, (now - lastLocation) / 60000);
  const waitMinutes = Math.max(0, (now - (order.created_at?.toMillis?.() || order.created_at?.toDate?.()?.getTime?.() || now)) / 60000);
  const stalePenalty = Math.min(20, staleMinutes * 0.5);
  const score = distance + activeOrders * 4 + debtRatio * 12 + stalePenalty;
  return {score: Number(score.toFixed(4)), distanceKm: Number(distance.toFixed(3)), activeOrders, debtRatio: Number(debtRatio.toFixed(4)), staleMinutes: Number(staleMinutes.toFixed(2)), waitMinutes: Number(waitMinutes.toFixed(2)), reason: `مسافة ${distance.toFixed(1)} كم، حمولة ${activeOrders}، دين ${Math.round(debtRatio * 100)}%`};
}

function rankCouriers(couriers, options = {}) {
  const ranked = couriers.map((entry) => {
    const courier = entry.data ? entry.data() : entry.courier || entry;
    const id = entry.id || entry.courierId;
    const breakdown = courierScore({courier, order: options.order, pickupPoint: options.pickupPoint, now: options.now});
    return {id, courier, breakdown};
  }).filter((entry) => Number.isFinite(entry.breakdown.distanceKm) && entry.breakdown.distanceKm !== Number.MAX_SAFE_INTEGER);
  return ranked.sort((a, b) => a.breakdown.score - b.breakdown.score).slice(0, options.limit || MAX_CANDIDATES);
}

module.exports = {OFFER_TTL_MS, MAX_CANDIDATES, distanceKm, courierScore, rankCouriers, pointOf};
