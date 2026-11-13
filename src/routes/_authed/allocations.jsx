import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useOpsData } from "@/lib/useOps";
import { assignVehicle } from "@/lib/server-fns";
import { planFeeder, minutesToClock, clockToMinutes } from "@/lib/mobility";
import PageHeader from "@/components/er/PageHeader";
import { Loader2, Check, ShieldCheck, Truck, Users } from "lucide-react";

export const Route = createFileRoute("/_authed/allocations")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Allocations" }] }),
  component: AllocationsPage,
});

function AllocationsPage() {
  const { loading, trips = [], routes = [], villages = [], hubs = [], govBuses = [], privateBuses = [], feeders = [], assignments = [], config, reload } = useOpsData();
  const assign = useServerFn(assignVehicle);
  const [perms, setPerms] = useState(null);
  const [busy, setBusy] = useState(false);

  const [villageCode, setVillageCode] = useState("VIL-BEL");
  const [waiting, setWaiting] = useState("19");
  const [mainDep, setMainDep] = useState("07:35");

  const [pick, setPick] = useState({ vehicle_type: "private", registration: "KL-14-B-2002", route_code: "R-MAIN", purpose: "extra", passengers: "26" });

  const village = villages.find((v) => v.code === villageCode);
  const hub = hubs.find((h) => h.code === village?.hub_code);
  const feederRoutes = routes.filter((r) => r.kind === "feeder" && r.village_code === villageCode);
  const feederRoute = feederRoutes[0];

  const plan = useMemo(() => {
    if (!village) return null;
    return planFeeder({
      village,
      hub,
      vans: feeders,
      mainBusArrivalMin: clockToMinutes(mainDep) + 10,
      waiting: Number(waiting) || 1,
      bufferMin: Number(config?.transfer_buffer_min) || 8,
      travelMin: Number(feederRoute?.duration_min) || 18,
    });
  }, [village, hub, feeders, mainDep, waiting, config, feederRoute]);

  const vehicles = pick.vehicle_type === "feeder" ? feeders : pick.vehicle_type === "government" ? govBuses : privateBuses;
  const pendingApprovals = useMemo(() => {
    const list = [];
    (perms || []).forEach((p) => p.status === "pending" && list.push({ kind: "permit", id: p.id, label: p.vehicle_registration, detail: `Permit ${p.permit_no} · ${p.capacity_authorized} seats` }));
    return list;
  }, [perms]);

  useEffect(() => {
    let alive = true;
    base44.entities.Permit.list({ limit: 40 })
      .then((res) => {
        if (alive) setPerms(res?.items ?? res ?? []);
      })
      .catch(() => setPerms([]));
    return () => {
      alive = false;
    };
  }, []);

  async function approvePermit(item) {
    await base44.entities.Permit.update(item.id, { status: "approved", verified: true });
    toast.success(`${item.label} permit approved`);
    setPerms(null);
    reload();
  }

  async function submitAssignment(e) {
    e.preventDefault();
    setBusy(true);
    const res = await assign({
      data: {
        vehicle_type: pick.vehicle_type,
        vehicle_registration: pick.registration,
        route_code: pick.route_code,
        purpose: pick.purpose,
        passengers_expected: Number(pick.passengers) || 0,
      },
    });
    setBusy(false);
    if (!res?.ok) return toast.error(res?.error || "Assignment refused.");
    toast.success(`${pick.registration} assigned · ${res.code}`);
    reload();
  }

  async function allocateFeeder() {
    if (!plan?.van) return toast.error("No approved van matches this village and count.");
    setBusy(true);
    const res = await assign({
      data: {
        vehicle_type: "feeder",
        vehicle_registration: plan.van.registration,
        route_code: feederRoute?.code || "",
        village_code: villageCode,
        hub_code: village?.hub_code,
        purpose: "feeder",
        passengers_expected: Math.min(Number(waiting) || plan.van.capacity, plan.van.capacity),
        note: `Timed to the ${mainDep} main service`,
      },
    });
    setBusy(false);
    if (!res?.ok) return toast.error(res?.error || "Feeder assignment refused.");
    toast.success(`Feeder ${plan.van.registration} requested for ${village?.name}`);
    reload();
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader
        eyebrow="Control centre"
        title="Allocation tools"
        description="Only admin-approved, permit-verified vehicles can be assigned. Capacity is checked against the authorized permit, never against the timetable."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="er-card p-4">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-teal-600" />
              <div className="text-[13px] font-semibold text-brand-navy">Feeder planner</div>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              Pick the village and the main bus it must feed. Departure is timed backwards from the bus arrival, minus
              travel and the transfer buffer.
            </p>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="block">
                <span className="er-label">Village</span>
                <select value={villageCode} onChange={(e) => setVillageCode(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20">
                  {villages.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="er-label">Students waiting</span>
                <input type="number" value={waiting} onChange={(e) => setWaiting(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
              </label>
              <label className="block">
                <span className="er-label">Main bus departs</span>
                <input value={mainDep} onChange={(e) => setMainDep(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
              </label>
            </div>

            {plan && (
              <div className="mt-3 rounded-xl border border-border/80 bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold text-brand-navy">
                    {village?.name} → {hub?.name}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ring-1 ${plan.legal_capacity_ok ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15" : "bg-rose-50 text-rose-700 ring-rose-600/15"}`}>
                    {plan.legal_capacity_ok ? "Capacity OK" : "No matching van"}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white p-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">Depart village</div>
                    <div className="text-[12.5px] font-bold text-brand-navy">{minutesToClock(plan.depart_min)}</div>
                  </div>
                  <div className="rounded-lg bg-white p-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">At hub</div>
                    <div className="text-[12.5px] font-bold text-brand-navy">{minutesToClock(plan.arrive_min)}</div>
                  </div>
                  <div className="rounded-lg bg-white p-1.5">
                    <div className="text-[9px] uppercase text-muted-foreground">Bus departs</div>
                    <div className="text-[12.5px] font-bold text-brand-navy">{mainDep}</div>
                  </div>
                </div>
                <div className="mt-2 text-[10.5px] leading-snug text-muted-foreground">{plan.reason}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {village?.large_bus_allowed ? "Large bus permitted on this road." : "Large bus restricted — feeder only."} Road type: {village?.road_type}.
                </div>
                <button onClick={allocateFeeder} disabled={busy} className="mt-2 w-full rounded-lg bg-teal-700 py-2 text-[11.5px] font-bold text-white disabled:opacity-60">
                  Create feeder assignment
                </button>
              </div>
            )}
          </div>

          <form onSubmit={submitAssignment} className="er-card p-4">
            <div className="er-label mb-2">Assign a vehicle</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="er-label">Vehicle type</span>
                <select value={pick.vehicle_type} onChange={(e) => {
                  const type = e.target.value;
                  const list = type === "feeder" ? feeders : type === "government" ? govBuses : privateBuses;
                  setPick({ ...pick, vehicle_type: type, registration: list[0]?.registration || "" });
                }} className="mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="private">Private bus</option>
                  <option value="government">Government bus</option>
                  <option value="feeder">Feeder van</option>
                </select>
              </label>
              <label className="block">
                <span className="er-label">Approved vehicle</span>
                <select value={pick.registration} onChange={(e) => setPick({ ...pick, registration: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20">
                  {vehicles.map((v) => (
                    <option key={v.registration} value={v.registration}>{v.registration} · {v.capacity} seats{v.status !== "active" ? ` · ${v.status}` : ""}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="er-label">Route</span>
                <select value={pick.route_code} onChange={(e) => setPick({ ...pick, route_code: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20">
                  {routes.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="er-label">Students expected</span>
                <input type="number" value={pick.passengers} onChange={(e) => setPick({ ...pick, passengers: e.target.value })} className="mt-1 w-full rounded-xl border border-border bg-white px-2.5 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["extra", "replacement", "feeder", "scheduled"].map((p) => (
                <button key={p} type="button" onClick={() => setPick({ ...pick, purpose: p })} className={`rounded-lg px-2.5 py-1 text-[10.5px] font-semibold ring-1 ${pick.purpose === p ? "bg-primary text-white ring-primary" : "bg-white text-slate-600 ring-border"}`}>
                  {p}
                </button>
              ))}
            </div>
            <button type="submit" disabled={busy} className="mt-2 w-full rounded-xl bg-primary py-2.5 text-[12px] font-bold text-white disabled:opacity-60">
              Assign vehicle
            </button>
          </form>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2">Pending approvals</div>
            {pendingApprovals.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No permits waiting for verification.</p>
            ) : (
              <div className="space-y-2">
                {pendingApprovals.map((item) => (
                  <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-brand-navy">
                      <ShieldCheck className="h-3.5 w-3.5 text-amber-600" /> {item.label}
                    </div>
                    <div className="mt-0.5 text-[10px] text-amber-800">{item.detail}</div>
                    <button onClick={() => approvePermit(item)} className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white">
                      <Check className="h-3 w-3" /> Approve permit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Active assignments</div>
            <div className="space-y-1.5">
              {assignments.map((a) => (
                <div key={a.id} className="rounded-lg border border-border/70 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-[11px] font-semibold text-brand-navy">{a.vehicle_registration}</div>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      a.status === "pending" ? "bg-amber-50 text-amber-700" : a.status === "declined" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                    }`}>{a.status}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Users className="h-2.5 w-2.5" /> {a.passengers_expected} students · {a.purpose} · {a.route_code}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}