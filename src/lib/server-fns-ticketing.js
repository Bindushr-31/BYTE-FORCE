import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/auth-middleware";
import { computeOccupancy } from "@/lib/mobility";

/**
 * Conductor ticketing lifecycle: boarding is recorded when a ticket is issued
 * (see issueTickets), alighting and reversals are recorded here. Every count
 * change writes a BoardingEvent whose unique key makes it impossible to
 * process the same event twice.
 */

const nowIso = () => new Date().toISOString();
const listOf = (res) => res?.items ?? res ?? [];

async function one(entity, query) {
  const items = listOf(await entity.filter(query, { limit: 1 }));
  return items[0] || null;
}

function occupancyOf(trip) {
  return computeOccupancy({
    capacity: trip.capacity,
    tickets: trip.tickets_issued,
    manual: trip.manual_count,
    exited: trip.exits,
    transferred: trip.transfers,
    boarding_reports: trip.boarding_reports,
  });
}

async function recordOccupancy(sdk, trip, occ, by) {
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
    recorded_by: by,
  });
}

/** Active tickets on a trip that are due to alight at a stop. */
export const getAlightingQueue = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const trip = await one(sdk.entities.Trip, { trip_code: String(data?.trip_code || "") });
    if (!trip) return { ok: false, error: "Trip not found." };
    const stopCode = String(data?.stop_code || "");
    const active = listOf(
      await sdk.entities.TicketTransaction.filter({ trip_code: trip.trip_code, status: "active" }, { limit: 100 })
    );
    const due = stopCode ? active.filter((t) => t.to_stop === stopCode) : active;
    return {
      ok: true,
      stop_code: stopCode,
      tickets: due.map((t) => ({
        id: t.id,
        ticket_id: t.ticket_id,
        passenger_count: Number(t.passenger_count) || 1,
        student_name: t.student_name,
        to_stop: t.to_stop,
        issued_at: t.issued_at || t.created_at,
      })),
    };
  });

/**
 * Conductor confirms alighting. Nothing is subtracted from GPS alone: this is
 * only called from the confirmation prompt. Repeating it is a no-op.
 */
export const confirmAlighting = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const by = context.user?.full_name || "Conductor";
    const trip = await one(sdk.entities.Trip, { trip_code: String(data?.trip_code || "") });
    if (!trip) return { ok: false, error: "Trip not found." };

    const stopCode = String(data?.stop_code || "");
    const active = listOf(
      await sdk.entities.TicketTransaction.filter({ trip_code: trip.trip_code, status: "active" }, { limit: 100 })
    );
    const wanted = Array.isArray(data?.ticket_ids) && data.ticket_ids.length
      ? active.filter((t) => data.ticket_ids.includes(t.id) || data.ticket_ids.includes(t.ticket_id))
      : active.filter((t) => t.to_stop === stopCode);

    if (!wanted.length) return { ok: false, error: "No active tickets are due to alight here." };

    let passengers = 0;
    let confirmed = 0;
    let already = 0;

    for (const ticket of wanted) {
      const ticketId = ticket.ticket_id || ticket.id;
      const eventKey = `alight:${ticketId}`;
      if (await one(sdk.entities.BoardingEvent, { event_key: eventKey })) {
        already += 1;
        continue;
      }
      const n = Math.max(1, Number(ticket.passenger_count) || 1);
      await sdk.entities.BoardingEvent.create({
        event_key: eventKey,
        type: "alight",
        ticket_id: ticketId,
        trip_code: trip.trip_code,
        vehicle_registration: trip.vehicle_registration,
        stop_code: stopCode || ticket.to_stop,
        passenger_count: n,
        source: "conductor",
        recorded_at: nowIso(),
        recorded_by: by,
        note: `Alighted at ${stopCode || ticket.to_stop}`,
      });
      await sdk.entities.TicketTransaction.update(ticket.id, {
        status: "alighted",
        alighted_at: nowIso(),
        alighted_stop: stopCode || ticket.to_stop,
      });
      passengers += n;
      confirmed += 1;
    }

    const fresh = await one(sdk.entities.Trip, { trip_code: trip.trip_code });
    const patch = {
      exits: (Number(fresh.exits) || 0) + passengers,
      manual_count: Math.max(0, (Number(fresh.manual_count) || 0) - passengers),
      count_updated_at: nowIso(),
    };
    const after = occupancyOf({ ...fresh, ...patch });
    patch.is_full = after.pct >= 100;
    await sdk.entities.Trip.update(fresh.id, patch);
    await recordOccupancy(sdk, { ...fresh, ...patch }, after, by);

    return { ok: true, confirmed, passengers, already_confirmed: already, occupancy: after };
  });

/** Cancel or refund a ticket, reversing the count only while it is still onboard. */
export const cancelTicket = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const by = context.user?.full_name || "Conductor";
    const code = String(data?.ticket_id || "");
    let ticket = code ? await one(sdk.entities.TicketTransaction, { ticket_id: code }) : null;
    if (!ticket && data?.record_id) {
      ticket = await sdk.entities.TicketTransaction.get(String(data.record_id)).catch(() => null);
    }
    if (!ticket) return { ok: false, error: "Ticket not found." };
    if (ticket.status !== "active") {
      return { ok: false, error: `Ticket ${ticket.ticket_id || ticket.id} is already ${ticket.status}.` };
    }

    const status = data?.refund ? "refunded" : "cancelled";
    const ticketId = ticket.ticket_id || ticket.id;
    const eventKey = `${status}:${ticketId}`;
    if (await one(sdk.entities.BoardingEvent, { event_key: eventKey })) {
      return { ok: false, error: "This ticket was already reversed." };
    }

    const n = Math.max(1, Number(ticket.passenger_count) || 1);
    await sdk.entities.BoardingEvent.create({
      event_key: eventKey,
      type: data?.refund ? "refund" : "cancel",
      ticket_id: ticketId,
      trip_code: ticket.trip_code,
      vehicle_registration: ticket.vehicle_registration,
      stop_code: ticket.from_stop,
      passenger_count: n,
      source: "conductor",
      recorded_at: nowIso(),
      recorded_by: by,
      note: data?.reason || `${status} by ${by}`,
    });
    await sdk.entities.TicketTransaction.update(ticket.id, {
      status,
      cancellation_reason: data?.reason || `${status} by ${by}`,
      alighted_at: nowIso(),
    });

    const trip = await one(sdk.entities.Trip, { trip_code: ticket.trip_code });
    if (!trip) return { ok: true, status, passengers: n, occupancy: null };

    const patch = {
      tickets_issued: Math.max(0, (Number(trip.tickets_issued) || 0) - n),
      manual_count: Math.max(0, (Number(trip.manual_count) || 0) - n),
      count_updated_at: nowIso(),
    };
    const after = occupancyOf({ ...trip, ...patch });
    patch.is_full = after.pct >= 100;
    await sdk.entities.Trip.update(trip.id, patch);
    await recordOccupancy(sdk, { ...trip, ...patch }, after, by);

    return { ok: true, status, passengers: n, occupancy: after };
  });