import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useOpsData } from "@/lib/useOps";
import { acceptAssignment } from "@/lib/server-fns";
import PageHeader from "@/components/er/PageHeader";
import { Check, X, Loader2, MapPin, ShieldCheck, Clock } from "lucide-react";

export const Route = createFileRoute("/_authed/operator")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Van operator" }] }),
  component: OperatorPage,
});

function OperatorPage() {
  const { loading, feeders = [], assignments = [], routes = [], hubs = [], trips = [], reload } = useOpsData();
  const decide = useServerFn(acceptAssignment);
  const [busy, setBusy] = useState(null);

  const pending = assignments.filter((a) => a.vehicle_type === "feeder" && a.status === "pending");
  const history = assignments.filter((a) => a.vehicle_type === "feeder" && a.status !== "pending");
  const feederTrips = trips.filter((t) => t.vehicle_type === "feeder");

  async function toggleAvailability(van) {
    setBusy(van.id);
    await base44.entities.FeederVehicle.update(van.id, { availability: !van.availability });
    setBusy(null);
    toast.success(`${van.registration} marked ${van.availability ? "unavailable" : "available"}`);
    reload();
  }

  async function answer(code, decision) {
    setBusy(code);
    const res = await decide({ data: { code, decision } });
    setBusy(null);
    if (!res?.ok) return toast.error(res?.error || "Could not update assignment.");
    toast.success(`Assignment ${decision === "decline" ? "rejected" : "accepted"}`);
    reload();
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader
        eyebrow="Authorized vehicle operator"
        title="Feeder van console"
        description="Your permitted vans, their operating area, and the feeder assignments timed to the main bus timetable."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="er-card p-4">
            <div className="er-label mb-2">My vehicles</div>
            <div className="space-y-2">
              {feeders.map((van) => (
                <div key={van.registration} className="rounded-xl border border-border/80 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] font-semibold text-brand-navy">{van.registration}</span>
                        {van.permit_verified ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 ring-1 ring-emerald-600/15">
                            <ShieldCheck className="h-2.5 w-2.5" /> Permit
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700 ring-1 ring-amber-600/15">Pending</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{van.vehicle_model} · {van.capacity} seats</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                        <MapPin className="h-3 w-3" />
                        {(van.village_codes || []).join(" · ")} → {hubs.find((h) => h.code === van.hub_code)?.name || van.hub_code}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleAvailability(van)}
                      disabled={busy === van.id}
                      className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold ring-1 transition ${
                        van.availability
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-slate-100 text-slate-500 ring-slate-300/40"
                      }`}
                    >
                      {van.availability ? "Available" : "Unavailable"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Assignment history</div>
            {history.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No completed feeder assignments yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                    <div>
                      <div className="text-[11.5px] font-semibold text-brand-navy">{a.code} · {a.vehicle_registration}</div>
                      <div className="text-[10px] text-muted-foreground">{routes.find((r) => r.code === a.route_code)?.name || a.route_code} · {a.passengers_expected} students</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ${
                      a.status === "accepted" || a.status === "active" ? "bg-emerald-50 text-emerald-700" : a.status === "declined" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"
                    }`}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2">Feeder assignments awaiting you</div>
            {pending.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">Nothing pending. The control centre will notify you when a village needs a van.</p>
            ) : (
              <div className="space-y-2">
                {pending.map((a) => (
                  <div key={a.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <div className="text-[12px] font-semibold text-brand-navy">
                      {routes.find((r) => r.code === a.route_code)?.name || a.route_code}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-amber-800">
                      {a.vehicle_registration} · {a.passengers_expected} students · hub {hubs.find((h) => h.code === a.hub_code)?.name || a.hub_code}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => answer(a.code, "accept")}
                        disabled={busy === a.code}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        <Check className="h-3 w-3" /> Accept
                      </button>
                      <button
                        onClick={() => answer(a.code, "decline")}
                        disabled={busy === a.code}
                        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-white py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-60"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Feeder trips today</div>
            <div className="space-y-1.5">
              {feederTrips.map((t) => (
                <div key={t.trip_code} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-[11.5px] font-semibold text-brand-navy">{t.vehicle_registration}</div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" /> {t.scheduled_departure} · {t.route_name}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                    t.status === "active" ? "bg-emerald-50 text-emerald-700" : t.status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"
                  }`}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}