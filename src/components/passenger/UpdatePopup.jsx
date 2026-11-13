import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { base44 } from "@/api/base44Client";
import { markUpdateRead } from "@/lib/server-fns-updates";
import { isLive, priorityOf, PRIORITY_STYLES, sortUpdates } from "@/lib/updates";
import { Megaphone, X } from "lucide-react";

/**
 * Passenger popup: shows the newest unread live update that matches this
 * passenger's route, bus, journey or stops. Dismissing keeps it in history.
 */
export default function UpdatePopup({ updates = [] }) {
  const markRead = useServerFn(markUpdateRead);
  const [readIds, setReadIds] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    base44.auth
      .me()
      .then((user) =>
        base44.entities.AnnouncementRead.filter({ user_email: user?.email }, { limit: 100 }).then((res) => ({
          items: res?.items ?? res ?? [],
        }))
      )
      .then((res) => {
        if (alive) setReadIds(res.items.map((r) => r.notification_id));
      })
      .catch(() => {
        if (alive) setReadIds([]);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const live = sortUpdates(updates.filter((u) => isLive(u)));
  const next = live.find((u) => !readIds.includes(u.id) && !dismissed.includes(u.id));
  if (!loaded || !next) return null;

  const priority = priorityOf(next);
  const styles = PRIORITY_STYLES[priority] || PRIORITY_STYLES.normal;
  const published = next.created_date || next.valid_from;

  function dismiss() {
    setDismissed((prev) => [...prev, next.id]);
    markRead({ data: { notification_id: next.id } }).catch(() => null);
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
              <Megaphone className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {next.category || "Service update"}
              </div>
              <div className="text-[13.5px] font-extrabold text-brand-navy">{next.title}</div>
            </div>
          </div>
          <button onClick={dismiss} aria-label="Dismiss update" className="rounded-lg p-1 text-slate-400 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase ring-1 ${styles.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} /> {styles.label}
          </span>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-700">{next.message}</p>
          <div className="mt-2.5 space-y-0.5 text-[11px] text-muted-foreground">
            {next.vehicle_registration && <div>Affected bus: <span className="font-mono text-brand-navy">{next.vehicle_registration}</span></div>}
            {next.route_code && <div>Affected route: {next.route_code}</div>}
            {(next.stop_codes || []).length > 0 && <div>Stops: {next.stop_codes.join(", ")}</div>}
            <div>
              Published {published ? new Date(published).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "just now"}
              {next.published_by ? ` · ${next.published_by}` : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-4 py-2.5">
          <span className="text-[10.5px] text-muted-foreground">Unread · stays in your alerts history</span>
          <button onClick={dismiss} className="rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-bold text-white">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}