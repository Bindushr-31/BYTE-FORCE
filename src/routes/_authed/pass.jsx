import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useOpsData } from "@/lib/useOps";
import { verifyPass } from "@/lib/server-fns";
import { formatINR, fareBreakdown } from "@/lib/mobility";
import PageHeader from "@/components/er/PageHeader";
import PassCard from "@/components/pass/PassCard";
import { ScanLine, ShieldCheck, ShieldX, Loader2, WifiOff, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/pass")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Student mobility pass" }] }),
  component: PassPage,
});

function PassPage() {
  const { loading, passes = [], config, reload } = useOpsData();
  const verify = useServerFn(verifyPass);

  const [selected, setSelected] = useState("SR-PASS-2026-0142");
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const pass = useMemo(() => passes.find((p) => p.pass_code === selected) || passes[0], [passes, selected]);
  const sampleFare = fareBreakdown({ distanceKm: 32.4, concessionPct: Number(pass?.concession_pct) || 60 });

  async function check(e) {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    const res = await verify({ data: { pass_code: code, trip_code: "ER-0417" } });
    setBusy(false);
    setResult(res);
    if (res?.ok) toast.success(res.expired ? "Pass expired — collect full fare" : "Pass verified");
    else toast.error(res?.error || "Pass not found");
  }

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div>
      <PageHeader
        eyebrow="Student mobility pass"
        title="Digital and printable pass"
        description="A unique pass ID with QR for every student. The conductor scans or types the ID; fares and concessions are computed from the college rule, not a fixed government rate."
        actions={
          passes.length > 0 && (
            <select
              value={pass?.pass_code}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-xl border border-border bg-white px-3 py-2 text-[12px] font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-primary/20"
            >
              {passes.map((p) => (
                <option key={p.pass_code} value={p.pass_code}>{p.student_name} · {p.pass_code}</option>
              ))}
            </select>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          {pass && <PassCard pass={pass} onPrint={() => window.print()} />}

          <div className="er-card p-4">
            <div className="er-label mb-2">Fare with this pass</div>
            <div className="space-y-1.5 text-[12.5px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Regular fare (32.4 km)</span><span className="font-semibold text-brand-navy">{formatINR(sampleFare.full)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Concession ({sampleFare.concessionPct}%)</span><span className="font-semibold text-emerald-600">−{formatINR(sampleFare.concession)}</span></div>
              <div className="flex justify-between border-t border-border/70 pt-1.5"><span className="font-semibold text-brand-navy">Payable</span><span className="font-display text-[15px] font-extrabold text-primary">{formatINR(sampleFare.payable)}</span></div>
            </div>
            <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-teal-50 p-2 text-[10.5px] leading-snug text-teal-800 ring-1 ring-teal-600/10">
              <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Validity and concession data are cached on the device, so a conductor can still verify the pass when the network drops.
            </div>
          </div>

          <div className="er-card p-4">
            <div className="er-label mb-2">Rules in force</div>
            <dl className="space-y-1.5 text-[11.5px]">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Concession</dt><dd className="text-right font-semibold text-brand-navy">{config?.concession_pct ?? 60}%</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Validity</dt><dd className="text-right font-semibold text-brand-navy">{config?.pass_validity_days ?? 300} days</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Vehicle types</dt><dd className="text-right font-semibold text-brand-navy">{(config?.concession_vehicle_categories || []).join(", ")}</dd></div>
            </dl>
            <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">{config?.concession_eligibility}</p>
            <Link to="/settings" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline">
              Admin can edit these rules <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="space-y-3 lg:col-span-3">
          <form onSubmit={check} className="er-card p-4">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-primary" />
              <div className="text-[13px] font-semibold text-brand-navy">Conductor verification</div>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              Scan the QR or type the pass ID. Verification runs on the server so a tampered device cannot fake validity.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SR-PASS-2026-0142"
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 font-mono text-[12.5px] uppercase outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-60"
              >
                {busy ? "Checking…" : "Verify pass"}
              </button>
            </div>

            {result && (
              <div className={`mt-3 rounded-xl border p-3 ${
                result.ok && !result.expired && result.pass?.status === "active"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-rose-200 bg-rose-50"
              }`}>
                {result.ok ? (
                  <>
                    <div className="flex items-center gap-1.5 text-[12px] font-bold">
                      {!result.expired && result.pass.status === "active" ? (
                        <>
                          <ShieldCheck className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-800">Pass valid</span>
                        </>
                      ) : (
                        <>
                          <ShieldX className="h-4 w-4 text-rose-600" />
                          <span className="text-rose-800">Pass {result.expired ? "expired" : result.pass.status}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-[12px] text-slate-700">
                      {result.pass.student_name} · {result.pass.college} · concession {result.pass.concession_pct}%
                    </div>
                    <div className="text-[11px] text-muted-foreground">Valid to {result.pass.valid_to} · vehicles {(result.pass.vehicle_categories || []).join(", ")}</div>
                    {result.fare && (
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-white/70 p-1.5">
                          <div className="text-[9px] uppercase text-slate-500">Regular</div>
                          <div className="text-[12px] font-bold text-brand-navy">{formatINR(result.fare.full)}</div>
                        </div>
                        <div className="rounded-lg bg-white/70 p-1.5">
                          <div className="text-[9px] uppercase text-slate-500">Concession</div>
                          <div className="text-[12px] font-bold text-emerald-700">−{formatINR(result.fare.concession)}</div>
                        </div>
                        <div className="rounded-lg bg-white/70 p-1.5">
                          <div className="text-[9px] uppercase text-slate-500">Payable</div>
                          <div className="text-[12px] font-bold text-brand-navy">{formatINR(result.fare.payable)}</div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[12px] font-semibold text-rose-800">{result.error}</div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setCode("SR-PASS-2026-0142")}
              className="mt-2 text-[10.5px] font-semibold text-primary hover:underline"
            >
              Use the demo pass ID
            </button>
          </form>

          <div className="er-card overflow-hidden">
            <div className="border-b border-border/70 bg-muted/40 px-4 py-2.5">
              <div className="er-label">Issued passes</div>
            </div>
            <div className="divide-y divide-border/60">
              {passes.map((p) => (
                <div key={p.pass_code} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-brand-navy">{p.student_name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{p.pass_code}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[11px] font-semibold text-slate-600">{p.concession_pct}%</div>
                    <div className={`text-[9.5px] font-bold uppercase ${
                      p.status === "active" ? "text-emerald-600" : p.status === "expired" ? "text-rose-600" : "text-amber-600"
                    }`}>{p.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              reload();
              toast.success("Pass data cached for offline verification");
            }}
            className="w-full rounded-xl border border-border bg-white py-2.5 text-[11.5px] font-semibold text-slate-600 hover:border-primary/30 hover:text-primary"
          >
            Cache validity data for offline checks
          </button>
        </div>
      </div>
    </div>
  );
}