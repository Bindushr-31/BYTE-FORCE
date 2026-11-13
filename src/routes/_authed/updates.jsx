import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useOpsData } from "@/lib/useOps";
import { publishUpdate, UPDATE_CATEGORIES, UPDATE_PRIORITIES } from "@/lib/server-fns-updates";
import { priorityOf, PRIORITY_STYLES, sortUpdates, isLive } from "@/lib/updates";
import PageHeader from "@/components/er/PageHeader";
import { Button } from "@/components/ui/button";
import { Loader2, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/updates")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Conductor updates" }] }),
  component: UpdatesPage,
});

const EMPTY = {
  title: "",
  category: "Bus Delay",
  message: "",
  vehicle_registration: "",
  route_code: "R-MAIN",
  stop_codes: [],
  valid_from: "",
  expires_at: "",
  priority: "normal",
};

function UpdatesPage() {
  const { loading, trips = [], routes = [], notifications = [], reload } = useOpsData();
  const publish = useServerFn(publishUpdate);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const vehicles = useMemo(() => {
    const seen = new Map();
    trips
      .filter((t) => t.vehicle_registration)
      .forEach((t) => seen.set(t.vehicle_registration, t));
    return [...seen.values()].sort((a, b) => String(a.vehicle_registration).localeCompare(String(b.vehicle_registration)));
  }, [trips]);

  const route = routes.find((r) => r.code === form.route_code);
  const stops = route?.stops || [];
  const published = sortUpdates(notifications.filter((n) => n.category));

  function toggleStop(code) {
    setForm((f) => ({
      ...f,
      stop_codes: f.stop_codes.includes(code) ? f.stop_codes.filter((c) => c !== code) : [...f.stop_codes, code],
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const res = await publish({
      data: {
        ...form,
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : "",
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : "",
      },
    });
    setBusy(false);
    if (!res?.ok) {
      toast.error(res?.error || "Update could not be published.");
      return;
    }
    toast.success("Update published to affected passengers");
    setForm((f) => ({ ...EMPTY, vehicle_registration: f.vehicle_registration, route_code: f.route_code }));
    reload();
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader
        eyebrow="Crew"
        title="Publish an update"
        description="Conductors publish for their own bus and route; the controller can publish for any route. Passengers only see updates that match their route, bus, journey or stops."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <form onSubmit={submit} className="er-card space-y-3 p-4 lg:col-span-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <div className="text-[13px] font-semibold text-brand-navy">New update</div>
          </div>

          <label className="block">
            <span className="er-label">Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Delayed 12 minutes at Uppala"
              className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="er-label">Category</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
              >
                {UPDATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="er-label">Priority</span>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] capitalize outline-none focus:ring-2 focus:ring-primary/20"
              >
                {UPDATE_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="er-label">Affected bus</span>
              <select
                value={form.vehicle_registration}
                onChange={(e) => setForm({ ...form, vehicle_registration: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Any / not bus specific</option>
                {vehicles.map((v) => (
                  <option key={v.vehicle_registration} value={v.vehicle_registration}>
                    {v.vehicle_registration} · {v.route_code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="er-label">Affected route</span>
              <select
                value={form.route_code}
                onChange={(e) => setForm({ ...form, route_code: e.target.value, stop_codes: [] })}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
              >
                {routes.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="er-label">Message</span>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={3}
              placeholder="Bus is running 12 minutes late because of the flooded stretch near Kumbala. It will still reach the college by 08:45."
              className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          {stops.length > 0 && (
            <div>
              <span className="er-label">Relevant stops</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {stops.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => toggleStop(s.code)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 transition",
                      form.stop_codes.includes(s.code) ? "bg-primary text-white ring-primary" : "bg-white text-slate-600 ring-border"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="er-label">Valid from</span>
              <input
                type="datetime-local"
                value={form.valid_from}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="er-label">Expires (optional)</span>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Megaphone className="mr-1.5 h-4 w-4" />}
            Publish update
          </Button>
          <p className="text-[10.5px] leading-snug text-muted-foreground">
            Expired updates stop popping up for passengers but stay in their history.
          </p>
        </form>

        <div className="space-y-3 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2">Published updates</div>
            {published.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">Nothing published yet.</p>
            ) : (
              <div className="space-y-2">
                {published.slice(0, 8).map((u) => {
                  const styles = PRIORITY_STYLES[priorityOf(u)];
                  return (
                    <div key={u.id} className="rounded-xl border border-border/70 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[11.5px] font-semibold text-brand-navy">{u.title}</div>
                        <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1", styles.chip)}>
                          {styles.label}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{u.message}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[9.5px] text-muted-foreground">
                        <span>{u.category}</span>
                        {u.vehicle_registration && <span className="font-mono">{u.vehicle_registration}</span>}
                        {u.route_code && <span>{u.route_code}</span>}
                        <span>{isLive(u) ? "live" : "expired"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}