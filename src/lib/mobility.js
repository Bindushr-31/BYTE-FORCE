/**
 * Deterministic mobility engine — all fares, occupancy, ETA and feeder timing
 * math lives here. No AI, no randomness: the same inputs always give the same
 * numbers so the control centre, driver console and passenger view agree.
 */

export const DEFAULT_FARE = { base: 10, per_km: 1.15, minimum: 12 };
export const OCCUPANCY_WARNING = 80;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Fraction of the route a stop sits at, from its distance offset. */
export function stopFractions(stops = []) {
  const total = stops.reduce((sum, s) => sum + (Number(s.offset_km) || 0), 0);
  if (!total) return stops.map(() => 0);
  let running = 0;
  return stops.map((s) => {
    running += Number(s.offset_km) || 0;
    return running / total;
  });
}

export function occupancyLevel(pct) {
  if (pct >= 100) return "full";
  if (pct >= OCCUPANCY_WARNING) return "warning";
  return "ok";
}

/**
 * Occupancy engine.
 * Tickets are NOT the headcount: students exit early, transfer to another bus
 * and some never hold a digital ticket. We net out known exits/transfers, blend
 * the conductor's manual count with the net ticket figure, then add boarding
 * reports from volunteers that have no ticket attached.
 * Estimated onboard is always capped at authorized capacity.
 */
export function computeOccupancy(input = {}) {
  const capacity = Math.max(0, Number(input.capacity) || 0);
  const tickets = Math.max(0, Number(input.tickets) || 0);
  const exited = Math.max(0, Number(input.exited) || 0);
  const transferred = Math.max(0, Number(input.transferred) || 0);
  const manual = Math.max(0, Number(input.manual) || 0);
  const volunteerExtra = Math.max(0, Number(input.boarding_reports) || 0);

  const ticketNet = Math.max(0, tickets - exited - transferred);
  // Only blend when both signals exist; a lone manual count is the honest number.
  const blended = manual > 0 && ticketNet > 0
    ? Math.round(manual * 0.6 + ticketNet * 0.4)
    : Math.max(manual, ticketNet);
  const raw = blended + volunteerExtra;
  const estimated = capacity > 0 ? Math.min(capacity, raw) : raw;
  const pct = capacity > 0 ? Math.round((estimated / capacity) * 100) : 0;
  const level = occupancyLevel(pct);

  const sources = [];
  if (tickets > 0) sources.push(`${tickets} tickets net of ${exited + transferred} exits/transfers`);
  if (manual > 0) sources.push(`conductor count ${manual}`);
  if (volunteerExtra > 0) sources.push(`${volunteerExtra} unticketed boardings`);
  if (!sources.length) sources.push("no count yet");

  return {
    capacity,
    tickets,
    ticketNet,
    manual,
    exited,
    transferred,
    estimated,
    pct,
    level,
    is_full: capacity > 0 && pct >= 100,
    seats_free: Math.max(0, capacity - estimated),
    sources,
    source_label: sources.join(" · "),
  };
}

export function levelClasses(level) {
  if (level === "full") return { bar: "bg-rose-500", text: "text-rose-600", chip: "bg-rose-50 text-rose-700 ring-rose-600/15", dot: "bg-rose-500" };
  if (level === "warning") return { bar: "bg-amber-500", text: "text-amber-600", chip: "bg-amber-50 text-amber-700 ring-amber-600/15", dot: "bg-amber-500" };
  return { bar: "bg-emerald-500", text: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", dot: "bg-emerald-500" };
}

export function levelLabel(level) {
  if (level === "full") return "Full";
  if (level === "warning") return "Near capacity";
  return "Seats available";
}

/** Distance-based fare. Rates come from admin config, never hardcoded to a scheme. */
export function fullFare(distanceKm, fare = DEFAULT_FARE) {
  const { base = 10, per_km = 1.15, minimum = 12 } = fare || {};
  const raw = base + per_km * Math.max(0, Number(distanceKm) || 0);
  return Math.max(minimum, Math.round(raw));
}

export function fareBreakdown({ distanceKm, concessionPct = 0, fare = DEFAULT_FARE }) {
  const full = fullFare(distanceKm, fare);
  const pct = clamp(Number(concessionPct) || 0, 0, 100);
  const concession = Math.round((full * pct) / 100);
  return { full, concessionPct: pct, concession, payable: Math.max(0, full - concession) };
}

export function segmentDistance(route, fromIndex, toIndex) {
  if (!route || !Array.isArray(route.stops)) return 0;
  const a = Math.min(fromIndex, toIndex);
  const b = Math.max(fromIndex, toIndex);
  return route.stops.slice(a + 1, b + 1).reduce((sum, s) => sum + (Number(s.offset_km) || 0), 0);
}

/** Minutes until the vehicle reaches a stop, from trip progress and stop offsets. */
export function etaToStop(route, stopIndex, progressPct, delayMin = 0) {
  if (!route || !Array.isArray(route.stops)) return null;
  const fractions = stopFractions(route.stops);
  const target = fractions[stopIndex];
  if (target === undefined) return null;
  const done = clamp(Number(progressPct) || 0, 0, 100) / 100;
  if (done >= target) return 0;
  const totalMinutes = Number(route.duration_min) || 45;
  return Math.max(0, Math.round((target - done) * totalMinutes) + (Number(delayMin) || 0));
}

export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Feeder planning: van depart = main bus arrival at hub − feeder travel − transfer buffer.
 * Only approved, permit-verified vans whose operating area covers the village and
 * whose authorized capacity fits the waiting students are eligible.
 */
export function planFeeder({ village, hub, vans = [], mainBusArrivalMin, waiting = 1, bufferMin = 8, travelMin = 25 }) {
  const eligible = vans
    .filter((v) => v.status === "active" && v.permit_verified && v.availability !== false)
    .filter((v) => !Array.isArray(v.village_codes) || v.village_codes.includes(village.code))
    .filter((v) => (Number(v.capacity) || 0) >= waiting)
    .sort((a, b) => (Number(a.capacity) || 0) - (Number(b.capacity) || 0));
  const van = eligible[0] || null;
  const departMin = mainBusArrivalMin - travelMin - bufferMin;
  return {
    village,
    hub,
    van,
    travel_min: travelMin,
    buffer_min: bufferMin,
    depart_min: departMin,
    arrive_min: departMin + travelMin,
    main_bus_arrival_min: mainBusArrivalMin,
    legal_capacity_ok: van ? Number(van.capacity) >= waiting : false,
    reason: van
      ? `${van.registration} is permit-verified for ${van.capacity} seats and covers ${village.name}.`
      : `No approved van with ${waiting}+ seats covers ${village.name}. Admin allocation required.`,
  };
}

export function minutesToClock(minutes) {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clockToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatINR(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}