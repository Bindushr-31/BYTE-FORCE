import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useOpsData } from "@/lib/useOps";
import PageHeader from "@/components/er/PageHeader";
import { Users, BusFront, TriangleAlert, Flag, LifeBuoy, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authed/volunteer")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Volunteer desk" }] }),
  component: VolunteerPage,
});

function VolunteerPage() {
  const { loading, villages = [], stops = [], notifications = [], trips = [], reload } = useOpsData();
  const [villageCode, setVillageCode] = useState("VIL-MAJ");
  const [waiting, setWaiting] = useState("12");
  const [busy, setBusy] = useState(false);

  const village = villages.find((v) => v.code === villageCode);
  const tasks = notifications.filter((n) => ["volunteer", "all"].includes(n.audience) && n.requires_ack && !n.acknowledged);
  const fullBus = trips.find((t) => t.is_full && t.vehicle_type !== "feeder");

  async function report({ kind, title, level = "warning" }) {
    setBusy(true);
    const stop = stops.find((s) => s.village_code === villageCode);
    if (kind === "waiting") {
      const count = Number(waiting) || 0;
      await base44.entities.PassengerCount.create({
        trip_code: stop?.route_codes?.[0] || "unassigned",
        stop_code: stop?.code || villageCode,
        boarded: 0,
        exited: 0,
        source: "volunteer",
        recorded_at: new Date().toISOString(),
        note: `${count} students waiting at ${village?.name}`,
      });
      if (stop) await base44.entities.BusStop.update(stop.id, { students_waiting: count });
      await base44.entities.Notification.create({
        title: `${count} students waiting at ${village?.name}`,
        message: `Reported by the village volunteer. Feeder planning will use this count.`,
        audience: "admin",
        village_code: villageCode,
        level,
        requires_ack: true,
      });
      toast.success(`Waiting count reported: ${count}`);
    } else {
      await base44.entities.Incident.create({
        code: `INC-${Math.floor(3000 + Math.random() * 6000)}`,
        type: kind,
        title,
        description: `${title} at ${village?.name} reported by the village volunteer.`,
        status: "Reported",
        severity: kind === "road_block" ? "high" : "medium",
        village_code: villageCode,
        reported_role: "volunteer",
        reported_by: "Village volunteer",
        affected_passengers: Number(village?.students_count) || 0,
        lat: village?.lat,
        lng: village?.lng,
        timeline: [{ status: "Reported", at: "now", note: "Volunteer report from the village desk." }],
      });
      await base44.entities.Notification.create({
        title,
        message: `${village?.name}: ${title}. Verification needed.`,
        audience: "admin",
        village_code: villageCode,
        level: "critical",
        requires_ack: true,
      });
      toast.success("Report sent to the control centre");
    }
    setBusy(false);
    reload();
  }

  async function acknowledge(note) {
    await base44.entities.Notification.update(note.id, { acknowledged: true, read: true });
    toast.success("Task acknowledged");
    reload();
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader
        eyebrow="Volunteer · village network"
        title="Village desk"
        description="Report what you can see at the stop. Your counts feed feeder planning and let the control centre act before students are stranded."
        actions={
          <select
            value={villageCode}
            onChange={(e) => setVillageCode(e.target.value)}
            className="rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-primary/20"
          >
            {villages.map((v) => (
              <option key={v.code} value={v.code}>{v.name}</option>
            ))}
          </select>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          <div className="er-card p-4">
            <div className="er-label">Service area</div>
            <div className="mt-1 text-[14px] font-semibold text-brand-navy">{village?.name}</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              {village?.students_count} students · road {village?.road_type} ·{" "}
              {village?.large_bus_allowed ? "large bus permitted" : "large bus restricted"}
            </div>

            <div className="mt-3 flex items-end gap-2">
              <label className="flex-1">
                <span className="er-label">Students waiting now</span>
                <input
                  type="number"
                  min="0"
                  value={waiting}
                  onChange={(e) => setWaiting(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <button
                onClick={() => report({ kind: "waiting", title: "Waiting count", level: "info" })}
                disabled={busy}
                className="rounded-xl bg-primary px-3 py-2.5 text-[12px] font-bold text-white disabled:opacity-60"
              >
                Report count
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { kind: "overcrowding", title: `Bus passed ${village?.name} full`, icon: BusFront },
              { kind: "overcrowding", title: "Students unable to board", icon: Users },
              { kind: "road_block", title: "Road hazard or blockage", icon: TriangleAlert },
              { kind: "complaint", title: "Request extra transport", icon: LifeBuoy },
            ].map((b) => (
              <button
                key={b.title}
                onClick={() => report({ kind: b.kind, title: b.title, level: b.kind === "road_block" ? "critical" : "warning" })}
                disabled={busy}
                className="er-card flex items-start gap-2.5 p-3.5 text-left transition hover:border-primary/30 disabled:opacity-60"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                  <b.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[12px] font-semibold leading-snug text-brand-navy">{b.title}</span>
                  <span className="mt-0.5 block text-[10.5px] text-muted-foreground">Notifies the control centre immediately</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2">Tasks to acknowledge ({tasks.length})</div>
            {tasks.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No open tasks. Thanks for keeping the stop covered.</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border/70 p-2.5">
                    <div className="text-[11.5px] font-semibold text-brand-navy">{n.title}</div>
                    <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{n.message}</div>
                    <button
                      onClick={() => acknowledge(n)}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
                    >
                      <Check className="h-3 w-3" /> Acknowledge
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Bus status nearby</div>
            {fullBus ? (
              <div className="rounded-lg bg-rose-50 p-2.5 ring-1 ring-rose-600/10">
                <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-700">
                  <Flag className="h-3.5 w-3.5" /> {fullBus.vehicle_registration} is FULL
                </div>
                <div className="mt-0.5 text-[10.5px] text-rose-700/80">
                  {fullBus.unable_to_board} students left waiting · route {fullBus.route_code}
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] text-muted-foreground">No full buses reported right now.</p>
            )}
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Why your reports matter</div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Volunteer counts are fused into occupancy alongside tickets and the conductor count. They never replace
              the capacity rule — they only help the control centre see passengers the ticketing system cannot.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}