import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOpsData } from "@/lib/useOps";
import { planJourneys } from "@/lib/journey";
import { formatINR, levelClasses } from "@/lib/mobility";
import PageHeader from "@/components/er/PageHeader";
import { ArrowRight, MapPin, ShieldAlert, Clock, Loader2, Truck, BusFront, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/journey")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Find transport" }] }),
  component: JourneyPage,
});

function JourneyPage() {
  const { loading, villages = [], routes = [], trips = [], hubs = [], config } = useOpsData();
  const [villageCode, setVillageCode] = useState("VIL-MAJ");
  const [direction, setDirection] = useState("morning");

  const plans = useMemo(
    () =>
      planJourneys({
        villageCode,
        villages,
        routes,
        trips,
        hubs,
        config,
        direction,
        concessionPct: Number(config?.concession_pct) || 60,
      }),
    [villageCode, villages, routes, trips, hubs, config, direction]
  );

  const best = plans[0];
  const alternatives = plans.slice(1, 4);

  return (
    <div>
      <PageHeader
        eyebrow="Passenger"
        title="Find coordinated transport"
        description="Pick your village. EASY RIDE matches a feeder van, the transfer hub and the main bus so the whole journey connects."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={villageCode}
          onChange={(e) => setVillageCode(e.target.value)}
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[13px] font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-primary/20 sm:w-64"
        >
          {villages.map((v) => (
            <option key={v.code} value={v.code}>
              {v.name} · {v.students_count} students
            </option>
          ))}
        </select>
        <div className="flex rounded-xl border border-border bg-white p-1">
          {[
            { id: "morning", label: "Morning" },
            { id: "evening", label: "Evening return" },
          ].map((d) => (
            <button
              key={d.id}
              onClick={() => setDirection(d.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition",
                direction === d.id ? "bg-primary text-white" : "text-slate-500 hover:text-brand-navy"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Link to="/map" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-[12px] font-semibold text-slate-600 hover:border-primary/30 hover:text-primary">
          <MapPin className="h-3.5 w-3.5" /> Live map
        </Link>
      </div>

      {loading ? (
        <div className="grid h-64 place-items-center rounded-2xl border border-border bg-white">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : !best ? (
        <div className="er-card p-6 text-center">
          <p className="text-[13px] font-semibold text-brand-navy">No coordinated service in this window.</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Request extra transport from the control centre — a volunteer report also triggers a review.
          </p>
          <Link to="/incidents" className="mt-3 inline-flex rounded-lg bg-primary px-3 py-2 text-[12px] font-semibold text-white">
            Request extra transport
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-3">
            <div className="er-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-4 py-3">
                <div>
                  <div className="er-label">Recommended journey</div>
                  <div className="text-[13px] font-semibold text-brand-navy">
                    {best.village.name} → Sahyadri College
                  </div>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/20">
                  Simulated demo data
                </span>
              </div>

              <div className="p-4">
                <ol className="relative space-y-4 border-l border-dashed border-border pl-5">
                  <Leg
                    icon={Truck}
                    title={`${best.feederTrip?.vehicle_registration || "Feeder van"} · ${best.village.name} pickup`}
                    detail={best.feederTrip ? `${best.feederOccupancy?.estimated}/${best.feederOccupancy?.capacity} onboard` : "Feeder assignment pending"}
                    time={best.departLabel}
                    level={best.feederOccupancy?.level}
                  />
                  <Leg
                    icon={MapPin}
                    title={`${best.hub?.name || "Transfer hub"} · transfer`}
                    detail={`${best.connectMin} min connection${best.bufferOk ? "" : " — below the 8 min buffer"}`}
                    time={best.hubArriveLabel}
                    level={best.bufferOk ? "ok" : "warning"}
                  />
                  <Leg
                    icon={BusFront}
                    title={`${best.mainTrip.vehicle_registration} · ${best.mainRoute.name}`}
                    detail={`${best.mainOccupancy.estimated}/${best.mainOccupancy.capacity} onboard · ${best.mainOccupancy.seats_free} seats free`}
                    time={best.mainDepLabel}
                    level={best.mainOccupancy.level}
                  />
                  <Leg
                    icon={Flag}
                    title="Sahyadri College"
                    detail={`Arrive gate 1 · ${best.arriveEta !== null ? `${best.arriveEta} min from now` : "on time"}`}
                    time={best.arriveLabel}
                    level="ok"
                    last
                  />
                </ol>
              </div>
            </div>

            {alternatives.length > 0 && (
              <div className="er-card p-4">
                <div className="er-label mb-2">Alternatives</div>
                <div className="space-y-2">
                  {alternatives.map((p) => {
                    const cls = levelClasses(p.mainOccupancy.level);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-brand-navy">
                            {p.departLabel} → {p.arriveLabel} · {p.mainTrip.vehicle_registration}
                          </div>
                          <div className="text-[10.5px] text-muted-foreground">
                            {p.mainOccupancy.seats_free} seats free · transfer at {p.hub?.name || "hub"}
                          </div>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1", cls.chip)}>
                          {p.mainOccupancy.pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="er-card p-4">
              <div className="er-label">Fare for this journey</div>
              <div className="mt-2 space-y-1.5 text-[12.5px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Regular fare</span><span className="font-semibold text-brand-navy">{formatINR(best.fare.full)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Student concession ({best.fare.concessionPct}%)</span><span className="font-semibold text-emerald-600">−{formatINR(best.fare.concession)}</span></div>
                <div className="mt-1 flex justify-between border-t border-border/70 pt-1.5"><span className="font-semibold text-brand-navy">You pay</span><span className="font-display text-[16px] font-extrabold text-primary">{formatINR(best.fare.payable)}</span></div>
              </div>
              <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
                Concession follows the college rule configured by the admin, not a fixed government rate.
              </p>
              <Link to="/pass" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[12px] font-semibold text-white">
                Show mobility pass <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="er-card p-4">
              <div className="er-label mb-2">Need help?</div>
              <div className="space-y-2">
                <Link to="/incidents" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11.5px] font-semibold text-slate-600 hover:border-primary/30 hover:text-primary">
                  <Clock className="h-3.5 w-3.5" /> Report a delay or problem
                </Link>
                <button
                  onClick={() => toast.success("SOS shared with the control centre (simulated).")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-2 text-[11.5px] font-bold text-white"
                >
                  <ShieldAlert className="h-3.5 w-3.5" /> SOS — share my location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Leg({ icon: Icon, title, detail, time, level, last }) {
  const cls = levelClasses(level || "ok");
  return (
    <li className="relative">
      <span className="absolute -left-[29px] top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white ring-1 ring-border">
        <Icon className="h-3 w-3 text-primary" />
      </span>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold leading-snug text-brand-navy">{title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{detail}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[12px] font-bold text-brand-navy">{time}</div>
          {!last && <span className={cn("mt-1 inline-block h-1.5 w-1.5 rounded-full", cls.dot)} />}
        </div>
      </div>
    </li>
  );
}