import { cn } from "@/lib/utils";

const TONES = {
  navy: "text-brand-navy",
  blue: "text-primary",
  teal: "text-teal-700",
  amber: "text-amber-600",
  rose: "text-rose-600",
  emerald: "text-emerald-600",
};

export default function StatTile({ label, value, hint, tone = "navy", icon: Icon, className }) {
  return (
    <div className={cn("er-card p-3.5 sm:p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="er-label leading-tight">{label}</div>
        {Icon && <Icon className={cn("h-4 w-4 shrink-0 opacity-70", TONES[tone])} strokeWidth={1.9} />}
      </div>
      <div className={cn("mt-2 font-display text-[24px] font-extrabold leading-none sm:text-[26px]", TONES[tone])}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}