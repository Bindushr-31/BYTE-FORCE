import { createServerFn } from "@tanstack/react-start";
import { requireAdmin, requireUser } from "@/lib/auth-middleware";
import {
  computeOccupancy,
  segmentDistance,
  fareBreakdown,
  clamp,
  stopFractions,
  minutesToClock,
  clockToMinutes,
  DEFAULT_FARE,
} from "@/lib/mobility";

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

async function many(entity, query = {}, opts = { limit: 200, sort: "-created_date" }) {
  const res = Object.keys(query).length ? await entity.filter(query, opts) : await entity.list(opts);
  return res?.items ?? res ?? [];
}

async function one(entity, query) {
  const res = await entity.filter(query, { limit: 1 });
  const items = res?.items ?? res ?? [];
  return items[0] || null;
}

function positionOnRoute(route, progressPct) {
  const stops = route?.stops || [];
  if (!stops.length) return { lat: 12.7, lng: 74.9 };
  const fr = stopFractions(stops);
  const p = clamp(progressPct, 0, 100) / 100;
  for (let i = 1; i < fr.length; i += 1) {
    if (p <= fr[i]) {
      const span = fr[i] - fr[i - 1] || 1;
      const k = (p - fr[i - 1]) / span;
      return {
        lat: stops[i - 1].lat + (stops[i].lat - stops[i - 1].lat) * k,
        lng: stops[i - 1].lng + (stops[i].lng - stops[i - 1].lng) * k,
      };
    }
  }
  const last = stops[stops.length - 1];
  return { lat: last.lat, lng: last.lng };
}

function tripOccupancy(trip) {
  return computeOccupancy({
    capacity: trip.capacity,
    tickets: trip.tickets_issued,
    manual: trip.manual_count,
    exited: trip.exits,
    transferred: trip.transfers,
    boarding_reports: trip.boarding_reports,
  });
}

async function logOccupancy(sdk, trip, occ, by) {
  await sdk.entities.OccupancyRecord.create({
    trip_code: trip.trip_code,
    vehicle_registration: trip.vehicle_registration,
    tickets: occ.tickets,
    manual_count: occ.manual,
    estimated_onboard: occ.estimated,
    capacity: occ.capacity,
    occupancy_pct: occ.pct,
    level: occ.level,
    source: occ.source_label,
    recorded_at: nowIso(),
    recorded_by: by || "System",
  });
}

function capacityGuard(count, free) {
  if (count > free) {
    return `Authorized capacity limit: only ${free} seat${free === 1 ? "" : "s"} remain. This vehicle can never carry more than its permitted capacity.`;
  }
  return null;
}

/** Core ticketing used by the conductor screen, the pass counter and demo scenarios. */
async function issueTicketsCore(sdk, { trip_code, pass_code, from_stop, to_stop, count = 1, method = "cash", issued_by = "Conductor" }) {
  const trip = await one(sdk.entities.Trip, { trip_code });
  if (!trip) return { ok: false, error: "Trip not found." };
  if (trip.status === "cancelled") return { ok: false, error: "This service is cancelled." };
  if (trip.is_full) {
    return {
      ok: false,
      error: `${trip.vehicle_registration} is FULL at its authorized capacity. Confirm alighting before issuing more tickets.`,
    };
  }

  const route = await one(sdk.entities.BusRoute, { code: trip.route_code });
  const stops = route?.stops || [];
  const fromIdx = Math.max(0, stops.findIndex((s) => s.code === from_stop));
  const toIdx = Math.max(fromIdx + 1, stops.findIndex((s) => s.code === to_stop));
  const distanceKm = segmentDistance(route, fromIdx, toIdx === -1 ? stops.length - 1 : toIdx) || Number(route?.distance_km) || 12;

  let pass = null;
  if (pass_code) {
    pass = await one(sdk.entities.StudentPass, { pass_code });
    if (!pass) return { ok: false, error: `No pass found for ${pass_code}.` };
    if (pass.status !== "active") return { ok: false, error: `Pass ${pass_code} is ${pass.status} — collect the full fare.` };
    if (pass.valid_to && pass.valid_to < today()) return { ok: false, error: `Pass ${pass_code} expired on ${pass.valid_to}.` };
    if (Array.isArray(pass.vehicle_categories) && !pass.vehicle_categories.includes(trip.vehicle_type)) {
      return { ok: false, error: `Pass ${pass_code} is not valid on ${trip.vehicle_type} services.` };
    }
  }

  const occBefore = tripOccupancy(trip);
  const blocked = capacityGuard(count, occBefore.seats_free);
  if (blocked) return { ok: false, error: blocked, occupancy: occBefore };

  const concessionPct = pass ? Number(pass.concession_pct) || 0 : 0;
  const fare = fareBreakdown({ distanceKm, concessionPct });

  const ticketId = `TKT-${trip.trip_code}-${Date.now().toString(36).toUpperCase()}${Math.floor(10 + Math.random() * 89)}`;
  const ticket = await sdk.entities.TicketTransaction.create({
    ticket_id: ticketId,
    trip_code: trip.trip_code,
    vehicle_registration: trip.vehicle_registration,
    route_code: trip.route_code,
    pass_code: pass_code || "",
    student_name: pass?.student_name || "Walk-in passenger",
    from_stop: from_stop || stops[0]?.code || "",
    to_stop: to_stop || stops[stops.length - 1]?.code || "",
    passenger_count: count,
    distance_km: Number(distanceKm.toFixed(1)),
    full_fare: Number((fare.full * count).toFixed(2)),
    concession_pct: fare.concessionPct,
    concession_amount: Number((fare.concession * count).toFixed(2)),
    payable_fare: Number((fare.payable * count).toFixed(2)),
    method: pass ? (method === "cash" ? "manual_id" : method) : "cash",
    status: "active",
    conductor_id: issued_by,
    issued_at: nowIso(),
    issued_by,
    created_at: nowIso(),
  });

  if (fare.concession > 0 && pass) {
    await sdk.entities.ConcessionTransaction.create({
      pass_code: pass.pass_code,
      student_name: pass.student_name,
      trip_code: trip.trip_code,
      vehicle_registration: trip.vehicle_registration,
      vehicle_type: trip.vehicle_type,
      full_fare: Number((fare.full * count).toFixed(2)),
      concession_pct: fare.concessionPct,
      concession_amount: Number((fare.concession * count).toFixed(2)),
      payable_fare: Number((fare.payable * count).toFixed(2)),
      settlement_status: "pending",
      created_at: nowIso(),
    });
  }

  // Boarding event: the unique key makes the same boarding impossible to count twice.
  await sdk.entities.BoardingEvent.create({
    event_key: `board:${ticketId}`,
    type: "board",
    ticket_id: ticketId,
    trip_code: trip.trip_code,
    vehicle_registration: trip.vehicle_registration,
    stop_code: ticket.from_stop,
    passenger_count: count,
    source: "conductor",
    recorded_at: nowIso(),
    recorded_by: issued_by,
    note: `Boarded ${ticket.from_stop} → ${ticket.to_stop}`,
  });

  const updated = {
    tickets_issued: (Number(trip.tickets_issued) || 0) + count,
    count_updated_at: nowIso(),
  };
  await sdk.entities.Trip.update(trip.id, updated);
  const after = tripOccupancy({ ...trip, ...updated });
  if (after.pct >= 100 && !trip.is_full) {
    await sdk.entities.Trip.update(trip.id, { is_full: true });
    await sdk.entities.Notification.create({
      title: `${trip.vehicle_registration} has reached authorized capacity`,
      message: `${trip.trip_code} is at ${after.estimated}/${after.capacity}. No further boarding until passengers exit.`,
      audience: "admin",
      route_code: trip.route_code,
      trip_code: trip.trip_code,
      level: "critical",
      requires_ack: true,
    });
  }
  await logOccupancy(sdk, { ...trip, ...updated }, after, issued_by);

  return { ok: true, ticket, fare, occupancy: after, pass: pass ? { name: pass.student_name, code: pass.pass_code, concessionPct } : null };
}

export const issueTickets = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    return issueTicketsCore(sdk, {
      trip_code: String(data.trip_code || ""),
      pass_code: data.pass_code ? String(data.pass_code).trim().toUpperCase() : "",
      from_stop: data.from_stop,
      to_stop: data.to_stop,
      count: clamp(Number(data.count) || 1, 1, 20),
      method: data.method || "cash",
      issued_by: data.issued_by || context.user?.full_name || "Conductor",
    });
  });

export const updateTripCount = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const trip = await one(sdk.entities.Trip, { trip_code: String(data.trip_code || "") });
    if (!trip) return { ok: false, error: "Trip not found." };

    const patch = { count_updated_at: nowIso() };
    if (data.manual_count !== undefined) patch.manual_count = clamp(Number(data.manual_count) || 0, 0, trip.capacity);
    if (data.delta !== undefined) patch.manual_count = clamp((Number(trip.manual_count) || 0) + Number(data.delta), 0, trip.capacity);
    if (data.unable_to_board !== undefined) patch.unable_to_board = clamp(Number(data.unable_to_board) || 0, 0, 400);
    if (data.mark_full) patch.manual_count = trip.capacity;

    const after = tripOccupancy({ ...trip, ...patch });
    patch.is_full = after.pct >= 100;
    await sdk.entities.Trip.update(trip.id, patch);

    if (data.delta !== undefined && Number(data.delta) !== 0) {
      await sdk.entities.PassengerCount.create({
        trip_code: trip.trip_code,
        boarded: Number(data.delta) > 0 ? Number(data.delta) : 0,
        exited: Number(data.delta) < 0 ? Math.abs(Number(data.delta)) : 0,
        source: "manual",
        recorded_at: nowIso(),
        note: `Conductor counter ${data.delta > 0 ? "+" : ""}${data.delta}`,
      });
    }
    if ((data.unable_to_board || 0) > 0) {
      await sdk.entities.Notification.create({
        title: `${trip.unable_to_board || data.unable_to_board} students left behind at ${trip.vehicle_registration}`,
        message: `${after.estimated}/${after.capacity} on board (${after.pct}%). A replacement service may be needed.`,
        audience: "admin",
        route_code: trip.route_code,
        trip_code: trip.trip_code,
        level: "warning",
        requires_ack: true,
      });
    }
    await logOccupancy(sdk, { ...trip, ...patch }, after, context.user?.full_name || "Driver");
    return { ok: true, occupancy: after, patch };
  });

// Pass reads are already limited by the entity access rules, so a passenger can
// only verify their own pass; staff verify any pass.
export const verifyPass = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const code = String(data.pass_code || "").trim().toUpperCase();
    const pass = await one(sdk.entities.StudentPass, { pass_code: code });
    if (!pass) return { ok: false, error: `No pass found for “${code}”.` };
    const expired = pass.valid_to && pass.valid_to < today();
    const status = expired ? "expired" : pass.status;
    let fare = null;
    if (data.trip_code) {
      const trip = await one(sdk.entities.Trip, { trip_code: data.trip_code });
      const route = trip ? await one(sdk.entities.BusRoute, { code: trip.route_code }) : null;
      fare = fareBreakdown({
        distanceKm: Number(route?.distance_km) || 24,
        concessionPct: Number(pass.concession_pct) || 0,
      });
    }
    return { ok: true, pass: { ...pass, status }, expired, fare, checked_at: nowIso() };
  });

export const advanceSimulation = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const step = clamp(Number(data?.step) || 4, 1, 20);
    const trips = await many(sdk.entities.Trip, { status: "active" }, { limit: 100 });
    const routes = await many(sdk.entities.BusRoute, {}, { limit: 50 });
    const routeByCode = new Map(routes.map((r) => [r.code, r]));
    const gps = [];
    let completed = 0;

    for (const trip of trips) {
      const next = clamp((Number(trip.progress) || 0) + step, 0, 100);
      const route = routeByCode.get(trip.route_code);
      const pos = positionOnRoute(route, next);
      const patch = {
        progress: next,
        lat: pos.lat,
        lng: pos.lng,
        speed_kmh: next >= 100 ? 0 : 24 + Math.round((next % 7) * 2),
        last_gps_at: nowIso(),
      };
      if (next >= 100) {
        patch.status = "completed";
        patch.ended_at = nowIso();
        completed += 1;
      }
      await sdk.entities.Trip.update(trip.id, patch);
      gps.push({
        trip_code: trip.trip_code,
        vehicle_registration: trip.vehicle_registration,
        lat: pos.lat,
        lng: pos.lng,
        speed_kmh: patch.speed_kmh,
        recorded_at: nowIso(),
        source: "simulated",
      });
    }
    if (gps.length) await sdk.entities.GpsLocation.bulkCreate(gps);
    return { ok: true, moved: trips.length, completed, simulated: true };
  });

export const acceptAssignment = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const assignment = await one(sdk.entities.VehicleAssignment, { code: String(data.code || "") });
    if (!assignment) return { ok: false, error: "Assignment not found." };
    const decision = data.decision === "decline" ? "declined" : "accepted";
    await sdk.entities.VehicleAssignment.update(assignment.id, { status: decision });
    await sdk.entities.Notification.create({
      title: `Feeder assignment ${decision}`,
      message: `${assignment.vehicle_registration} · ${assignment.route_code} was ${decision} by the operator.`,
      audience: "admin",
      route_code: assignment.route_code,
      level: decision === "accepted" ? "success" : "warning",
      requires_ack: true,
    });
    return { ok: true, status: decision };
  });

export const assignVehicle = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const reg = String(data.vehicle_registration || "");
    const type = data.vehicle_type || "private";
    const permitted = await one(sdk.entities.Permit, { vehicle_registration: reg });
    if (!permitted || !permitted.verified || permitted.status !== "approved") {
      return { ok: false, error: `${reg} is not permit-verified. Only approved vehicles can be assigned.` };
    }
    const fleet = type === "feeder" ? await many(sdk.entities.FeederVehicle, { registration: reg }, { limit: 1 })
      : type === "government" ? await many(sdk.entities.GovBus, { registration: reg }, { limit: 1 })
      : await many(sdk.entities.PrivateBus, { registration: reg }, { limit: 1 });
    const vehicle = fleet[0];
    if (!vehicle) return { ok: false, error: `${reg} is not an approved ${type} vehicle.` };
    if (vehicle.status !== "active") return { ok: false, error: `${reg} is ${vehicle.status} and cannot be assigned.` };

    const expected = clamp(Number(data.passengers_expected) || 0, 0, 400);
    const authorized = Number(vehicle.capacity) || 0;
    if (expected > authorized) {
      return { ok: false, error: `Authorized capacity of ${reg} is ${authorized}; ${expected} passengers cannot be allocated.` };
    }
    if (type === "feeder" && vehicle.availability === false) {
      return { ok: false, error: `${reg} is marked unavailable by the operator.` };
    }

    const routeCode = data.route_code || vehicle.route_code || "";

    // No double-booking: one open assignment and one running trip per vehicle.
    const openAssignment = (await many(sdk.entities.VehicleAssignment, { vehicle_registration: reg }, { limit: 20 }))
      .find((a) => ["pending", "accepted", "active"].includes(a.status) && a.route_code !== routeCode);
    if (openAssignment) {
      return { ok: false, error: `${reg} already has an open assignment on ${openAssignment.route_code} (${openAssignment.code}).` };
    }
    const runningElsewhere = (await many(sdk.entities.Trip, { vehicle_registration: reg, status: "active" }, { limit: 5 }))
      .find((t) => t.route_code !== routeCode);
    if (runningElsewhere) {
      return { ok: false, error: `${reg} is currently running ${runningElsewhere.route_code} (${runningElsewhere.trip_code}).` };
    }

    const code = `ASG-${Math.floor(4000 + Math.random() * 5000)}`;
    await sdk.entities.VehicleAssignment.create({
      code,
      vehicle_type: type,
      vehicle_registration: reg,
      route_code: routeCode,
      village_code: data.village_code || "",
      hub_code: data.hub_code || vehicle.hub_code || "",
      purpose: data.purpose || "extra",
      status: type === "feeder" ? "pending" : "active",
      passengers_expected: expected,
      assigned_by: context.user?.full_name || "Control centre",
      note: data.note || "",
    });

    // Update the vehicle record and the shared trip so every portal and the map
    // pick the assignment up from one place.
    const route = routeCode ? await one(sdk.entities.BusRoute, { code: routeCode }) : null;
    const openTrip = (await many(sdk.entities.Trip, { vehicle_registration: reg, route_code: routeCode }, { limit: 10 }))
      .find((t) => ["scheduled", "active"].includes(t.status));
    let tripCode = openTrip?.trip_code || "";
    if (openTrip && openTrip.status === "scheduled") {
      await sdk.entities.Trip.update(openTrip.id, { status: "active", started_at: nowIso(), last_gps_at: nowIso() });
    }
    if (!openTrip) {
      const start = (route?.stops || [])[0] || { lat: 12.51, lng: 74.99 };
      tripCode = `ER-${Math.floor(1000 + Math.random() * 9000)}`;
      await sdk.entities.Trip.create({
        trip_code: tripCode,
        vehicle_type: type,
        vehicle_registration: reg,
        route_code: routeCode,
        route_name: route?.name || routeCode,
        direction: "morning",
        status: "active",
        scheduled_departure: data.departure || "08:10",
        progress: 0,
        capacity: authorized,
        tickets_issued: 0,
        manual_count: 0,
        lat: start.lat,
        lng: start.lng,
        destination: (route?.stops || [])[(route?.stops || []).length - 1]?.name || "Sahyadri College",
        driver_name: vehicle.driver_name || "",
        simulated: true,
        started_at: nowIso(),
        last_gps_at: nowIso(),
        count_updated_at: nowIso(),
        note: `Assigned by the control centre (${code}).`,
      });
    }

    const fleetEntity = type === "feeder" ? sdk.entities.FeederVehicle : type === "government" ? sdk.entities.GovBus : sdk.entities.PrivateBus;
    await fleetEntity.update(vehicle.id, type === "feeder" ? { status: "active", availability: true } : { status: "active" });
    await sdk.entities.Notification.create({
      title: `${reg} assigned to ${data.route_code || "service"}`,
      message: `${expected} students expected. Authorized capacity ${vehicle.capacity}.`,
      audience: type === "feeder" ? "operator" : "driver",
      route_code: data.route_code || vehicle.route_code,
      level: "info",
      requires_ack: true,
    });
    return { ok: true, code, capacity: vehicle.capacity, expected, trip_code: tripCode };
  });

export const advanceIncident = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const incident = await one(sdk.entities.Incident, { code: String(data.code || "") });
    if (!incident) return { ok: false, error: "Incident not found." };
    const steps = [];
    const timeline = Array.isArray(incident.timeline) ? [...incident.timeline] : [];
    const at = minutesToClock(new Date().getHours() * 60 + new Date().getMinutes());

    if (data.action === "verify") {
      const routes = await many(sdk.entities.BusRoute, { code: incident.route_code }, { limit: 1 });
      const trips = await many(sdk.entities.Trip, { route_code: incident.route_code, status: "active" }, { limit: 20 });
      const affected = trips.reduce((sum, t) => sum + tripOccupancy(t).estimated, 0);
      const alternatives = await many(sdk.entities.BusRoute, { status: "active" }, { limit: 20 });
      const alt = alternatives.find((r) => r.code !== incident.route_code && r.large_bus_allowed && r.kind !== "feeder");
      timeline.push({ status: "Verified", at, note: `Affected ${affected} passengers on ${trips.length} active trip(s).` });
      await sdk.entities.Incident.update(incident.id, {
        status: "Verified",
        affected_passengers: affected,
        timeline,
      });
      steps.push(`Verified ${incident.code}.`);
      steps.push(`Affected: ${affected} passengers across ${trips.length} active trip(s) on ${routes[0]?.name || incident.route_code}.`);
      if (alt) steps.push(`Unblocked alternative available: ${alt.name} (${alt.distance_km} km, large buses allowed).`);
      await sdk.entities.Notification.create({
        title: `${incident.code} verified — action needed`,
        message: `${incident.title}. ${affected} passengers affected.${alt ? ` Suggested alternative: ${alt.name}.` : ""}`,
        audience: "admin",
        route_code: incident.route_code,
        level: "critical",
        requires_ack: true,
      });
      return { ok: true, steps, incident: { ...incident, status: "Verified", affected_passengers: affected } };
    }

    if (data.action === "require_action") {
      timeline.push({ status: "Action Required", at, note: "Replacement or rerouting required before the next peak." });
      await sdk.entities.Incident.update(incident.id, { status: "Action Required", timeline });
      return { ok: true, steps: ["Moved to Action Required — allocation team notified."] };
    }

    if (data.action === "assign") {
      const vans = await many(sdk.entities.FeederVehicle, {}, { limit: 20 });
      const buses = await many(sdk.entities.PrivateBus, { status: "active" }, { limit: 20 });
      const need = Number(incident.affected_passengers) || 12;
      const van = vans.filter((v) => v.permit_verified && v.approved).sort((a, b) => b.capacity - a.capacity)[0];
      const bus = buses.sort((a, b) => b.capacity - a.capacity)[0];
      const chosen = need > 16 ? bus : van;
      if (!chosen) return { ok: false, error: "No approved replacement vehicle available." };
      const reg = chosen.registration;
      await sdk.entities.VehicleAssignment.create({
        code: `ASG-${Math.floor(4000 + Math.random() * 5000)}`,
        vehicle_type: need > 16 ? "private" : "feeder",
        vehicle_registration: reg,
        route_code: incident.route_code || "",
        purpose: "replacement",
        status: "active",
        passengers_expected: Math.min(need, chosen.capacity),
        assigned_by: context.user?.full_name || "Control centre",
        note: `Replacement for ${incident.code}`,
      });
      timeline.push({ status: "Vehicle Assigned", at, note: `${reg} allocated for ${Math.min(need, chosen.capacity)} passengers.` });
      await sdk.entities.Incident.update(incident.id, { status: "Vehicle Assigned", assigned_vehicle: reg, timeline });
      await sdk.entities.Notification.create({
        title: `Replacement ${reg} assigned`,
        message: `${incident.code}: ${Math.min(need, chosen.capacity)} of ${need} affected passengers can be carried by ${reg}.`,
        audience: "all",
        route_code: incident.route_code,
        level: "info",
        requires_ack: true,
      });
      return { ok: true, steps: [`${reg} assigned (capacity ${chosen.capacity}).`], assigned: reg };
    }

    if (data.action === "resolve") {
      timeline.push({ status: "Resolved", at, note: data.note || "Service restored and affected passengers accommodated." });
      await sdk.entities.Incident.update(incident.id, {
        status: "Resolved",
        resolution: data.note || "Service restored.",
        timeline,
      });

      // Normal operation resumes once nothing is left open.
      const all = await many(sdk.entities.Incident, {}, { limit: 60 });
      const stillOpen = all.filter((i) => i.status !== "Resolved" && i.id !== incident.id);
      const steps = ["Incident resolved."];
      if (!stillOpen.length) {
        const disrupted = await many(sdk.entities.BusRoute, { status: "disrupted" }, { limit: 20 });
        for (const r of disrupted) {
          await sdk.entities.BusRoute.update(r.id, { status: "active", note: "Reopened after the incident was resolved." });
        }
        const parked = await many(sdk.entities.GovBus, { status: "maintenance" }, { limit: 20 });
        for (const b of parked) {
          await sdk.entities.GovBus.update(b.id, { status: "active", note: "Back in service after the incident was resolved." });
        }
        await sdk.entities.Notification.create({
          title: "Normal operation restored",
          message: "All roads reopened and affected vehicles are back in service.",
          category: "General Announcement",
          priority: "normal",
          audience: "all",
          level: "success",
        });
        steps.push(`Normal operation restored: ${disrupted.length} road(s) reopened, ${parked.length} bus(es) back in service.`);
      }
      return { ok: true, steps };
    }

    return { ok: false, error: "Unknown action." };
  });

export const saveConfig = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const config = await one(sdk.entities.SystemConfig, { key: "default" });
    if (!config) return { ok: false, error: "Config missing." };
    const patch = {};
    [
      "morning_peak_start", "morning_peak_end", "evening_peak_start", "evening_peak_end",
      "concession_eligibility", "ai_note",
    ].forEach((k) => {
      if (data[k] !== undefined) patch[k] = String(data[k]);
    });
    ["concession_pct", "pass_validity_days", "warning_threshold", "transfer_buffer_min", "fare_base", "fare_per_km", "fare_minimum"].forEach((k) => {
      if (data[k] !== undefined) patch[k] = Number(data[k]);
    });
    if (Array.isArray(data.concession_vehicle_categories)) patch.concession_vehicle_categories = data.concession_vehicle_categories;
    await sdk.entities.SystemConfig.update(config.id, patch);
    return { ok: true, config: { ...config, ...patch } };
  });

export const runScenario = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const scenario = String(data.scenario || "");
    const steps = [];
    const activeTrips = await many(sdk.entities.Trip, { status: "active" }, { limit: 60 });
    const allTrips = await many(sdk.entities.Trip, {}, { limit: 100 });
    const routes = await many(sdk.entities.BusRoute, {}, { limit: 30 });
    const routeBy = new Map(routes.map((r) => [r.code, r]));

    const busTrip = (type, pred = () => true) =>
      activeTrips.find((t) => t.vehicle_type === type && pred(t)) || activeTrips.find((t) => t.vehicle_type === type);

    if (scenario === "normal") {
      const resets = [];
      for (const t of activeTrips) {
        if (t.vehicle_type === "feeder") continue;
        const base = Math.round(t.capacity * (t.progress / 100 > 0.5 ? 0.55 : 0.4));
        resets.push({ id: t.id, manual_count: base, tickets_issued: Math.max(0, base - 2), exits: 0, transfers: 0, boarding_reports: 0, is_full: false, unable_to_board: 0, delay_min: 0, count_updated_at: nowIso() });
      }
      if (resets.length) await sdk.entities.Trip.bulkUpdate(resets);
      await sdk.entities.Incident.updateMany({ status: { $ne: "Resolved" } }, { $set: { status: "Resolved" } }).catch(() => null);
      await sdk.entities.Notification.create({
        title: "Normal operation restored",
        message: "All NH66 services, feeder vans and hubs are running to timetable.",
        audience: "all",
        level: "success",
      });
      return { ok: true, scenario, steps: ["All active services reset to normal counts.", "Open incidents marked resolved.", "No capacity or road warnings active."] };
    }

    if (scenario === "gov_cancel" || scenario === "private_cancel") {
      const type = scenario === "gov_cancel" ? "government" : "private";
      const trip = busTrip(type, (t) => !t.is_full);
      if (!trip) return { ok: false, error: "No active trip available for this scenario." };
      const occ = tripOccupancy(trip);
      await sdk.entities.Trip.update(trip.id, {
        status: "cancelled",
        ended_at: nowIso(),
        note: "Vehicle unavailable — service withdrawn.",
      });
      steps.push(`${trip.vehicle_registration} marked unavailable at ${trip.scheduled_departure}.`);
      steps.push(`${occ.estimated} passengers were estimated on board across ${trip.route_name}.`);

      const alternatives = await many(sdk.entities.Trip, { route_code: trip.route_code, status: "active" }, { limit: 20 });
      const withSpace = alternatives
        .filter((t) => t.vehicle_registration !== trip.vehicle_registration)
        .map((t) => ({ trip: t, occ: tripOccupancy(t) }))
        .filter((x) => x.occ.seats_free >= Math.min(occ.estimated, 20))
        .sort((a, b) => b.occ.seats_free - a.occ.seats_free);
      if (withSpace.length) {
        steps.push(`Closest service with room: ${withSpace[0].trip.vehicle_registration} (${withSpace[0].occ.seats_free} free seats).`);
      } else {
        steps.push("No existing service has enough free capacity — an extra vehicle is required.");
      }

      const candidates = await many(sdk.entities.PrivateBus, { status: "active" }, { limit: 10 });
      const replacement = candidates.find((b) => b.registration !== trip.vehicle_registration);
      if (replacement) {
        await sdk.entities.VehicleAssignment.create({
          code: `ASG-${Math.floor(4000 + Math.random() * 5000)}`,
          vehicle_type: "private",
          vehicle_registration: replacement.registration,
          route_code: trip.route_code,
          purpose: "replacement",
          status: "active",
          passengers_expected: Math.min(occ.estimated, replacement.capacity),
          assigned_by: context.user?.full_name || "Control centre",
          note: `Replacement for cancelled ${trip.trip_code}`,
        });
        steps.push(`${replacement.registration} allocated as replacement (capacity ${replacement.capacity}).`);
      }

      await sdk.entities.Incident.create({
        code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
        type: "breakdown",
        title: `${trip.vehicle_registration} cancelled — ${type} service withdrawn`,
        description: `Service ${trip.trip_code} on ${trip.route_name} cancelled. ${occ.estimated} passengers affected.`,
        status: replacement ? "Vehicle Assigned" : "Action Required",
        severity: "high",
        route_code: trip.route_code,
        vehicle_registration: trip.vehicle_registration,
        reported_role: "admin",
        affected_passengers: occ.estimated,
        assigned_vehicle: replacement?.registration || "",
        timeline: [{ status: "Reported", at: "now", note: "Cancellation entered in the demo panel." }],
      });
      await sdk.entities.Notification.create({
        title: `${trip.vehicle_registration} cancelled`,
        message: `${occ.estimated} students affected. ${replacement ? `${replacement.registration} will serve the same stops 15 minutes later.` : "Wait for a replacement instruction."}`,
        audience: "passenger",
        route_code: trip.route_code,
        trip_code: trip.trip_code,
        level: "critical",
        requires_ack: true,
      });
      await sdk.entities.Notification.create({
        title: `Cover ${trip.route_code} with ${occ.estimated} students`,
        message: `${trip.vehicle_registration} is out. Collect passengers from ${trip.route_name} stops and report your count.`,
        audience: "driver",
        route_code: trip.route_code,
        level: "warning",
        requires_ack: true,
      });
      return { ok: true, scenario, steps };
    }

    if (scenario === "road_disruption") {
      const main = routes.find((r) => r.code === "R-MAIN");
      const alt = routes.find((r) => r.code === "R-MAIN-ALT");
      await sdk.entities.BusRoute.update(main.id, { status: "disrupted" });
      steps.push(`${main.name} flagged disrupted — large buses held off the blocked section.`);
      if (alt) steps.push(`Approved alternative: ${alt.name} (${alt.distance_km} km, +${alt.duration_min - main.duration_min} min).`);
      const affected = activeTrips.filter((t) => t.route_code === "R-MAIN" && t.vehicle_type !== "feeder");
      const reroute = [];
      affected.forEach((t) => {
        reroute.push({ id: t.id, route_code: alt.code, route_name: alt.name, delay_min: (Number(t.delay_min) || 0) + 11, note: "Rerouted via Bekal bypass — road block on NH66." });
      });
      if (reroute.length) await sdk.entities.Trip.bulkUpdate(reroute);
      steps.push(`${reroute.length} active bus(es) rerouted onto the alternative and passengers notified.`);
      const passengers = affected.reduce((sum, t) => sum + tripOccupancy(t).estimated, 0);
      await sdk.entities.Incident.create({
        code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
        type: "road_block",
        title: "NH66 blocked — buses moved to Bekal bypass",
        description: `Road blocked on the main highway. ${affected.length} bus(es) and ${passengers} passengers rerouted.`,
        status: "Vehicle Assigned",
        severity: "high",
        route_code: "R-MAIN",
        affected_passengers: passengers,
        assigned_vehicle: alt?.code || "",
        reported_role: "admin",
        timeline: [{ status: "Reported", at: "now", note: "Road block entered in demo panel." }],
      });
      await sdk.entities.Notification.create({
        title: "NH66 blocked — expect 11 extra minutes",
        message: `Your bus is using the ${alt?.name || "approved alternative"}. ETA updated on the journey view.`,
        audience: "passenger",
        route_code: "R-MAIN",
        level: "warning",
        requires_ack: true,
      });
      return { ok: true, scenario, steps };
    }

    if (scenario === "overcrowding" || scenario === "capacity_full") {
      const trip = busTrip("government", (t) => !t.is_full) || activeTrips[0];
      if (!trip) return { ok: false, error: "No active bus to overcrowd." };
      const target = scenario === "capacity_full" ? trip.capacity : trip.capacity;
      const left = scenario === "capacity_full" ? 8 : 6;
      await sdk.entities.Trip.update(trip.id, {
        manual_count: target,
        is_full: true,
        unable_to_board: left,
        count_updated_at: nowIso(),
      });
      const occ = tripOccupancy({ ...trip, manual_count: target });
      steps.push(`${trip.vehicle_registration} raised to ${occ.estimated}/${occ.capacity} (${occ.pct}%).`);
      steps.push(`Marked FULL — ${left} students unable to board.`);
      const vans = await many(sdk.entities.FeederVehicle, { status: "active" }, { limit: 10 });
      const bus = (await many(sdk.entities.PrivateBus, { status: "active" }, { limit: 10 })).sort((a, b) => b.capacity - a.capacity)[0];
      if (bus) steps.push(`Suggested replacement: ${bus.registration} (${bus.capacity} seats, permit verified).`);
      if (vans[0]) steps.push(`Feeder option: ${vans[0].registration} for up to ${vans[0].capacity}.`);
      await sdk.entities.Incident.create({
        code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
        type: "overcrowding",
        title: `${trip.vehicle_registration} at authorized capacity`,
        description: `${occ.estimated}/${occ.capacity} seats used. ${left} students left at the stop.`,
        status: "Action Required",
        severity: "high",
        route_code: trip.route_code,
        vehicle_registration: trip.vehicle_registration,
        affected_passengers: left,
        reported_role: "driver",
        timeline: [{ status: "Reported", at: "now", note: "Capacity scenario triggered." }],
      });
      await sdk.entities.Notification.create({
        title: `${left} students left behind at ${trip.vehicle_registration}`,
        message: `Bus is FULL at ${occ.capacity}/${occ.capacity}. Extra transport requested.`,
        audience: "admin",
        route_code: trip.route_code,
        trip_code: trip.trip_code,
        level: "critical",
        requires_ack: true,
      });
      await sdk.entities.Notification.create({
        title: "Bus full — do not board",
        message: `${trip.vehicle_registration} has reached capacity. The next service will be announced shortly.`,
        audience: "passenger",
        route_code: trip.route_code,
        level: "warning",
        requires_ack: true,
      });
      return { ok: true, scenario, steps };
    }

    if (scenario === "morning_surge" || scenario === "evening_surge") {
      const evening = scenario === "evening_surge";
      const pool = evening ? allTrips.filter((t) => t.direction === "evening") : activeTrips.filter((t) => t.vehicle_type !== "feeder");
      if (!pool.length) return { ok: false, error: "No trips to surge." };
      const updates = pool.map((t, i) => {
        const load = Math.round(t.capacity * clamp(0.72 + i * 0.06, 0.6, 1));
        return {
          id: t.id,
          status: evening ? "active" : t.status,
          manual_count: load,
          tickets_issued: Math.max(0, load - 2),
          boarding_reports: i % 3 === 0 ? 3 : 0,
          unable_to_board: load >= t.capacity ? 4 : 0,
          is_full: load >= t.capacity,
          delay_min: 2 + (i % 4),
          count_updated_at: nowIso(),
          last_gps_at: nowIso(),
        };
      });
      await sdk.entities.Trip.bulkUpdate(updates);
      const total = updates.reduce((s, u) => s + u.manual_count, 0);
      steps.push(`${evening ? "Evening return" : "Morning"} surge applied across ${updates.length} services.`);
      steps.push(`${total} students now estimated on board; peak window extended by 20 minutes.`);
      steps.push("Control centre advised to hold one extra private bus at Talapady.");
      await sdk.entities.Notification.create({
        title: `${evening ? "Evening" : "Morning"} peak surge detected`,
        message: `${total} students moving on ${updates.length} services. Extra capacity recommended at Uppala and Talapady hubs.`,
        audience: "admin",
        level: "warning",
        requires_ack: true,
      });
      return { ok: true, scenario, steps };
    }

    if (scenario === "village_feeder") {
      const village = (await many(sdk.entities.Village, { feeder_required: true }, { limit: 20 })).find((v) => v.road_type === "blocked")
        || (await many(sdk.entities.Village, { feeder_required: true }, { limit: 20 }))[0];
      const vans = await many(sdk.entities.FeederVehicle, { status: "active" }, { limit: 10 });
      const van = vans.find((v) => (v.village_codes || []).includes(village.code)) || vans[0];
      const hub = (await many(sdk.entities.TransferHub, { code: village.hub_code }, { limit: 1 }))[0];
      const mainTrip = activeTrips.find((t) => t.vehicle_type === "government" && t.route_code === "R-MAIN");
      const arrival = clockToMinutes(mainTrip?.scheduled_departure || "07:35") + 10;
      const depart = arrival - Number(village.distance_to_hub_km || 6) * 3 - 8;
      steps.push(`${village.name}: narrow-road / large-bus restricted, feeder required.`);
      steps.push(`Authorized van ${van.registration} (${van.capacity} seats, permit verified) covers this village.`);
      steps.push(`Depart ${minutesToClock(depart)} → ${hub?.name} at ${minutesToClock(depart + Number(village.distance_to_hub_km || 6) * 3)}.`);
      steps.push(`Main bus ${mainTrip?.vehicle_registration || "NH66 service"} reaches ${hub?.name} at ${minutesToClock(arrival)} — 8 minute transfer buffer.`);
      await sdk.entities.VehicleAssignment.create({
        code: `ASG-${Math.floor(4000 + Math.random() * 5000)}`,
        vehicle_type: "feeder",
        vehicle_registration: van.registration,
        route_code: (await many(sdk.entities.BusRoute, { village_code: village.code }, { limit: 1 }))[0]?.code || "R-F-MAJ",
        village_code: village.code,
        hub_code: village.hub_code,
        purpose: "feeder",
        status: "pending",
        passengers_expected: Math.min(village.students_count || 18, van.capacity),
        assigned_by: context.user?.full_name || "Control centre",
        note: `Timed to the ${mainTrip?.scheduled_departure || "07:35"} main service.`,
      });
      await sdk.entities.Notification.create({
        title: `${village.name} feeder timed to the ${mainTrip?.scheduled_departure || "07:35"} bus`,
        message: `Van ${van.registration} departs ${minutesToClock(depart)} from the village stop. Transfer at ${hub?.name}.`,
        audience: "passenger",
        village_code: village.code,
        level: "info",
        requires_ack: true,
      });
      await sdk.entities.Notification.create({
        title: `Feeder assignment: ${village.name} → ${hub?.name}`,
        message: `${Math.min(village.students_count || 18, van.capacity)} students. Accept in the van console.`,
        audience: "operator",
        village_code: village.code,
        level: "warning",
        requires_ack: true,
      });
      return { ok: true, scenario, steps };
    }

    if (scenario === "extra_private") {
      const bus = (await many(sdk.entities.PrivateBus, { status: "active" }, { limit: 10 })).find((b) => b.registration === "KL-14-B-2002")
        || (await many(sdk.entities.PrivateBus, { status: "active" }, { limit: 10 }))[0];
      const code = `ER-X${Math.floor(100 + Math.random() * 800)}`;
      await sdk.entities.Trip.create({
        trip_code: code,
        vehicle_type: "private",
        vehicle_registration: bus.registration,
        route_code: "R-MAIN",
        route_name: "NH66 Main (extra service)",
        direction: "morning",
        status: "active",
        scheduled_departure: "08:10",
        progress: 4,
        capacity: bus.capacity,
        tickets_issued: 0,
        manual_count: 0,
        lat: 12.51,
        lng: 74.99,
        destination: "Sahyadri College",
        driver_name: bus.driver_name,
        simulated: true,
        last_gps_at: nowIso(),
        count_updated_at: nowIso(),
        note: "Extra private service allocated by the control centre.",
      });
      await sdk.entities.VehicleAssignment.create({
        code: `ASG-${Math.floor(4000 + Math.random() * 5000)}`,
        vehicle_type: "private",
        vehicle_registration: bus.registration,
        route_code: "R-MAIN",
        purpose: "extra",
        status: "active",
        passengers_expected: bus.capacity,
        assigned_by: context.user?.full_name || "Control centre",
        note: "Extra morning capacity.",
      });
      steps.push(`${bus.registration} (${bus.capacity} seats) allocated as an extra NH66 service.`);
      steps.push(`Trip ${code} departs 08:10 and appears on the fleet map immediately.`);
      steps.push("Passengers on the route were notified of the extra departure.");
      await sdk.entities.Notification.create({
        title: `Extra service added at 08:10`,
        message: `${bus.registration} will run the full NH66 route with ${bus.capacity} seats.`,
        audience: "passenger",
        route_code: "R-MAIN",
        level: "success",
        requires_ack: true,
      });
      return { ok: true, scenario, steps };
    }

    if (scenario === "pass_verify") {
      const pass = await one(sdk.entities.StudentPass, { pass_code: "SR-PASS-2026-0142" });
      const trip = busTrip("government") || activeTrips[0];
      if (!pass || !trip) return { ok: false, error: "Pass or trip missing." };
      const result = await issueTicketsCore(sdk, {
        trip_code: trip.trip_code,
        pass_code: pass.pass_code,
        from_stop: "UPP",
        to_stop: "SAH",
        count: 1,
        method: "qr",
        issued_by: context.user?.full_name || "Conductor",
      });
      if (!result.ok) return { ok: false, error: result.error, steps: [result.error] };
      steps.push(`Pass ${pass.pass_code} verified for ${pass.student_name} (${pass.concession_pct}% concession).`);
      steps.push(`Full fare ₹${result.fare.full} − concession ₹${result.fare.concession} = ₹${result.fare.payable} payable.`);
      steps.push(`Concession logged for operator settlement on ${trip.vehicle_registration}.`);
      steps.push(`Occupancy now ${result.occupancy.pct}% (${result.occupancy.estimated}/${result.occupancy.capacity}).`);
      return { ok: true, scenario, steps, ticket: result.ticket };
    }

    if (scenario === "conductor_tickets") {
      const trip = busTrip("government") || activeTrips[0];
      if (!trip) return { ok: false, error: "No active trip." };
      let issued = 0;
      for (let i = 0; i < 3; i += 1) {
        const r = await issueTicketsCore(sdk, { trip_code: trip.trip_code, from_stop: "UPP", to_stop: "SAH", count: 1, method: "cash" });
        if (r.ok) issued += 1;
      }
      const pass = await one(sdk.entities.StudentPass, { pass_code: "SR-PASS-2026-0143" });
      if (pass) {
        const r = await issueTicketsCore(sdk, { trip_code: trip.trip_code, pass_code: pass.pass_code, from_stop: "MAN", to_stop: "SAH", count: 1, method: "qr" });
        if (r.ok) issued += 1;
      }
      const fresh = await one(sdk.entities.Trip, { trip_code: trip.trip_code });
      const occ = tripOccupancy(fresh);
      steps.push(`${issued} tickets issued on ${trip.vehicle_registration}.`);
      steps.push(`Tickets and boarding now update the trip dashboard instantly.`);
      steps.push(`Estimated onboard ${occ.estimated}/${occ.capacity} (${occ.pct}%) — tickets ${occ.tickets}.`);
      return { ok: true, scenario, steps };
    }

    if (scenario === "exam_day") {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const govTrips = activeTrips.filter((t) => t.vehicle_type === "government");
      const affected = govTrips.slice(0, 2);
      if (!affected.length) return { ok: false, error: "No active government services to disrupt." };
      const affectedRoutes = [...new Set(affected.map((t) => t.route_code))];

      for (const t of affected) {
        await sdk.entities.Trip.update(t.id, {
          status: "cancelled",
          ended_at: nowIso(),
          note: "Exam day: bus unavailable.",
        });
        const bus = await one(sdk.entities.GovBus, { registration: t.vehicle_registration });
        if (bus) await sdk.entities.GovBus.update(bus.id, { status: "maintenance", note: "Unavailable — exam-day disruption." });
      }
      steps.push(`${affected.map((t) => t.vehicle_registration).join(" and ")} marked unavailable.`);

      const surge = activeTrips
        .filter((t) => affectedRoutes.includes(t.route_code) && !affected.some((a) => a.id === t.id))
        .map((t) => {
          const base = Number(t.manual_count) || Number(t.tickets_issued) || Math.round(t.capacity * 0.5);
          const next = Math.min(t.capacity, Math.round(base * 1.4));
          return { id: t.id, manual_count: next, is_full: next >= t.capacity, count_updated_at: nowIso() };
        });
      if (surge.length) await sdk.entities.Trip.bulkUpdate(surge);
      steps.push(`Demand +40% applied to ${surge.length} remaining service(s) on ${affectedRoutes.join(", ")}.`);

      const main = routes.find((r) => r.code === "R-MAIN");
      const alt = routes.find((r) => r.code === "R-MAIN-ALT" && r.status === "active")
        || routes.find((r) => r.code !== "R-MAIN" && r.large_bus_allowed && r.kind !== "feeder");
      if (main) {
        await sdk.entities.BusRoute.update(main.id, { status: "disrupted", note: "Flooded — large buses held off this stretch." });
      }
      steps.push(`${main?.name || "Main road"} flooded. ${alt ? `Dry alternative: ${alt.name} (${alt.distance_km} km).` : "No alternative road recorded."}`);

      const students = await many(sdk.entities.Student, {}, { limit: 100 });
      const examSoon = students
        .filter((s) => s.exam_time)
        .map((s) => ({
          name: s.name,
          village: s.village_code,
          pass_code: s.pass_code,
          exam_time: s.exam_time,
          minutes_left: clockToMinutes(String(s.exam_time).slice(0, 5)) - nowMin,
        }))
        .filter((s) => s.minutes_left <= 120 && s.minutes_left >= -30)
        .sort((a, b) => a.minutes_left - b.minutes_left);
      steps.push(
        examSoon.length
          ? `${examSoon.length} student(s) have an exam within 2 hours — ${examSoon.slice(0, 3).map((s) => `${s.name} (${s.exam_time})`).join(", ")}.`
          : "No student has an exam within 2 hours on the current list."
      );

      const buses = (await many(sdk.entities.PrivateBus, { status: "active" }, { limit: 10 }))
        .filter((b) => b.permit_verified && b.approved)
        .sort((a, b) => b.capacity - a.capacity);
      const vans = (await many(sdk.entities.FeederVehicle, { status: "active" }, { limit: 10 }))
        .filter((v) => v.permit_verified && v.approved && v.availability !== false)
        .sort((a, b) => b.capacity - a.capacity);
      const feederRoute = routes.find((r) => r.kind === "feeder");

      let remaining = affected.reduce((sum, t) => sum + tripOccupancy(t).estimated, 0) + examSoon.length * 3;
      const replacements = [];
      for (const bus of buses) {
        if (remaining <= 0 || replacements.length >= 2) break;
        const take = Math.min(Number(bus.capacity) || 0, remaining);
        await sdk.entities.VehicleAssignment.create({
          code: `ASG-${Math.floor(4000 + Math.random() * 5000)}`,
          vehicle_type: "private",
          vehicle_registration: bus.registration,
          route_code: affectedRoutes[0] || "R-MAIN",
          purpose: "replacement",
          status: "active",
          passengers_expected: take,
          assigned_by: context.user?.full_name || "Control centre",
          note: "Exam-day replacement — exam students first.",
        });
        remaining -= take;
        replacements.push({ vehicle: bus.registration, capacity: bus.capacity, carrying: take, type: "private bus" });
      }
      for (const van of vans) {
        if (remaining <= 0 || replacements.length >= 4) break;
        const take = Math.min(Number(van.capacity) || 0, remaining);
        await sdk.entities.VehicleAssignment.create({
          code: `ASG-${Math.floor(4000 + Math.random() * 5000)}`,
          vehicle_type: "feeder",
          vehicle_registration: van.registration,
          route_code: feederRoute?.code || affectedRoutes[0] || "R-MAIN",
          purpose: "feeder",
          status: "pending",
          passengers_expected: take,
          assigned_by: context.user?.full_name || "Control centre",
          note: "Exam-day feeder — village pickups first.",
        });
        remaining -= take;
        replacements.push({ vehicle: van.registration, capacity: van.capacity, carrying: take, type: "feeder van" });
      }
      steps.push(
        replacements.length
          ? `Reallocated ${replacements.map((r) => `${r.vehicle} (${r.carrying})`).join(", ")} — inside every authorized capacity.`
          : "No approved replacement vehicle is free — escalate to the depot."
      );

      for (const t of affected) {
        await sdk.entities.Incident.create({
          code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
          type: "breakdown",
          title: `${t.vehicle_registration} unavailable on exam day`,
          description: `Service ${t.trip_code} on ${t.route_name || t.route_code} withdrawn with exams imminent.`,
          status: replacements.length ? "Vehicle Assigned" : "Action Required",
          severity: "high",
          route_code: t.route_code,
          vehicle_registration: t.vehicle_registration,
          reported_role: "admin",
          affected_passengers: tripOccupancy(t).estimated,
          assigned_vehicle: replacements[0]?.vehicle || "",
          timeline: [{ status: "Reported", at: "now", note: "Exam-day emergency raised by the controller." }],
        });
      }
      if (main) {
        await sdk.entities.Incident.create({
          code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
          type: "road_block",
          title: `${main.name} flooded`,
          description: `Flooding on the main road. Buses routed via ${alt?.name || "the approved dry alternative"}.`,
          status: "Verified",
          severity: "high",
          route_code: main.code,
          affected_passengers: affected.reduce((s, t) => s + tripOccupancy(t).estimated, 0),
          assigned_vehicle: "",
          reported_role: "admin",
          timeline: [{ status: "Reported", at: "now", note: "Flood reported with exams within 2 hours." }],
        });
      }

      await sdk.entities.Notification.create({
        title: "Exam-day emergency: your bus has been replaced",
        message: `Two buses are unavailable and part of ${main?.name || "the main road"} is flooded. ${replacements[0] ? `${replacements[0].vehicle} is covering your route` : "A replacement is being arranged"} — exam students are boarded first. Leave 20 minutes earlier.`,
        category: "Bus Replacement",
        priority: "urgent",
        audience: "passenger",
        level: "critical",
        route_code: affectedRoutes[0] || "R-MAIN",
        requires_ack: true,
      });
      await sdk.entities.Notification.create({
        title: "You are covering an exam-day replacement",
        message: `Collect every exam student first. Authorized capacity is a hard limit and is checked before boarding.`,
        category: "Bus Replacement",
        priority: "important",
        audience: "driver",
        level: "warning",
        route_code: affectedRoutes[0] || "R-MAIN",
        requires_ack: true,
      });

      return { ok: true, scenario, steps, exam_students: examSoon, replacements, affected_routes: affectedRoutes };
    }

    return { ok: false, error: `Unknown scenario: ${scenario}` };
  });

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const sdk = context.getBase44();
    const [trips, tickets, concessions, villages, incidents, routes, passes] = await Promise.all([
      many(sdk.entities.Trip, {}, { limit: 100 }),
      many(sdk.entities.TicketTransaction, {}, { limit: 300 }),
      many(sdk.entities.ConcessionTransaction, {}, { limit: 200 }),
      many(sdk.entities.Village, {}, { limit: 30 }),
      many(sdk.entities.Incident, {}, { limit: 40 }),
      many(sdk.entities.BusRoute, {}, { limit: 30 }),
      many(sdk.entities.StudentPass, {}, { limit: 60 }),
    ]);

    const byRoute = {};
    trips.forEach((t) => {
      const key = t.route_code || "unassigned";
      byRoute[key] = byRoute[key] || { route_code: key, capacity: 0, onboard: 0, tickets: 0, unboarded: 0, trips: 0 };
      const occ = tripOccupancy(t);
      byRoute[key].capacity += occ.capacity;
      byRoute[key].onboard += occ.estimated;
      byRoute[key].tickets += occ.tickets;
      byRoute[key].unboarded += Number(t.unable_to_board) || 0;
      byRoute[key].trips += 1;
    });

    const peak = {};
    trips.forEach((t) => {
      const hour = (t.scheduled_departure || "07:00").slice(0, 2);
      peak[hour] = (peak[hour] || 0) + (Number(t.manual_count) || Number(t.tickets_issued) || 0);
    });

    const contribution = { government: 0, private: 0, feeder: 0 };
    tickets.forEach((t) => {
      const trip = trips.find((x) => x.trip_code === t.trip_code);
      const key = trip?.vehicle_type || "government";
      contribution[key] = (contribution[key] || 0) + 1;
    });

    const concessionTotal = concessions.reduce((s, c) => s + (Number(c.concession_amount) || 0), 0);
    const unboarded = trips.reduce((s, t) => s + (Number(t.unable_to_board) || 0), 0);
    const poorlyConnected = villages
      .filter((v) => v.feeder_required && (v.road_type === "blocked" || !v.large_bus_allowed))
      .map((v) => ({ code: v.code, name: v.name, students: v.students_count, road_type: v.road_type }));

    return {
      ok: true,
      generated_at: nowIso(),
      routes: routes.map((r) => ({ code: r.code, name: r.name, kind: r.kind })),
      byRoute: Object.values(byRoute).sort((a, b) => b.onboard - a.onboard),
      peak: Object.entries(peak).sort().map(([hour, onboard]) => ({ hour: `${hour}:00`, onboard })),
      contribution,
      concession: { count: concessions.length, total: concessionTotal, passes: passes.filter((p) => p.status === "active").length },
      unboarded,
      incidents: {
        total: incidents.length,
        open: incidents.filter((i) => i.status !== "Resolved").length,
        byStatus: incidents.reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] || 0) + 1 }), {}),
      },
      poorlyConnected,
    };
  });

export const aiAnalyze = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const question = String(data?.question || "Where should the control centre add capacity on this corridor?").slice(0, 500);
    const focus = String(data?.focus || "general");

    const [trips, villages, routes, incidents, config, tickets, assignments] = await Promise.all([
      many(sdk.entities.Trip, {}, { limit: 100 }),
      many(sdk.entities.Village, {}, { limit: 30 }),
      many(sdk.entities.BusRoute, {}, { limit: 30 }),
      many(sdk.entities.Incident, {}, { limit: 30 }),
      one(sdk.entities.SystemConfig, { key: "default" }),
      many(sdk.entities.TicketTransaction, {}, { limit: 200 }),
      many(sdk.entities.VehicleAssignment, {}, { limit: 40 }),
    ]);

    const tripFacts = trips.map((t) => {
      const occ = tripOccupancy(t);
      return {
        trip_code: t.trip_code,
        vehicle: t.vehicle_registration,
        type: t.vehicle_type,
        route: t.route_code,
        status: t.status,
        departure: t.scheduled_departure,
        tickets_issued: occ.tickets,
        manual_count: occ.manual,
        estimated_onboard: occ.estimated,
        authorized_capacity: occ.capacity,
        occupancy_pct: occ.pct,
        occupancy_level: occ.level,
        unable_to_board: Number(t.unable_to_board) || 0,
        delay_min: Number(t.delay_min) || 0,
      };
    });

    const villageFacts = villages.map((v) => ({
      village: v.name,
      road_type: v.road_type,
      large_bus_allowed: !!v.large_bus_allowed,
      students: v.students_count,
      hub: v.hub_code,
      distance_to_hub_km: v.distance_to_hub_km,
    }));

    const incidentFacts = incidents.map((i) => ({
      code: i.code,
      type: i.type,
      status: i.status,
      severity: i.severity,
      route: i.route_code,
      affected: i.affected_passengers,
    }));

    const fareFacts = {
      base: config?.fare_base ?? DEFAULT_FARE.base,
      per_km: config?.fare_per_km ?? DEFAULT_FARE.per_km,
      concession_pct: config?.concession_pct ?? 60,
      peak_morning: `${config?.morning_peak_start || "06:45"}–${config?.morning_peak_end || "09:15"}`,
      peak_evening: `${config?.evening_peak_start || "16:30"}–${config?.evening_peak_end || "19:00"}`,
    };

    const payload = {
      corridor: "Kasaragod → Sahyadri College along NH66 with feeder villages",
      trips: tripFacts,
      villages: villageFacts,
      routes: routes.map((r) => ({ code: r.code, name: r.name, kind: r.kind, status: r.status, km: r.distance_km, large_bus_allowed: r.large_bus_allowed })),
      incidents: incidentFacts,
      assignments: assignments.map((a) => ({ vehicle: a.vehicle_registration, purpose: a.purpose, status: a.status, route: a.route_code })),
      ticketing: { tickets: tickets.length, concession_transactions: tickets.filter((t) => Number(t.concession_amount) > 0).length },
      rules: fareFacts,
    };

    const prompt = `You are the analysis assistant inside EASY RIDE, a coordination platform for rural college transport in coastal Karnataka.

Hard rules:
- Use ONLY the JSON data supplied below. Never invent vehicles, registrations, permits, passenger counts, routes, villages or incidents that are not in the data.
- Every number you state must be traceable to a record in the data. Name the trip codes / village names / incident codes you used.
- Capacity is a hard legal limit; never suggest exceeding a vehicle's authorized capacity.
- Large buses cannot be routed onto villages where large_bus_allowed is false.
- AI only predicts, analyses, recommends and explains. Fares, eligibility and capacity are enforced in code.
- If the data cannot answer the question, say what is missing instead of guessing.
- Keep it under 200 words, plain language, no markdown headings, no bullet symbols other than short dashes.

Question: ${question}
Focus: ${focus}

DATA:
${JSON.stringify(payload)}`;

    const answer = await sdk.asServiceRole.integrations.Core.InvokeLLM({ prompt });

    return {
      ok: true,
      answer: typeof answer === "string" ? answer : JSON.stringify(answer),
      used: {
        trips: tripFacts.length,
        villages: villageFacts.length,
        incidents: incidentFacts.length,
        tickets: tickets.length,
        generated_at: nowIso(),
      },
      context: payload,
    };
  });