import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useOpsData } from "@/lib/useOps";
import { useRole } from "@/lib/useRole";
import { markUpdateRead } from "@/lib/server-fns-updates";
import { relevantToPassenger, priorityOf, PRIORITY_STYLES } from "@/lib/updates";
import PageHeader from "@/components/er/PageHeader";
import { Bell, Check, Loader2, AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/notifications")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Notifications" }] }),
  component: NotificationsPage,
});

const LEVEL = {
  critical: { chip: "bg-rose-50 text-rose-700 ring-rose-600/15", icon: ShieldAlert, label: "Critical" },
  warning: { chip: "bg-amber-50 text-amber-700 ring-amber-600/15", icon: AlertTriangle, label: "Warning" },
  info: { chip: "bg-sky-50 text-sky-700 ring-sky-600/15", icon: Info, label: "Info" },
  success: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", icon: CheckCircle2, label: "Update" },
};

function NotificationsPage() {
  const { loading, notifications = [], passes = [], routes = [], reload } = useOpsData();
  const role = useRole();
  const markReadFn = useServerFn(markUpdateRead);
  const [filter, setFilter] = useState("all");
  const [reads, setReads] = useState([]);
  const isStaff = role !== "passenger";
  const audience = role === "passenger" ? "passenger" : role === "volunteer" ? "volunteer" : role === "admin" ? "admin" : "driver";

  const pass = passes.find((p) => p.status === "active") || passes[0];
  const context = {
    routeCodes: routes.filter((r) => r.village_code && r.village_code === pass?.village_code).map((r) => r.code),
    tripCodes: [],
    vehicles: [],
    stopCodes: [pass?.home_stop_code].filter(Boolean),
  };

  useEffect(() => {
    if (isStaff) return;
    let alive = true;
    base44.auth
      .me()
      .then((user) => base44.entities.AnnouncementRead.filter({ user_email: user?.email }, { limit: 100 }))
      .then((res) => {
        if (alive) setReads((res?.items ?? res ?? []).map((r) => r.notification_id));
      })
      .catch(() => alive && setReads([]));
    return () => {
      alive = false;
    };
  }, [isStaff]);

  const isRead = (note) => (isStaff ? !!note.read : reads.includes(note.id));

  const visible = notifications.filter((n) => {
    // A passenger only sees updates that touch their route, bus, journey or stops.
    if (!isStaff && !relevantToPassenger(n, context)) return false;
    if (filter === "unread") return !isRead(n);
    if (filter === "ack") return n.requires_ack && !n.acknowledged;
    if (filter === "mine") return n.audience === audience || n.audience === "all" || role === "admin";
    return true;
  });

  async function acknowledge(note) {
    await base44.entities.Notification.update(note.id, { acknowledged: true, read: true });
    toast.success("Acknowledged — the control centre can see it");
    reload();
  }

  async function markRead(note) {
    if (!isStaff) {
      await markReadFn({ data: { notification_id: note.id } });
      setReads((prev) => [...prev, note.id]);
      return;
    }
    await base44.entities.Notification.update(note.id, { read: true });
    reload();
  }

  const openAck = notifications.filter((n) => n.requires_ack && !n.acknowledged).length;

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="Only what concerns you"
        description="Alerts are routed by role, route, assignment and service area — not broadcast to everyone. Anything marked acknowledge needs a response."
        actions={
          openAck > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-600/15">
              <Bell className="h-3.5 w-3.5" /> {openAck} awaiting acknowledgement
            </span>
          )
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {[
          { id: "all", label: "All" },
          { id: "mine", label: `For ${audience}` },
          { id: "ack", label: "Needs acknowledgement" },
          { id: "unread", label: "Unread" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ring-1 transition",
              filter === f.id ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-600 ring-border hover:text-brand-navy"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid h-48 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : visible.length === 0 ? (
        <div className="er-card p-6 text-center text-[12.5px] text-muted-foreground">Nothing here right now.</div>
      ) : (
        <div className="space-y-2">
          {visible.map((n) => {
            const lv = LEVEL[n.level] || LEVEL.info;
            const Icon = lv.icon;
            return (
              <div key={n.id} className={cn("er-card p-3.5", !isRead(n) && "ring-1 ring-primary/20")}>
                <div className="flex items-start gap-2.5">
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1", lv.chip)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold leading-snug text-brand-navy">{n.title}</span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1", lv.chip)}>{lv.label}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        {n.audience}
                      </span>
                      {n.requires_ack && !n.acknowledged && (
                        <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-700">Ack needed</span>
                      )}
                      {n.acknowledged && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                          <Check className="h-2.5 w-2.5" /> Acknowledged
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{n.message}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {isStaff && n.requires_ack && !n.acknowledged && (
                        <button onClick={() => acknowledge(n)} className="rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-white">
                          Acknowledge
                        </button>
                      )}
                      {!isRead(n) && (
                        <button onClick={() => markRead(n)} className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-slate-600">
                          Mark read
                        </button>
                      )}
                      {n.category && (
                        <span className={cn("rounded-md px-2 py-1 text-[10px] font-semibold ring-1", (PRIORITY_STYLES[priorityOf(n)] || PRIORITY_STYLES.normal).chip)}>
                          {n.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}