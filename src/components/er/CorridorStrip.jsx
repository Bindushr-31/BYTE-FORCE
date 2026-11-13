import { cn } from "@/lib/utils";

const NODES = [
  { name: "Kasaragod", type: "start" },
  { name: "Uppala", type: "hub" },
  { name: "Manjeshwar", type: "hub" },
  { name: "Talapady", type: "hub" },
  { name: "Ullal", type: "stop" },
  { name: "Sahyadri College", type: "end" },
];

export default function CorridorStrip({ className, dense = false }) {
  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <div className="absolute left-0 right-0 top-[7px] h-[3px] rounded-full bg-white/15" />
        <div className="absolute left-0 top-[7px] h-[3px] w-[72%] rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300" />
        <div className="relative flex justify-between">
          {NODES.map((node) => (
            <div key={node.name} className="flex w-[16%] flex-col items-center">
              <span
                className={cn(
                  "relative z-10 rounded-full ring-4 ring-brand-navy",
                  node.type === "hub" ? "h-3.5 w-3.5 bg-cyan-300" : node.type === "end" ? "h-3.5 w-3.5 bg-emerald-300" : "h-3 w-3 bg-white"
                )}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between">
        {NODES.map((node) => (
          <div key={node.name} className={cn("w-[16%] text-center text-[9.5px] leading-tight", dense ? "text-white/70" : "text-white/70")}>
            {node.name}
          </div>
        ))}
      </div>
    </div>
  );
}