import { Link } from "@tanstack/react-router";
import { ArrowRight, Bus, TriangleAlert, FlaskConical, Sparkles, Shuffle, ShieldAlert } from "lucide-react";
import CorridorStrip from "@/components/er/CorridorStrip";
import StatTile from "@/components/er/StatTile";
import OccupancyMeter from "@/components/er/OccupancyMeter";
import { computeOccupancy } from "@/lib/mobility";

export default function AdminHome({ data }) {
  const { trips = [], villages = [], incidents = [], permits = [], volunteers = [], assignments = [], routes = [] } = data;

  const active = trips.filter((t) => t.status === "active");
  const cancelled = trips.filter((t) => t.status === "cancelled");
  const overcrowded = active.filter((t) => {
    const o = computeOccupancy({
      capacity: t.capacity, tickets: t.tickets_issued, manual: t.manual_count,
      exited: t.exits, transferred: t.transfers, boarding_reports: t.boarding_reports,
    });
    return o.pct >= 80;
  });
  const pending = permits.filter((p) => p.status === "pending").length + volunteers.filter((v) => v.status === "pending").length;
  const poorlyConnected = villages.filter((v) => v.feeder_required && !v.large_bus_allowed);
  const departures = [...active].sort((a, b) => (a.scheduled_departure || "").localeCompare(b.scheduled_departure)).slice(0, 3);
  const openIncidents = incidents.filter((i) => i.status !== "Resolved").slice(0, 3);
  const emergency = incidents.filter((i) => i.status !== "Resolved" && i.severity === "high");

  return (
    <div className="space-y-4">
      {emergency.length > 0 && (
        <Link
          to="/incidents"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3"
        >
          <span className="inline-flex items-center gap-2 text-[12.5px] font-extrabold text-rose-800">
            <ShieldAlert className="h-4 w-4" /> Emergency: {emergency.length} high-severity incident{emergency.length === 1 ? "" : "s"} open
          </span>
          <span className="text-[11px] font-semibold text-rose-700">
            {emergency[0]?.title} · open incident workflow →
          </span>
        </Link>
      )}

      <div className="er-hero overflow-hidden rounded-3xl px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Control centre · Kasaragod district</div>
            <h1 className="mt-1.5 font-display text-[23px] font-extrabold leading-tight text-white sm:text-[29px]">
              Kasaragod → Sahyadri College
            </h1>
            <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-white/70">
              Government and private buses on NH66, feeder vans through {villages.length} villages, one coordinated peak.
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15">
            <div className="text-[10px] uppercase tracking-[0.14em] text-white/60">Morning peak</div>
            <div className="font-display text-[17px] font-bold text-white">
              {data.config?.morning_peak_start || "06:45"} – {data.config?.morning_peak_end || "09:15"}
            </div>
          </div>
        </div>
        <div className="mt-6"><CorridorStrip /></div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { k: "Active buses", v: active.filter((t) => t.vehicle_type !== "feeder").length },
            { k: "Feeder vans", v: active.filter((t) => t.vehicle_type === "feeder").length },
            { k: "Villages linked", v: villages.length },
          ].map((m) => (
            <div key={m.k} className="rounded-xl bg-white/[0.07] px-3 py-2 ring-1 ring-white/10">
              <div className="font-display text-[18px] font-extrabold text-white">{m.v}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-white/55">{m.k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active trips" value={active.length} hint={`${active.filter((t) => t.vehicle_type === "government").length} gov · ${active.filter((t) => t.vehicle_type === "private").length} private`} icon={Bus} tone="blue" />
        <StatTile label="Near / at capacity" value={overcrowded.length} hint="80% of authorized capacity or more" icon={TriangleAlert} tone="amber" />
        <StatTile label="Cancelled services" value={cancelled.length} hint="replacement status in incidents" tone="rose" />
        <StatTile label="Pending approvals" value={pending} hint="permits & volunteers" tone="teal" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="er-card p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="er-label">Live departures</div>
              <div className="text-[13px] font-semibold text-brand-navy">Occupancy engine · fused counts</div>
            </div>
            <Link to="/map" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
              Fleet map <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {departures.length === 0 && <p className="text-[11.5px] text-muted-foreground">No active trips right now.</p>}
            {departures.map((t) => (
              <Link key={t.id} to="/map" className="block rounded-xl border border-border/80 bg-white p-3 transition hover:border-primary/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${t.vehicle_type === "government" ? "bg-primary" : t.vehicle_type === "private" ? "bg-violet-500" : "bg-teal-500"}`} />
                    <span className="font-mono text-[12px] font-semibold text-brand-navy">{t.vehicle_registration}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{t.route_code}</span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">{t.scheduled_departure}</div>
                </div>
                <div className="mt-2"><OccupancyMeter trip={t} /></div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2.5">Needs attention</div>
            <div className="space-y-2">
              {openIncidents.length === 0 && <p className="text-[11.5px] text-muted-foreground">No open incidents.</p>}
              {openIncidents.map((inc) => (
                <Link key={inc.id} to="/incidents" className="block rounded-xl border border-border/70 p-2.5 transition hover:border-primary/30 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-[12.5px] font-semibold leading-snug text-brand-navy">{inc.title}</div>
                    <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-rose-700 ring-1 ring-rose-600/15">
                      {inc.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {inc.affected_passengers || 0} students affected · {routes.find((r) => r.code === inc.route_code)?.name || inc.route_code}
                  </div>
                </Link>
              ))}
              <Link to="/allocations" className="block rounded-xl border border-border/70 p-2.5 transition hover:border-primary/30">
                <div className="text-[12.5px] font-semibold leading-snug text-brand-navy">
                  {poorlyConnected.length} villages restricted for large buses
                </div>
                <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {poorlyConnected.slice(0, 3).map((v) => v.name).join(" · ")} need feeders.
                </div>
              </Link>
            </div>
          </div>

          <div className="er-card overflow-hidden">
            <div className="border-b border-border/70 bg-muted/40 px-4 py-2.5">
              <div className="er-label">Presenter shortcuts</div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              {[
                { to: "/demo", label: "Demo panel", icon: FlaskConical },
                { to: "/allocations", label: "Allocations", icon: Shuffle },
                { to: "/ai", label: "AI insights", icon: Sparkles },
                { to: "/conductor", label: "Ticketing", icon: Bus },
              ].map((q) => (
                <Link key={q.to} to={q.to} className="flex items-center gap-1.5 rounded-lg border border-border/80 px-2.5 py-2 text-[11.5px] font-semibold text-slate-600 transition hover:border-primary/30 hover:text-primary">
                  <q.icon className="h-3.5 w-3.5" /> {q.label}
                </Link>
              ))}
            </div>
            <div className="border-t border-border/70 px-3 py-2 text-[10px] text-muted-foreground">
              {assignments.filter((a) => a.status === "active").length} active assignments · {active.length} trips reporting GPS (simulated)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}