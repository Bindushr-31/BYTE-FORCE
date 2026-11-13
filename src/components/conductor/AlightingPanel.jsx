import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { confirmAlighting, getAlightingQueue } from "@/lib/server-fns-ticketing";
import { Button } from "@/components/ui/button";
import { CheckCheck, Loader2, MapPin } from "lucide-react";

/**
 * Alighting is confirmed by the conductor, never subtracted from GPS alone.
 * When the bus reaches a stop the conductor sees the active tickets due here,
 * confirms once, and repeating the confirmation changes nothing.
 */
export default function AlightingPanel({ trip, stops = [], onDone }) {
  const loadQueue = useServerFn(getAlightingQueue);
  const confirm = useServerFn(confirmAlighting);
  const stopCodes = stops.map((s) => s.code);
  const [stopCode, setStopCode] = useState(stopCodes[stopCodes.length - 1] || "");
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!stopCodes.includes(stopCode)) setStopCode(stopCodes[stopCodes.length - 1] || "");
  }, [trip?.trip_code, stopCodes.join(",")]);

  useEffect(() => {
    if (!trip || !stopCode) return;
    let alive = true;
    setLoading(true);
    loadQueue({ data: { trip_code: trip.trip_code, stop_code: stopCode } })
      .then((res) => {
        if (!alive) return;
        setQueue(res?.tickets || []);
      })
      .catch(() => alive && setQueue([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [trip?.trip_code, stopCode]);

  const passengers = queue.reduce((sum, t) => sum + (Number(t.passenger_count) || 1), 0);

  async function handleConfirm() {
    if (!trip || !queue.length) return;
    setBusy(true);
    const res = await confirm({
      data: { trip_code: trip.trip_code, stop_code: stopCode, ticket_ids: queue.map((t) => t.id) },
    });
    setBusy(false);
    if (!res?.ok) {
      toast.error(res?.error || "Alighting could not be confirmed.");
      return;
    }
    setSummary(res);
    setQueue([]);
    toast.success(
      res.already_confirmed
        ? `Already confirmed — nothing was subtracted twice`
        : `${res.passengers} passenger${res.passengers === 1 ? "" : "s"} alighted · onboard ${res.occupancy.estimated}/${res.occupancy.capacity}`
    );
    onDone?.();
  }

  return (
    <div className="er-card p-4">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <div className="text-[13px] font-semibold text-brand-navy">Alighting confirmation</div>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        GPS arrival is only a prompt. Counts drop when you confirm here, once per ticket.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={stopCode}
          onChange={(e) => setStopCode(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
        >
          {stops.map((s) => (
            <option key={s.code} value={s.code}>Arriving at {s.name}</option>
          ))}
        </select>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10.5px] font-semibold text-slate-600">
          {queue.length} ticket{queue.length === 1 ? "" : "s"} · {passengers} passenger{passengers === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className="mt-3 grid h-16 place-items-center"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
      ) : queue.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-[11.5px] text-muted-foreground">
          No active ticket ends at this stop.
        </p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {queue.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="truncate text-[11.5px] font-semibold text-brand-navy">{t.student_name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{t.ticket_id}</div>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {t.passenger_count} pax
              </span>
            </div>
          ))}
        </div>
      )}

      <Button onClick={handleConfirm} disabled={busy || !queue.length} className="mt-3 w-full">
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1.5 h-4 w-4" />}
        Confirm alighting — subtract {passengers} once
      </Button>

      {summary && (
        <p className="mt-2 text-[10.5px] text-emerald-700">
          Confirmed {summary.confirmed} ticket(s), {summary.passengers} passenger(s). Onboard now {summary.occupancy.estimated}/{summary.occupancy.capacity}.
        </p>
      )}
    </div>
  );
}