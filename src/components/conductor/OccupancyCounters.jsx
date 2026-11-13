import { computeOccupancy, formatINR, timeAgo } from "@/lib/mobility";
import { cn } from "@/lib/utils";

/**
 * The nine figures the requirement asks for, kept separate — tickets issued,
 * boarded, alighted, estimated onboard, authorized capacity, occupancy %,
 * free seats and the last ticket update.
 */
export default function OccupancyCounters({ trip, tickets = [], warningThreshold = 80 }) {
  if (!trip) return null;

  const occ = computeOccupancy({
    capacity: trip.capacity,
    tickets: trip.tickets_issued,
    manual: trip.manual_count,
    exited: trip.exits,
    transferred: trip.transfers,
    boarding_reports: trip.boarding_reports,
  });

  const boarded = tickets.reduce((sum, t) => sum + (Number(t.passenger_count) || 1), 0);
  const alightedTickets = tickets.filter((t) => t.status === "alighted");
  const alighted = alightedTickets.reduce((sum, t) => sum + (Number(t.passenger_count) || 1), 0);
  const activeTickets = tickets.filter((t) => t.status === "active").length;
  const lastUpdate = tickets.reduce((latest, t) => {
    const at = t.issued_at || t.created_at;
    return at && at > latest ? at : latest;
  }, trip.count_updated_at || "");

  const warning = occ.pct >= warningThreshold && occ.pct < 100;
  const full = occ.pct >= 100;

  const cells = [
    { label: "Tickets issued", value: tickets.length },
    { label: "Passengers boarded", value: boarded },
    { label: "Passengers alighted", value: alighted },
    { label: "Active tickets", value: activeTickets },
    { label: "Estimated onboard", value: occ.estimated, strong: true },
    { label: "Authorized capacity", value: occ.capacity },
    { label: "Occupancy", value: `${occ.pct}%`, strong: true },
    { label: "Seats free", value: occ.seats_free },
  ];

  return (
    <div className="er-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="er-label">Occupancy dashboard</div>
          <div className="text-[12px] text-muted-foreground">Tickets are never the headcount — counts are fused, capacity is a hard limit.</div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1",
            full
              ? "bg-rose-50 text-rose-700 ring-rose-600/20"
              : warning
                ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
          )}
        >
          {full ? "Full — ticketing blocked" : warning ? `Warning ≥ ${warningThreshold}%` : "Within capacity"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-xl border border-border/70 bg-muted/25 px-2.5 py-2">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{cell.label}</div>
            <div className={cn("mt-0.5 font-display text-[17px] font-extrabold text-brand-navy", cell.strong && "text-primary")}>
              {cell.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
        <span>Last ticket update: {lastUpdate ? timeAgo(lastUpdate) : "—"}</span>
        <span>Manual count {occ.manual || 0} · exits {occ.exited || 0} · revenue {formatINR(tickets.reduce((s, t) => s + (Number(t.payable_fare) || 0), 0))}</span>
      </div>
    </div>
  );
}