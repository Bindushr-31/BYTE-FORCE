import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useOpsData } from "@/lib/useOps";
import { issueTickets, updateTripCount } from "@/lib/server-fns";
import { cancelTicket } from "@/lib/server-fns-ticketing";
import { formatINR, timeAgo } from "@/lib/mobility";
import PageHeader from "@/components/er/PageHeader";
import OccupancyMeter from "@/components/er/OccupancyMeter";
import OccupancyCounters from "@/components/conductor/OccupancyCounters";
import AlightingPanel from "@/components/conductor/AlightingPanel";
import { Plus, Minus, Loader2, Ticket as TicketIcon, AlertTriangle, Users } from "lucide-react";

export const Route = createFileRoute("/_authed/conductor")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Conductor ticketing" }] }),
  component: ConductorPage,
});

const EMPTY = { pass_code: "", from_stop: "", to_stop: "", count: "1", method: "qr" };

function ConductorPage() {
  const { loading, trips = [], routes = [], config, reload } = useOpsData();
  const issue = useServerFn(issueTickets);
  const updateCount = useServerFn(updateTripCount);

  const running = useMemo(() => trips.filter((t) => ["active", "scheduled"].includes(t.status)), [trips]);
  const [tripCode, setTripCode] = useState("ER-0417");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [tickets, setTickets] = useState([]);

  const trip = trips.find((t) => t.trip_code === tripCode) || running[0];
  const route = routes.find((r) => r.code === trip?.route_code);
  const stops = route?.stops || [];

  useEffect(() => {
    if (!trip) return;
    let alive = true;
    base44.entities.TicketTransaction.filter({ trip_code: trip.trip_code }, { sort: "-created_at", limit: 100 })
      .then((res) => {
        if (alive) setTickets(res?.items ?? res ?? []);
      })
      .catch(() => setTickets([]));
    return () => {
      alive = false;
    };
  }, [trip?.trip_code, result]);

  const stopCodes = stops.map((s) => s.code);
  const fromStop = stopCodes.includes(form.from_stop) ? form.from_stop : stopCodes[0] || "";
  const toStop = stopCodes.includes(form.to_stop) && form.to_stop !== fromStop
    ? form.to_stop
    : stopCodes[stopCodes.length - 1] || "";

  async function submit(e) {
    e.preventDefault();
    if (!trip) return;
    setBusy(true);
    const res = await issue({
      data: {
        trip_code: trip.trip_code,
        pass_code: form.pass_code,
        from_stop: fromStop,
        to_stop: toStop,
        count: Number(form.count) || 1,
        method: form.method,
      },
    });
    setBusy(false);
    if (!res?.ok) {
      toast.error(res?.error || "Ticket could not be issued.");
      return;
    }
    setResult(res);
    setForm((f) => ({ ...EMPTY, from_stop: f.from_stop, to_stop: f.to_stop }));
    toast.success(`Ticket issued · ${formatINR(res.fare.payable)} payable`);
    reload();
  }

  async function reverse(ticket, refund) {
    setBusy(true);
    const res = await cancelTicket({ data: { ticket_id: ticket.ticket_id, record_id: ticket.id, refund, reason: refund ? "Refunded by conductor" : "Cancelled by conductor" } });
    setBusy(false);
    if (!res?.ok) {
      toast.error(res?.error || "Ticket could not be reversed.");
      return;
    }
    toast.success(`Ticket ${refund ? "refunded" : "cancelled"} · ${res.passengers} passenger(s) removed`);
    reload();
  }

  async function counter(patch, label) {
    if (!trip) return;
    setBusy(true);
    const res = await updateCount({ data: { trip_code: trip.trip_code, ...patch } });
    setBusy(false);
    if (!res?.ok) {
      toast.error(res?.error || "Count not updated.");
      return;
    }
    toast.success(label);
    reload();
  }

  if (loading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Conductor"
        title="Ticketing simulator"
        description="Issues tickets, verifies the student pass and updates the trip dashboard instantly. Simulated demo data — not a live ticketing integration."
        actions={
          <select
            value={trip?.trip_code || ""}
            onChange={(e) => setTripCode(e.target.value)}
            className="rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-primary/20"
          >
            {running.map((t) => (
              <option key={t.trip_code} value={t.trip_code}>
                {t.vehicle_registration} · {t.scheduled_departure} · {t.route_code}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <OccupancyCounters
            trip={trip}
            tickets={tickets}
            warningThreshold={Number(config?.warning_threshold) || 80}
          />

          <div className="er-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="er-label">Onboard</div>
                <div className="font-mono text-[12.5px] font-semibold text-brand-navy">{trip?.vehicle_registration}</div>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {trip?.vehicle_type === "feeder" ? "Feeder van" : trip?.vehicle_type === "private" ? "Private bus" : "Gov bus"}
              </span>
            </div>
            <div className="mt-3">{trip && <OccupancyMeter trip={trip} />}</div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: "+1", patch: { delta: 1 }, icon: Plus },
                { label: "+5", patch: { delta: 5 }, icon: Plus },
                { label: "−1", patch: { delta: -1 }, icon: Minus },
                { label: "−5", patch: { delta: -5 }, icon: Minus },
              ].map((b) => (
                <button
                  key={b.label}
                  disabled={busy}
                  onClick={() => counter(b.patch, `Manual count ${b.label}`)}
                  className="rounded-xl border border-border bg-white py-3 text-[13px] font-bold text-brand-navy transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                disabled={busy}
                onClick={() => counter({ mark_full: true, unable_to_board: 6 }, "Marked FULL at authorized capacity")}
                className="rounded-xl bg-rose-600 py-2.5 text-[12px] font-bold text-white disabled:opacity-50"
              >
                Mark FULL
              </button>
              <button
                disabled={busy}
                onClick={() => counter({ manual_count: trip?.capacity || 0 }, "Count set to authorized capacity")}
                className="rounded-xl border border-border py-2.5 text-[12px] font-semibold text-slate-600 disabled:opacity-50"
              >
                Enter count = capacity
              </button>
            </div>
            <button
              disabled={busy}
              onClick={() => counter({ unable_to_board: 4 }, "4 students reported unable to board")}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2 text-[11.5px] font-semibold text-amber-800 disabled:opacity-50"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Passengers unable to board
            </button>
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Transaction history</div>
            {tickets.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">No tickets issued on this trip yet.</p>
            ) : (
              <div className="space-y-1.5">
                {tickets.slice(0, 10).map((t) => (
                  <div key={t.id} className="rounded-lg border border-border/70 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[11.5px] font-semibold text-brand-navy">
                          {t.student_name}
                          {Number(t.passenger_count) > 1 && <span className="ml-1 text-[10px] text-muted-foreground">×{t.passenger_count}</span>}
                        </div>
                        <div className="font-mono text-[9.5px] text-muted-foreground">{t.ticket_id || t.id}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {t.from_stop} → {t.to_stop} · {timeAgo(t.created_at)}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11.5px] font-bold text-primary">{formatINR(t.payable_fare)}</div>
                        <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          t.status === "alighted" ? "bg-blue-50 text-blue-700" : t.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                        }`}>{t.status || "active"}</span>
                      </div>
                    </div>
                    {(t.status || "active") === "active" && (
                      <div className="mt-1 flex gap-1.5">
                        <button onClick={() => reverse(t, false)} disabled={busy} className="rounded-md border border-border px-2 py-1 text-[9.5px] font-semibold text-slate-600 disabled:opacity-50">
                          Cancel &amp; reverse
                        </button>
                        <button onClick={() => reverse(t, true)} disabled={busy} className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1 text-[9.5px] font-semibold text-purple-700 disabled:opacity-50">
                          Refund
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-3">
          <form onSubmit={submit} className="er-card p-4">
            <div className="flex items-center gap-2">
              <TicketIcon className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold text-brand-navy">Issue a ticket</div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="er-label">Boarding stop</span>
                <select
                  value={fromStop}
                  onChange={(e) => setForm({ ...form, from_stop: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {stops.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="er-label">Destination</span>
                <select
                  value={toStop}
                  onChange={(e) => setForm({ ...form, to_stop: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {stops.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="er-label">Pass ID (optional)</span>
                <input
                  value={form.pass_code}
                  onChange={(e) => setForm({ ...form, pass_code: e.target.value })}
                  placeholder="SR-PASS-2026-0142"
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 font-mono text-[12px] uppercase outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block">
                <span className="er-label">Passengers on this ticket</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={form.count}
                  onChange={(e) => setForm({ ...form, count: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {["qr", "manual_id", "cash"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, method: m })}
                  className={`rounded-lg px-3 py-1.5 text-[11.5px] font-semibold ring-1 transition ${
                    form.method === m ? "bg-primary text-white ring-primary" : "bg-white text-slate-600 ring-border"
                  }`}
                >
                  {m === "qr" ? "QR pass" : m === "manual_id" ? "Type pass ID" : "Cash fare"}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[12.5px] font-bold text-white transition hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TicketIcon className="h-4 w-4" />}
              Issue ticket & update dashboard
            </button>

            <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
              Tickets are never treated as the headcount. The occupancy engine nets out exits and transfers, then blends
              the conductor count. Issue always fails if it would exceed authorized capacity.
            </p>

            {result?.ok && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Ticket issued</div>
                <div className="mt-1 text-[12px] text-emerald-900">
                  {result.pass ? `${result.pass.name} · pass ${result.pass.code}` : "Walk-in passenger"}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/70 p-1.5">
                    <div className="text-[9.5px] uppercase text-emerald-700/70">Regular</div>
                    <div className="text-[12px] font-bold text-emerald-900">{formatINR(result.ticket?.full_fare ?? result.fare.full)}</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-1.5">
                    <div className="text-[9.5px] uppercase text-emerald-700/70">Concession</div>
                    <div className="text-[12px] font-bold text-emerald-900">−{formatINR(result.ticket?.concession_amount ?? result.fare.concession)}</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-1.5">
                    <div className="text-[9.5px] uppercase text-emerald-700/70">Paid for {result.ticket?.passenger_count ?? 1} pax</div>
                    <div className="text-[12px] font-bold text-emerald-900">{formatINR(result.ticket?.payable_fare ?? result.fare.payable)}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-emerald-800">
                  <Users className="h-3 w-3" /> Occupancy now {result.occupancy.pct}% ({result.occupancy.estimated}/{result.occupancy.capacity})
                </div>
              </div>
            )}
          </form>

          <div className="mt-3">
            <AlightingPanel trip={trip} stops={stops} onDone={reload} />
          </div>
        </div>
      </div>
    </div>
  );
}