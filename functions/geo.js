'use strict';
// دوال جغرافية نقية (بدون Firebase) حتى يمكن اختبارها مباشرة بـ node.

const round2 = (value) => Math.round(Number(value) * 100) / 100;

// يقبل {latitude, longitude} أو {lat, lng} (وليس نصوصًا) ويعيد null إذا كانت النقطة غير صالحة.
function normalizePoint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = raw.latitude ?? raw.lat;
  const lng = raw.longitude ?? raw.lng ?? raw.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {latitude: lat, longitude: lng};
}

function normalizePolygon(raw) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const points = raw.map(normalizePoint);
  return points.every(Boolean) ? points : null;
}

// Ray casting: x = خط الطول، y = خط العرض.
function pointOnSegment(point, a, b) {
  const cross = (point.longitude - a.longitude) * (b.latitude - a.latitude) -
    (point.latitude - a.latitude) * (b.longitude - a.longitude);
  if (Math.abs(cross) > 1e-10) return false;
  return point.longitude >= Math.min(a.longitude, b.longitude) - 1e-10 &&
    point.longitude <= Math.max(a.longitude, b.longitude) + 1e-10 &&
    point.latitude >= Math.min(a.latitude, b.latitude) - 1e-10 &&
    point.latitude <= Math.max(a.latitude, b.latitude) + 1e-10;
}

function pointInPolygon(point, polygon) {
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude; const yi = polygon[i].latitude;
    const xj = polygon[j].longitude; const yj = polygon[j].latitude;
    if (pointOnSegment(point, polygon[j], polygon[i])) return true;
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonArea(polygon) {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += polygon[j].longitude * polygon[i].latitude - polygon[i].longitude * polygon[j].latitude;
  }
  return Math.abs(sum) / 2;
}

// zones: [{id, polygon, active}] ← يعيد معرّف المنطقة الأصغر مساحة التي تحوي النقطة، أو null.
function pickZone(point, zones) {
  const matches = [];
  for (const zone of zones) {
    if (zone.active === false) continue;
    const polygon = normalizePolygon(zone.polygon);
    if (polygon && pointInPolygon(point, polygon)) matches.push({id: String(zone.id), area: polygonArea(polygon)});
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.area - b.area || (a.id < b.id ? -1 : 1));
  return matches[0].id;
}

function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// نفس منطق createOrder: رسم المنطقة × surge المنطقة × surge العام، مع مكوّن مسافة اختياري.
function computeErrandFee({zone = {}, config = {}, distanceKm = 0}) {
  const base = Number(zone.delivery_fee_base || config.default_delivery_fee || 0);
  const perKm = Math.max(0, Number(config.errand_fee_per_km || 0));
  const zoneMultiplier = Number(zone.surge_multiplier || 1);
  const globalMultiplier = config.surge_enabled === true ? Number(config.surge_multiplier || 1) : 1;
  const minFee = Math.max(0, Number(config.errand_min_fee || 0));
  const raw = (base + perKm * distanceKm) * zoneMultiplier * globalMultiplier;
  const fee = round2(Math.max(raw, minFee));
  return {
    fee,
    breakdown: {base, per_km: perKm, distance_km: round2(distanceKm), zone_multiplier: zoneMultiplier, global_multiplier: globalMultiplier, min_fee: minFee},
  };
}

module.exports = {normalizePoint, normalizePolygon, pointInPolygon, polygonArea, pickZone, haversineKm, computeErrandFee, round2};
