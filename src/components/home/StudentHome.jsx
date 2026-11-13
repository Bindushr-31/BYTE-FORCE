import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Clock, ShieldAlert, Ticket, Truck, BusFront, Flag } from "lucide-react";
import { useMemo } from "react";
import { planJourneys } from "@/lib/journey";
import { levelClasses } from "@/lib/mobility";
import { relevantToPassenger, sortUpdates } from "@/lib/updates";
import UpdatePopup from "@/components/passenger/UpdatePopup";
import { cn } from "@/lib/utils";

export default function StudentHome({ data }) {
  const { villages = [], routes = [], trips = [], hubs = [], config, passes = [], notifications = [] } = data;

  const village = villages.find((v) => v.feeder_required) || villages[0];
  const plans = useMemo(
    () => planJourneys({ villageCode: village?.code, villages, routes, trips, hubs, config, concessionPct: Number(config?.concession_pct) || 60 }),
    [village?.code, villages, routes, trips, hubs, config]
  );
  const best = plans[0];
  const pass = passes.find((p) => p.status === "active") || passes[0];
  // Only updates that match this student's route, bus, journey or stops.
  const myContext = {
    routeCodes: [best?.feederTrip?.route_code, best?.mainTrip?.route_code].filter(Boolean),
    tripCodes: [best?.feederTrip?.trip_code, best?.mainTrip?.trip_code].filter(Boolean),
    vehicles: [best?.feederTrip?.vehicle_registration, best?.mainTrip?.vehicle_registration].filter(Boolean),
    stopCodes: [pass?.home_stop_code, best?.hub?.code].filter(Boolean),
  };
  const myUpdates = sortUpdates(notifications.filter((n) => relevantToPassenger(n, myContext)));
  const alerts = myUpdates.slice(0, 2);

  return (
    <div className="space-y-4">
      <UpdatePopup updates={myUpdates} />
      <div className="er-hero overflow-hidden rounded-3xl px-5 py-6 sm:px-7">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Your morning journey</div>
        <h1 className="mt-1.5 font-display text-[24px] font-extrabold leading-tight text-white sm:text-[29px]">
          {village?.name || "Your village"} → Sahyadri College
        </h1>
        <p className="mt-1.5 text-[12.5px] text-white/70">
          Feeder van, one transfer, then the NH66 main bus. All three legs are coordinated for you.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-200 ring-1 ring-emerald-300/25">
            {best ? "Journey available" : "Awaiting feeder"}
          </span>
          {best && (
            <>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-white/80 ring-1 ring-white/15">
                {best.mainOccupancy.seats_free} seats free
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-white/80 ring-1 ring-white/15">
                Arrive {best.arriveLabel}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="er-card p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="er-label">Today's plan</div>
            <Link to="/journey" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
              Full journey <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {!best ? (
            <p className="text-[12px] text-muted-foreground">
              No coordinated journey right now. Use the journey page to request extra transport.
            </p>
          ) : (
            <ol className="relative space-y-3 border-l border-dashed border-border pl-5">
              <Step icon={Truck} title={`${best.feederTrip?.vehicle_registration || "Feeder van"} · village pickup`} detail={`${best.feederOccupancy?.estimated ?? 0}/${best.feederOccupancy?.capacity ?? 0} onboard`} time={best.departLabel} level={best.feederOccupancy?.level} />
              <Step icon={MapPin} title={`${best.hub?.name || "Transfer hub"}`} detail={`${best.connectMin} min connection`} time={best.hubArriveLabel} level={best.bufferOk ? "ok" : "warning"} />
              <Step icon={BusFront} title={`${best.mainTrip.vehicle_registration} · main bus`} detail={`${best.mainOccupancy.estimated}/${best.mainOccupancy.capacity} onboard`} time={best.mainDepLabel} level={best.mainOccupancy.level} />
              <Step icon={Flag} title="Sahyadri College" detail="Destination · gate 1" time={best.arriveLabel} level="ok" last />
            </ol>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/map" className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-primary/90">
              <MapPin className="h-3.5 w-3.5" /> Track live
            </Link>
            <Link to="/journey" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[12px] font-semibold text-slate-600 transition hover:border-primary/30 hover:text-primary">
              <Clock className="h-3.5 w-3.5" /> Alternatives
            </Link>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl bg-gradient-to-br from-brand-navy via-[#122B6B] to-teal-900 p-4 text-white shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.18em] text-cyan-200/70">Student mobility pass</div>
                <div className="mt-1 font-display text-[16px] font-bold">{pass?.student_name || "Your pass"}</div>
                <div className="font-mono text-[10.5px] text-white/60">{pass?.pass_code || "not issued"}</div>
              </div>
              <Ticket className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.14em] text-white/50">Concession</div>
                <div className="font-display text-[19px] font-extrabold text-emerald-300">{pass?.concession_pct ?? config?.concession_pct ?? 60}%</div>
              </div>
              <div className="text-right text-[9.5px] text-white/50">
                Valid to
                <div className="font-mono text-[11px] text-white">{pass?.valid_to || "—"}</div>
              </div>
            </div>
            <Link to="/pass" className="mt-3 block rounded-lg bg-white/10 py-1.5 text-center text-[11px] font-semibold ring-1 ring-white/15">
              Open pass
            </Link>
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Alerts for your route</div>
            <div className="space-y-2 text-[11.5px] leading-snug">
              {alerts.length === 0 && <p className="text-muted-foreground">No alerts — your route is running normally.</p>}
              {alerts.map((a) => (
                <div key={a.id} className={cn("rounded-lg p-2 ring-1", a.level === "critical" ? "bg-rose-50 text-rose-800 ring-rose-600/10" : "bg-amber-50 text-amber-800 ring-amber-600/10")}>
                  {a.message}
                </div>
              ))}
            </div>
            <Link to="/notifications" className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:underline">
              All alerts <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <Link to="/journey" className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-rose-700">
            <ShieldAlert className="h-4 w-4" /> SOS — share my location
          </Link>
        </div>
      </div>
    </div>
  );
}

function Step({ icon: Icon, title, detail, time, level, last }) {
  const cls = levelClasses(level || "ok");
  return (
    <li className="relative">
      <span className="absolute -left-[27px] top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-white bg-primary ring-1 ring-border" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-navy">
            <Icon className="h-3.5 w-3.5 text-primary" /> {title}
          </div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{detail}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", cls.dot)} />
          <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-bold text-brand-navy">{time}</span>
        </div>
      </div>
    </li>
  );
}