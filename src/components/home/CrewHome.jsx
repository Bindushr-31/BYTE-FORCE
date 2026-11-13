import { Link } from "@tanstack/react-router";
import { ArrowRight, Plus, Minus, Flag, Navigation, Users, TriangleAlert, Loader2 } from "lucide-react";
import OccupancyMeter from "@/components/er/OccupancyMeter";
import { ROLE_LABEL } from "@/lib/roles";
import { useOpsData } from "@/lib/useOps";
import { useServerFn } from "@tanstack/react-start";
import { updateTripCount } from "@/lib/server-fns";
import { useState } from "react";
import { toast } from "sonner";

export default function CrewHome({ role }) {
  if (role === "operator") return <OperatorHome />;
  if (role === "volunteer") return <VolunteerHome />;
  return <DriverHome role={role} />;
}

function DriverHome({ role }) {
  const { loading, trips = [], routes = [], notifications = [], reload } = useOpsData();
  const updateCount = useServerFn(updateTripCount);
  const [busy, setBusy] = useState(false);
  const type = role === "private_driver" ? "private" : "government";
  const mine = trips.filter((t) => t.vehicle_type === type);
  const trip = mine.find((t) => t.status === "active") || mine[0];

  async function counter(delta) {
    if (!trip) return;
    setBusy(true);
    const res = await updateCount({ data: { trip_code: trip.trip_code, delta } });
    setBusy(false);
    if (!res?.ok) return toast.error(res?.error || "Count not updated.");
    reload();
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (!trip) return <div className="er-card p-6 text-[13px] text-muted-foreground">No trip assigned yet.</div>;

  const route = routes.find((r) => r.code === trip.route_code);
  const notes = notifications.filter((n) => ["driver", "all"].includes(n.audience)).slice(0, 2);

  return (
    <div className="space-y-4">
      <div className="er-hero rounded-3xl px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">{ROLE_LABEL[role]} · trip console</div>
            <h1 className="mt-1.5 font-display text-[24px] font-extrabold text-white sm:text-[28px]">
              {trip.trip_code} · {trip.status}
            </h1>
            <p className="mt-1.5 text-[12.5px] text-white/70">{route?.name || trip.route_code} · departs {trip.scheduled_departure}</p>
          </div>
          <Link to="/driver" className="rounded-xl bg-white/10 px-3 py-2 text-[11px] font-semibold text-white ring-1 ring-white/20">
            Full console
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="er-card p-4 lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="er-label">Onboard estimate</div>
              <div className="font-mono text-[12px] font-semibold text-brand-navy">{trip.vehicle_registration}</div>
            </div>
            <div className="text-[11px] text-muted-foreground">→ {trip.destination || "Sahyadri College"}</div>
          </div>
          <div className="mt-3"><OccupancyMeter trip={trip} /></div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {["+1", "+5", "−1", "−5"].map((label) => {
              const delta = label.startsWith("+") ? Number(label.slice(1)) : -Number(label.slice(1));
              return (
                <button key={label} disabled={busy} onClick={() => counter(delta)} className="rounded-xl border border-border bg-white py-3 text-[13px] font-bold text-brand-navy transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50">
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link to="/driver" className="rounded-xl bg-rose-600 py-2.5 text-center text-[12px] font-bold text-white">Mark FULL</Link>
            <Link to="/incidents" className="rounded-xl border border-border py-2.5 text-center text-[12px] font-semibold text-slate-600">Report issue</Link>
          </div>
        </div>
        <div className="space-y-3 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2">Admin instructions</div>
            {notes.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No instructions right now.</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="mb-2 rounded-lg border border-border/70 p-2">
                  <div className="text-[11.5px] font-semibold text-brand-navy">{n.title}</div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{n.message}</div>
                </div>
              ))
            )}
            <Link to="/notifications" className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
              Acknowledge <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="er-card p-4">
            <div className="er-label mb-2">Next stop</div>
            <div className="text-[13px] font-semibold text-brand-navy">
              {route?.stops?.[Math.min((route.stops?.length || 1) - 1, Math.ceil(((trip.progress || 0) / 100) * (route?.stops?.length || 1)))]?.name || "—"}
            </div>
            <div className="mt-1 text-[11.5px] text-muted-foreground">Progress {trip.progress || 0}% · delay {trip.delay_min || 0} min</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OperatorHome() {
  const { loading, feeders = [], assignments = [], routes = [], hubs = [] } = useOpsData();
  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  const pending = assignments.filter((a) => a.vehicle_type === "feeder" && a.status === "pending");

  return (
    <div className="space-y-4">
      <div className="er-hero rounded-3xl px-5 py-6">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Authorized vehicle operator</div>
        <h1 className="mt-1.5 font-display text-[24px] font-extrabold text-white sm:text-[28px]">RuralLink Feeder Services</h1>
        <p className="mt-1.5 text-[12.5px] text-white/70">
          {feeders.length} authorized vans · {pending.length} feeder assignment{pending.length === 1 ? "" : "s"} awaiting confirmation.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(pending.length ? pending : assignments.filter((a) => a.vehicle_type === "feeder")).slice(0, 4).map((a) => (
          <div key={a.id} className="er-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-brand-navy">
                {routes.find((r) => r.code === a.route_code)?.name || a.route_code}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${a.status === "pending" ? "bg-amber-50 text-amber-700 ring-amber-600/15" : "bg-emerald-50 text-emerald-700 ring-emerald-600/15"}`}>
                {a.status}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {a.passengers_expected} students</span>
              <span>{hubs.find((h) => h.code === a.hub_code)?.name || a.hub_code}</span>
            </div>
            <Link to="/operator" className="mt-3 block rounded-lg bg-primary py-2 text-center text-[11.5px] font-semibold text-white">
              Open assignments
            </Link>
          </div>
        ))}
        {assignments.length === 0 && <div className="er-card p-4 text-[12px] text-muted-foreground">No assignments yet.</div>}
      </div>
    </div>
  );
}

function VolunteerHome() {
  const { loading, villages = [], notifications = [] } = useOpsData();
  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  const tasks = notifications.filter((n) => ["volunteer", "all"].includes(n.audience) && n.requires_ack && !n.acknowledged);
  const area = villages.filter((v) => !v.large_bus_allowed).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="er-hero rounded-3xl px-5 py-6">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Volunteer · village network</div>
        <h1 className="mt-1.5 font-display text-[24px] font-extrabold text-white sm:text-[28px]">
          {area.map((v) => v.name).join(" & ") || "Village desk"}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-white/70">{tasks.length} task{tasks.length === 1 ? "" : "s"} to acknowledge.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { t: "Report waiting count", d: "Tell the control centre how many students are at the stop", i: Users },
          { t: "Bus is full", d: "Report a bus that passed without stopping", i: TriangleAlert },
          { t: "Road hazard", d: "Log a blocked or flooded road", i: Flag },
          { t: "Request extra transport", d: "Ask for a van or an extra service", i: Navigation },
        ].map((a) => (
          <Link key={a.t} to="/volunteer" className="er-card flex items-start gap-3 p-4 text-left transition hover:border-primary/30">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/8 text-primary"><a.i className="h-4 w-4" /></span>
            <span>
              <span className="block text-[12.5px] font-semibold text-brand-navy">{a.t}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{a.d}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="er-card flex items-center justify-between gap-2 p-4">
        <div>
          <div className="er-label">Quick counter</div>
          <div className="text-[12px] text-muted-foreground">Use the village desk for counts and reports.</div>
        </div>
        <Link to="/volunteer" className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-3 py-2 text-[11.5px] font-semibold text-white">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}