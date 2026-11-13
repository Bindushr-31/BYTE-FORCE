import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { aiAnalyze } from "@/lib/server-fns";
import { computeOccupancy } from "@/lib/mobility";
import PageHeader from "@/components/er/PageHeader";
import { Loader2, Sparkles, Database, ShieldCheck, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authed/ai")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · AI insights" }] }),
  component: AiPage,
});

const FOCUS = [
  { id: "demand", label: "Demand forecast", question: "Which services will run out of seats first, and what should we add?" },
  { id: "peak", label: "Peak hours", question: "How is demand distributed across the peak windows, and where should the window be extended?" },
  { id: "disruption", label: "Disruption analysis", question: "Which cancellations and incidents hurt students most right now?" },
  { id: "allocation", label: "Allocation suggestion", question: "Where should the spare authorized van and private bus be allocated?" },
  { id: "feeder", label: "Feeder planning", question: "Which villages need a feeder timed differently to connect with the main bus?" },
  { id: "connectivity", label: "Poorly connected villages", question: "Which villages are worst connected to the college and why?" },
];

function AiPage() {
  const ask = useServerFn(aiAnalyze);
  const [focus, setFocus] = useState(FOCUS[0]);
  const [question, setQuestion] = useState(FOCUS[0].question);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run(e) {
    e?.preventDefault();
    setBusy(true);
    try {
      const res = await ask({ data: { question, focus: focus.id } });
      setResult(res);
      if (!res?.ok) toast.error("The analysis could not run.");
    } catch {
      toast.error("The analysis service did not respond.");
    }
    setBusy(false);
  }

  const trips = result?.context?.trips || [];
  const busiest = [...trips]
    .filter((t) => t.status === "active")
    .sort((a, b) => b.occupancy_pct - a.occupancy_pct)
    .slice(0, 6);

  return (
    <div>
      <PageHeader
        eyebrow="AI panel"
        title="AI predicts, explains — code enforces"
        description="Every answer is generated from the live records shown below, and cites the trip codes and village names it used. Capacity, fares and eligibility are never decided here."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <div className="er-card p-4">
            <div className="er-label mb-2">Analysis focus</div>
            <div className="grid grid-cols-2 gap-1.5">
              {FOCUS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFocus(f);
                    setQuestion(f.question);
                  }}
                  className={`rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold ring-1 transition ${
                    focus.id === f.id ? "bg-primary text-white ring-primary" : "bg-white text-slate-600 ring-border hover:text-brand-navy"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <form onSubmit={run} className="mt-3">
              <span className="er-label">Ask about the corridor</span>
              <textarea
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] leading-relaxed outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button type="submit" disabled={busy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-navy py-2.5 text-[12px] font-bold text-white disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? "Analysing live records…" : "Generate analysis"}
              </button>
            </form>
          </div>

          <div className="er-card p-4">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <div className="er-label">Responsible AI guardrails</div>
            </div>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-muted-foreground">
              <li className="flex gap-1.5"><span className="text-emerald-600">•</span> The model receives the real records below and is instructed to use nothing else.</li>
              <li className="flex gap-1.5"><span className="text-emerald-600">•</span> It may not invent vehicles, registrations, permits, counts or incidents.</li>
              <li className="flex gap-1.5"><span className="text-emerald-600">•</span> It cannot exceed an authorized capacity or move a large bus onto a restricted road — code refuses that.</li>
              <li className="flex gap-1.5"><span className="text-emerald-600">•</span> Fares and concessions are deterministic functions, not model output.</li>
              <li className="flex gap-1.5"><span className="text-emerald-600">•</span> An admin always confirms an allocation; nothing is dispatched automatically.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-3">
          {!result && !busy && (
            <div className="er-card grid h-52 place-items-center p-6 text-center">
              <div>
                <Sparkles className="mx-auto h-6 w-6 text-primary/50" />
                <p className="mt-2 text-[12.5px] font-semibold text-brand-navy">No analysis yet</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">Pick a focus and generate — the data used is listed beside every answer.</p>
              </div>
            </div>
          )}

          {busy && (
            <div className="er-card grid h-52 place-items-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                <p className="mt-2 text-[11.5px] text-muted-foreground">Reading trips, villages and incidents…</p>
              </div>
            </div>
          )}

          {result?.ok && (
            <>
              <div className="er-card p-4">
                <div className="flex items-center justify-between">
                  <div className="er-label">Analysis · {focus.label}</div>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/20">
                    Model output — verify before acting
                  </span>
                </div>
                <div className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700">{result.answer}</div>
              </div>

              <div className="er-card p-4">
                <div className="flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-slate-500" />
                  <div className="er-label">Data used for this answer</div>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  {[
                    { k: "Trips", v: result.used.trips },
                    { k: "Villages", v: result.used.villages },
                    { k: "Incidents", v: result.used.incidents },
                    { k: "Tickets", v: result.used.tickets },
                  ].map((m) => (
                    <div key={m.k} className="rounded-lg bg-muted/60 p-2">
                      <div className="text-[15px] font-bold text-brand-navy">{m.v}</div>
                      <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground">{m.k}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-[11px]">
                    <thead>
                      <tr className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
                        <th className="py-1.5 pr-2 font-semibold">Trip</th>
                        <th className="py-1.5 pr-2 font-semibold">Vehicle</th>
                        <th className="py-1.5 pr-2 font-semibold">Onboard</th>
                        <th className="py-1.5 pr-2 font-semibold">Capacity</th>
                        <th className="py-1.5 pr-2 font-semibold">Occupancy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {busiest.map((t) => (
                        <tr key={t.trip_code}>
                          <td className="py-1.5 pr-2 font-mono text-[10px] text-slate-500">{t.trip_code}</td>
                          <td className="py-1.5 pr-2 font-mono text-[10px] font-semibold text-brand-navy">{t.vehicle}</td>
                          <td className="py-1.5 pr-2">{t.estimated_onboard}</td>
                          <td className="py-1.5 pr-2">{t.authorized_capacity}</td>
                          <td className="py-1.5 pr-2">
                            <span className={`font-semibold ${t.occupancy_pct >= 100 ? "text-rose-600" : t.occupancy_pct >= 80 ? "text-amber-600" : "text-emerald-600"}`}>
                              {t.occupancy_pct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/60 p-2 text-[10px] leading-snug text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Generated {new Date(result.used.generated_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST from the rows above. Deterministic values (capacity, fare, eligibility) are re-checked in code when you act.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}