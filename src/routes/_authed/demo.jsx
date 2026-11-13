import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useOpsData } from "@/lib/useOps";
import { runScenario, advanceSimulation } from "@/lib/server-fns";
import PageHeader from "@/components/er/PageHeader";
import ExamSchedule from "@/components/demo/ExamSchedule";
import {
  BusFront, XCircle, Construction, Users, Sunrise, Sunset, Truck,
  PlusCircle, BadgeCheck, Ticket, GaugeCircle, PlayCircle, Loader2, ArrowRight, CheckCircle2, Siren,
} from "lucide-react";

export const Route = createFileRoute("/_authed/demo")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Demo panel" }] }),
  component: DemoPage,
});

const SCENARIOS = [
  { id: "normal", label: "Normal operation", icon: CheckCircle2, tone: "emerald", desc: "All services running to timetable, counts reset.", link: "/" },
  { id: "exam_day", label: "Exam-day emergency", icon: Siren, tone: "rose", desc: "Two buses out, demand +40%, flooded road, exams within 2 hours — prioritised end to end.", link: "/incidents" },
  { id: "gov_cancel", label: "Government bus cancellation", icon: XCircle, tone: "rose", desc: "Mark a bus unavailable, find affected students, allocate a replacement.", link: "/incidents" },
  { id: "private_cancel", label: "Private bus cancellation", icon: XCircle, tone: "rose", desc: "Withdraw a private service and re-cover the route.", link: "/incidents" },
  { id: "road_disruption", label: "Road disruption on NH66", icon: Construction, tone: "amber", desc: "Block the highway, reroute large buses to the approved bypass.", link: "/map" },
  { id: "overcrowding", label: "Overcrowding at a hub", icon: Users, tone: "amber", desc: "Fill a bus, show waiting students, suggest an authorized replacement.", link: "/allocations" },
  { id: "morning_surge", label: "Morning surge", icon: Sunrise, tone: "blue", desc: "Push the morning peak and watch occupancy climb.", link: "/analytics" },
  { id: "evening_surge", label: "Evening return surge", icon: Sunset, tone: "violet", desc: "Activate the return services with heavy demand.", link: "/analytics" },
  { id: "village_feeder", label: "Remote village feeder", icon: Truck, tone: "teal", desc: "Plan a van from a narrow-road village into the hub, timed to the bus.", link: "/allocations" },
  { id: "extra_private", label: "Extra private allocation", icon: PlusCircle, tone: "blue", desc: "Allocate an extra private bus and add it to the map immediately.", link: "/map" },
  { id: "pass_verify", label: "Student pass verification", icon: BadgeCheck, tone: "emerald", desc: "Verify a pass, apply the concession and log the settlement entry.", link: "/pass" },
  { id: "conductor_tickets", label: "Conductor issues tickets", icon: Ticket, tone: "navy", desc: "Issue four tickets and watch the dashboard update.", link: "/conductor" },
  { id: "capacity_full", label: "Bus reaches capacity", icon: GaugeCircle, tone: "rose", desc: "Fill to the authorized limit and refuse further boarding.", link: "/conductor" },
];

const TONES = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/15",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/15",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/15",
  navy: "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
};

function DemoPage() {
  const { reload, trips = [] } = useOpsData();
  const run = useServerFn(runScenario);
  const advance = useServerFn(advanceSimulation);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);

  async function play(scenario) {
    setBusy(scenario.id);
    const res = await run({ data: { scenario: scenario.id } });
    setBusy(null);
    if (!res?.ok) {
      setResult({ label: scenario.label, steps: [res?.error || "Scenario could not run."], failed: true });
      toast.error(res?.error || "Scenario failed.");
      return;
    }
    setResult({ label: scenario.label, steps: res.steps || [], exam: res.exam_students || [], replacements: res.replacements || [] });
    toast.success(`${scenario.label} applied`);
    reload();
  }

  async function tick() {
    setBusy("sim");
    const res = await advance({ data: { step: 6 } });
    setBusy(null);
    if (res?.ok) {
      toast.success(`${res.moved} simulated positions updated`);
      reload();
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Presenter panel"
        title="Demo scenarios"
        description="Each scenario writes real records — trips, counts, assignments, incidents and notifications — so the map, dashboards and alerts all move together. Everything here is simulated demo data."
        actions={
          <button
            onClick={tick}
            disabled={busy === "sim"}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-[11.5px] font-semibold text-slate-600 hover:border-primary/30 hover:text-primary disabled:opacity-60"
          >
            {busy === "sim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            Advance simulated GPS
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: "Active trips", v: trips.filter((t) => t.status === "active").length },
          { k: "Cancelled", v: trips.filter((t) => t.status === "cancelled").length },
          { k: "Full buses", v: trips.filter((t) => t.is_full).length },
          { k: "Scenarios", v: SCENARIOS.length },
        ].map((m) => (
          <div key={m.k} className="er-card p-3">
            <div className="er-label">{m.k}</div>
            <div className="mt-1 font-display text-[20px] font-extrabold text-brand-navy">{m.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:col-span-3">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => play(s)}
              disabled={!!busy}
              className="er-card flex items-start gap-2.5 p-3.5 text-left transition hover:border-primary/30 disabled:opacity-60"
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${TONES[s.tone]}`}>
                <s.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold leading-snug text-brand-navy">{s.label}</span>
                <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">{s.desc}</span>
                {busy === s.id && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-primary"><Loader2 className="h-3 w-3 animate-spin" /> running…</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label">Scenario output</div>
            {!result ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                Run a scenario to see exactly what the system did — which vehicles were marked unavailable, how many
                students were affected, which replacement was checked against capacity, and who was notified.
              </p>
            ) : (
              <>
                <div className="mt-1 text-[13px] font-semibold text-brand-navy">{result.label}</div>
                {result.exam?.length > 0 && (
                  <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2">
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-rose-700">Exam students prioritised</div>
                    <ul className="mt-1 space-y-0.5">
                      {result.exam.slice(0, 5).map((s) => (
                        <li key={s.name} className="text-[10.5px] text-rose-900">
                          {s.name} · exam {s.exam_time} · {s.minutes_left} min left
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ul className="mt-2 space-y-1.5">
                  {result.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-slate-700">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {step}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-lg bg-muted/60 p-2 text-[10px] leading-snug text-muted-foreground">
                  These changes are stored. Open the fleet map, allocations or notifications to show the result to the room.
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    { to: "/map", label: "Fleet map" },
                    { to: "/allocations", label: "Allocations" },
                    { to: "/incidents", label: "Incidents" },
                    { to: "/notifications", label: "Notifications" },
                  ].map((l) => (
                    <a key={l.to} href={l.to} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10.5px] font-semibold text-slate-600 hover:border-primary/30 hover:text-primary">
                      {l.label} <ArrowRight className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="er-card mt-3 p-4">
            <div className="er-label mb-1.5">Suggested presentation flow</div>
            <ol className="space-y-1 text-[11px] leading-snug text-muted-foreground">
              <li>1 · Normal operation — show the live corridor.</li>
              <li>2 · Conductor issues tickets — count updates instantly.</li>
              <li>3 · Overcrowding — capacity rule refuses more boardings.</li>
              <li>4 · Government bus cancellation — replacement allocated and passengers notified.</li>
              <li>5 · Remote village feeder — van timed to the main bus.</li>
              <li>6 · Student pass — QR verification and concession settlement.</li>
              <li>7 · AI insights — explain a recommendation with its data.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ExamSchedule />
      </div>
    </div>
  );
}