import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useOpsData } from "@/lib/useOps";
import { useRole } from "@/lib/useRole";
import { updateTripCount, advanceSimulation } from "@/lib/server-fns";
import { computeOccupancy, timeAgo, minutesToClock, clockToMinutes } from "@/lib/mobility";
import PageHeader from "@/components/er/PageHeader";
import OccupancyMeter from "@/components/er/OccupancyMeter";
import { Play, Square, Navigation, AlertTriangle, Plus, Minus, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authed/driver")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Trip console" }] }),
  component: DriverPage,
});

function DriverPage() {
  const role = useRole();
  const { loading, trips = [], routes = [], notifications = [], reload } = useOpsData();
  const updateCount = useServerFn(updateTripCount);
  const advance = useServerFn(advanceSimulation);

  const type = role === "private_driver" ? "private" : "government";
  const mine = useMemo(
    () => trips.filter((t) => t.vehicle_type === type || (role === "admin" && t.vehicle_type !== "feeder")),
    [trips, type, role]
  );
  const [tripCode, setTripCode] = useState(null);
  const [busy, setBusy] = useState(false);

  const trip = mine.find((t) => t.trip_code === tripCode) || mine.find((t) => t.status === "active") || mine[0];
  const route = routes.find((r) => r.code === trip?.route_code);
  const occ = trip
    ? computeOccupancy({
        capacity: trip.capacity,
        tickets: trip.tickets_issued,
        manual: trip.manual_count,
        exited: trip.exits,
        transferred: trip.transfers,
        boarding_reports: trip.boarding_reports,
      })
    : null;

  const nextStop = route?.stops?.[Math.min((route.stops?.length || 1) - 1, Math.ceil(((trip?.progress || 0) / 100) * (route?.stops?.length || 1)))];

  useEffect(() => {
    if (trip && !tripCode) setTripCode(trip.trip_code);
  }, [trip, tripCode]);

  async function setStatus(status) {
    if (!trip) return;
    setBusy(true);
    await base44.entities.Trip.update(trip.id, {
      status,
      started_at: status === "active" ? new Date().toISOString() : trip.started_at,
      ended_at: status === "completed" ? new Date().toISOString() : undefined,
      last_gps_at: new Date().toISOString(),
    });
    setBusy(false);
    toast.success(status === "active" ? "Trip started · GPS sharing on (simulated)" : "Trip ended");
    reload();
  }

  async function counter(patch) {
    if (!trip) return;
    setBusy(true);
    const res = await updateCount({ data: { trip_code: trip.trip_code, ...patch } });
    setBusy(false);
    if (!res?.ok) return toast.error(res?.error || "Count not updated.");
    reload();
  }

  async function shareGps() {
    setBusy(true);
    const res = await advance({ data: { step: 3 } });
    setBusy(false);
    if (res?.ok) {
      toast.success("GPS position shared with the control centre (simulated)");
      reload();
    }
  }

  async function report(type, title) {
    if (!trip) return;
    setBusy(true);
    await base44.entities.Incident.create({
      code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
      type,
      title,
      description: `${title} reported by ${trip.driver_name || "driver"} on ${trip.vehicle_registration} (${trip.route_code}).`,
      status: "Reported",
      severity: type === "breakdown" ? "high" : "medium",
      route_code: trip.route_code,
      vehicle_registration: trip.vehicle_registration,
      reported_by: trip.driver_name || "Driver",
      reported_role: role,
      affected_passengers: occ?.estimated || 0,
      lat: trip.lat,
      lng: trip.lng,
      timeline: [{ status: "Reported", at: minutesToClock(new Date().getHours() * 60 + new Date().getMinutes()), note: "Reported from the driver console." }],
    });
    await base44.entities.Notification.create({
      title: title,
      message: `${trip.vehicle_registration} · ${trip.route_code}. Control centre notified.`,
      audience: "admin",
      route_code: trip.route_code,
      trip_code: trip.trip_code,
      level: "critical",
      requires_ack: true,
    });
    setBusy(false);
    toast.success("Incident reported to the control centre");
    reload();
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (!trip) return <div className="er-card p-6 text-[13px] text-muted-foreground">No trip assigned to this driver yet.</div>;

  const assignments = notifications.filter((n) => n.audience === "driver" || n.audience === "all").slice(0, 3);

  return (
    <div>
      <PageHeader
        eyebrow={`${type === "private" ? "Private" : "Government"} bus driver`}
        title="Trip console"
        description="Start the trip, share GPS, keep the passenger counter honest and report anything that blocks the road."
        actions={
          <select
            value={trip.trip_code}
            onChange={(e) => setTripCode(e.target.value)}
            className="rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-primary/20"
          >
            {mine.map((t) => (
              <option key={t.trip_code} value={t.trip_code}>
                {t.vehicle_registration} · {t.scheduled_departure} · {t.status}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="er-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-mono text-[13px] font-semibold text-brand-navy">{trip.vehicle_registration}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{trip.route_name || route?.name}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                trip.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15"
                  : trip.status === "cancelled" ? "bg-rose-50 text-rose-700 ring-rose-600/15"
                  : "bg-slate-100 text-slate-600 ring-slate-300/40"
              }`}>
                {trip.status}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/60 p-2">
                <div className="er-label">Departure</div>
                <div className="text-[13px] font-bold text-brand-navy">{trip.scheduled_departure}</div>
              </div>
              <div className="rounded-xl bg-muted/60 p-2">
                <div className="er-label">Destination</div>
                <div className="truncate text-[13px] font-bold text-brand-navy">{trip.destination || "Sahyadri College"}</div>
              </div>
              <div className="rounded-xl bg-muted/60 p-2">
                <div className="er-label">Delay</div>
                <div className={`text-[13px] font-bold ${trip.delay_min > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {trip.delay_min > 0 ? `+${trip.delay_min} min` : "On time"}
                </div>
              </div>
            </div>

            <div className="mt-4"><OccupancyMeter trip={trip} /></div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {[{ l: "+1", d: 1 }, { l: "+5", d: 5 }, { l: "−1", d: -1 }, { l: "−5", d: -5 }].map((b) => (
                <button
                  key={b.l}
                  disabled={busy}
                  onClick={() => counter({ delta: b.d })}
                  className="rounded-xl border border-border bg-white py-3 text-[13px] font-bold text-brand-navy transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                >
                  {b.l}
                </button>
              ))}
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => counter({ mark_full: true, unable_to_board: 5 })}
                disabled={busy}
                className="rounded-xl bg-rose-600 py-2.5 text-[12px] font-bold text-white disabled:opacity-50"
              >
                Mark FULL · passengers left behind
              </button>
              <button
                onClick={shareGps}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-[12px] font-semibold text-slate-600 disabled:opacity-50"
              >
                <Navigation className="h-3.5 w-3.5" /> Share GPS now
              </button>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {trip.status === "active" ? (
                <button onClick={() => setStatus("completed")} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-navy py-2.5 text-[12px] font-semibold text-white disabled:opacity-50">
                  <Square className="h-3.5 w-3.5" /> End trip
                </button>
              ) : (
                <button onClick={() => setStatus("active")} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50">
                  <Play className="h-3.5 w-3.5" /> Start trip
                </button>
              )}
              <Link to="/conductor" className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-[12px] font-semibold text-slate-600">
                Open ticket counter <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-2 text-[10.5px] text-muted-foreground">
              Last GPS {timeAgo(trip.last_gps_at)} · simulated position · next stop {nextStop?.name || "—"}
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2">Report an issue</div>
            <div className="space-y-2">
              <button onClick={() => report("breakdown", "Breakdown reported by driver")} disabled={busy} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-[11.5px] font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Vehicle breakdown
              </button>
              <button onClick={() => report("road_block", "Road block reported by driver")} disabled={busy} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-[11.5px] font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" /> Road blocked
              </button>
              <button onClick={() => counter({ delta: 0 })} disabled={busy} className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-[11.5px] font-semibold text-slate-600 hover:border-primary/30 hover:text-primary">
                <Minus className="h-3.5 w-3.5" /> Log a delay (+{trip.delay_min || 0} min so far)
              </button>
            </div>
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Instructions & alerts</div>
            {assignments.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No instructions for you right now.</p>
            ) : (
              <div className="space-y-2">
                {assignments.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border/70 p-2.5">
                    <div className="text-[11.5px] font-semibold text-brand-navy">{n.title}</div>
                    <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{n.message}</div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/notifications" className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
              Acknowledge in notifications <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Capacity rule</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Authorized capacity for this vehicle is <span className="font-semibold text-brand-navy">{trip.capacity}</span>.
              The counter is capped at that number — the app refuses to record more passengers than the permit allows.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}