import { computeOccupancy, levelClasses, levelLabel, timeAgo } from "@/lib/mobility";
import { cn } from "@/lib/utils";

export default function OccupancyMeter({ trip, compact = false, showFigures = true }) {
  const occ = computeOccupancy({
    capacity: trip.capacity,
    tickets: trip.tickets_issued,
    manual: trip.manual_count,
    exited: trip.exits,
    transferred: trip.transfers,
    boarding_reports: trip.boarding_reports,
  });
  const cls = levelClasses(occ.level);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className={cn("font-display font-extrabold leading-none", compact ? "text-[15px]" : "text-[19px]", cls.text)}>
            {occ.pct}%
          </span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {occ.estimated}/{occ.capacity}
          </span>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1", cls.chip)}>
          {levelLabel(occ.level)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all duration-500", cls.bar)}
          style={{ width: `${Math.min(100, occ.pct)}%` }}
        />
      </div>
      {showFigures && !compact && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
          <div>Tickets issued <span className="font-semibold text-slate-700">{occ.tickets}</span></div>
          <div>Manual count <span className="font-semibold text-slate-700">{occ.manual || "—"}</span></div>
          <div className="col-span-2 truncate">Source: {occ.source_label}</div>
          <div className="col-span-2">Updated {timeAgo(trip.count_updated_at)}</div>
        </div>
      )}
      {showFigures && compact && (
        <div className="mt-1 truncate text-[10px] text-muted-foreground">Updated {timeAgo(trip.count_updated_at)}</div>
      )}
    </div>
  );
}