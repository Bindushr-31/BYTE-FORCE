import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useOpsData } from "@/lib/useOps";
import { advanceIncident } from "@/lib/server-fns";
import PageHeader from "@/components/er/PageHeader";
import { Loader2, ShieldCheck, Shuffle, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/incidents")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Incidents" }] }),
  component: IncidentsPage,
});

const STATUS_STYLE = {
  Reported: "bg-rose-50 text-rose-700 ring-rose-600/15",
  Verified: "bg-amber-50 text-amber-700 ring-amber-600/15",
  "Action Required": "bg-violet-50 text-violet-700 ring-violet-600/15",
  "Vehicle Assigned": "bg-sky-50 text-sky-700 ring-sky-600/15",
  Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
};

const FLOW = ["Reported", "Verified", "Action Required", "Vehicle Assigned", "Resolved"];

function IncidentsPage() {
  const { loading, incidents = [], routes = [], villages = [], reload } = useOpsData();
  const advance = useServerFn(advanceIncident);
  const [busy, setBusy] = useState(null);
  const [steps, setSteps] = useState([]);
  const [form, setForm] = useState({ type: "breakdown", title: "", description: "", route_code: "R-MAIN", village_code: "" });

  async function act(code, action) {
    setBusy(code);
    const res = await advance({ data: { code, action, note: action === "resolve" ? "Service restored and passengers accommodated." : undefined } });
    setBusy(null);
    if (!res?.ok) return toast.error(res?.error || "Workflow step failed.");
    setSteps(res.steps || []);
    toast.success("Incident workflow updated");
    reload();
  }

  async function report(e) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Give the incident a short title.");
    setBusy("new");
    await base44.entities.Incident.create({
      code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
      type: form.type,
      title: form.title,
      description: form.description || form.title,
      status: "Reported",
      severity: form.type === "breakdown" || form.type === "accident" ? "high" : "medium",
      route_code: form.route_code,
      village_code: form.village_code,
      reported_by: "Demo operator",
      reported_role: "admin",
      timeline: [{ status: "Reported", at: "now", note: "Entered from the incident desk." }],
    });
    await base44.entities.Notification.create({
      title: form.title,
      message: `${form.type.replace("_", " ")} on ${form.route_code}. Verification required.`,
      audience: "admin",
      route_code: form.route_code,
      level: "critical",
      requires_ack: true,
    });
    setBusy(null);
    setForm({ ...form, title: "", description: "" });
    toast.success("Incident reported");
    reload();
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader
        eyebrow="Incident workflow"
        title="Incident workflow"
        description="Every incident moves Reported → Verified → Action required → Vehicle assigned → Resolved. Verification finds the affected routes, villages, buses and passengers, then suggests an unblocked alternative and the vehicles needed."
      />

      {steps.length > 0 && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
          <div className="er-label text-sky-700">What just happened</div>
          <ul className="mt-1.5 space-y-1">
            {steps.map((s) => (
              <li key={s} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-sky-900">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" /> {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {incidents.map((inc) => (
            <div key={inc.id} className="er-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] font-semibold text-slate-500">{inc.code}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ring-1", STATUS_STYLE[inc.status] || STATUS_STYLE.Reported)}>
                      {inc.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] font-semibold leading-snug text-brand-navy">{inc.title}</div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{inc.description}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Affected</div>
                  <div className="text-[15px] font-bold text-brand-navy">{inc.affected_passengers || 0}</div>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                {inc.route_code && <span className="rounded bg-muted px-1.5 py-0.5">{routes.find((r) => r.code === inc.route_code)?.name || inc.route_code}</span>}
                {inc.vehicle_registration && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{inc.vehicle_registration}</span>}
                {inc.village_code && <span className="rounded bg-muted px-1.5 py-0.5">{villages.find((v) => v.code === inc.village_code)?.name || inc.village_code}</span>}
                {inc.assigned_vehicle && <span className="rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-700">Replacement {inc.assigned_vehicle}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {FLOW.map((s, i) => (
                  <span key={s} className={cn(
                    "flex items-center gap-1 text-[9.5px] font-semibold",
                    FLOW.indexOf(inc.status) >= i ? "text-primary" : "text-slate-300"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", FLOW.indexOf(inc.status) >= i ? "bg-primary" : "bg-slate-200")} />
                    {s}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {inc.status === "Reported" && (
                  <button onClick={() => act(inc.code, "verify")} disabled={busy === inc.code} className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60">
                    <ShieldCheck className="h-3 w-3" /> Verify & find affected
                  </button>
                )}
                {inc.status === "Verified" && (
                  <button onClick={() => act(inc.code, "require_action")} disabled={busy === inc.code} className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60">
                    Mark action required
                  </button>
                )}
                {(inc.status === "Action Required" || inc.status === "Verified") && (
                  <button onClick={() => act(inc.code, "assign")} disabled={busy === inc.code} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60">
                    <Shuffle className="h-3 w-3" /> Assign replacement vehicle
                  </button>
                )}
                {inc.status !== "Resolved" && (
                  <button onClick={() => act(inc.code, "resolve")} disabled={busy === inc.code} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-60">
                    <CheckCircle2 className="h-3 w-3" /> Resolve
                  </button>
                )}
              </div>

              {Array.isArray(inc.timeline) && inc.timeline.length > 0 && (
                <ol className="mt-3 space-y-1 border-l border-dashed border-border pl-3">
                  {inc.timeline.map((t, i) => (
                    <li key={i} className="text-[10.5px] text-muted-foreground">
                      <span className="font-semibold text-slate-600">{t.status}</span> · {t.at} — {t.note}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>

        <div className="lg:col-span-2">
          <form onSubmit={report} className="er-card p-4">
            <div className="er-label mb-2">Report an incident</div>
            <div className="space-y-2.5">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20">
                <option value="breakdown">Vehicle breakdown</option>
                <option value="road_block">Road block</option>
                <option value="overcrowding">Overcrowding</option>
                <option value="accident">Accident</option>
                <option value="sos">SOS</option>
                <option value="complaint">Complaint / request</option>
              </select>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short title" className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What happened?" rows={3} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20" />
              <select value={form.route_code} onChange={(e) => setForm({ ...form, route_code: e.target.value })} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20">
                {routes.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
              <select value={form.village_code} onChange={(e) => setForm({ ...form, village_code: e.target.value })} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">No village affected</option>
                {villages.map((v) => <option key={v.code} value={v.code}>{v.name}</option>)}
              </select>
              <button type="submit" disabled={busy === "new"} className="w-full rounded-xl bg-primary py-2.5 text-[12px] font-bold text-white disabled:opacity-60">
                Send to control centre
              </button>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
              Reporting only records the event. Nothing is marked verified, and no vehicle is allocated until an admin
              moves it through the workflow.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}