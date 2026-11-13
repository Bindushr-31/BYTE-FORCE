import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useOpsData } from "@/lib/useOps";
import { saveConfig } from "@/lib/server-fns";
import PageHeader from "@/components/er/PageHeader";
import { Loader2, Save, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authed/settings")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Rules & config" }] }),
  component: SettingsPage,
});

const CATEGORIES = ["government", "private", "feeder"];

function SettingsPage() {
  const { loading, config, reload } = useOpsData();
  const save = useServerFn(saveConfig);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (config && !form) setForm({ ...config });
  }, [config, form]);

  if (loading || !form) return <div className="grid h-64 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  function field(key, label, type = "text", hint) {
    return (
      <label className="block">
        <span className="er-label">{label}</span>
        <input
          type={type}
          value={form[key] ?? ""}
          onChange={(e) => setForm({ ...form, [key]: type === "number" ? Number(e.target.value) : e.target.value })}
          className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] font-semibold text-brand-navy outline-none focus:ring-2 focus:ring-primary/20"
        />
        {hint && <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>}
      </label>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const res = await save({ data: form });
    setBusy(false);
    if (!res?.ok) return toast.error(res?.error || "Could not save.");
    toast.success("Rules updated for every fare and pass check");
    reload();
  }

  return (
    <div>
      <PageHeader
        eyebrow="Admin configuration"
        title="Rules & configuration"
        description="Peak windows, concession policy and fare parameters are stored once and applied deterministically everywhere. Nothing here is invented by the AI."
      />

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <div className="er-card p-4">
          <div className="er-label mb-2">Peak hours</div>
          <div className="grid grid-cols-2 gap-2">
            {field("morning_peak_start", "Morning start")}
            {field("morning_peak_end", "Morning end")}
            {field("evening_peak_start", "Evening start")}
            {field("evening_peak_end", "Evening end")}
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
            Surge analysis and extra-vehicle recommendations use these windows.
          </p>
        </div>

        <div className="er-card p-4">
          <div className="er-label mb-2">Concession policy</div>
          <div className="grid grid-cols-2 gap-2">
            {field("concession_pct", "Concession %", "number")}
            {field("pass_validity_days", "Pass validity (days)", "number")}
            {field("warning_threshold", "Warning threshold %", "number")}
            {field("transfer_buffer_min", "Transfer buffer (min)", "number")}
          </div>
          <label className="mt-2 block">
            <span className="er-label">Eligibility</span>
            <textarea
              rows={2}
              value={form.concession_eligibility || ""}
              onChange={(e) => setForm({ ...form, concession_eligibility: e.target.value })}
              className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="mt-2">
            <span className="er-label">Vehicle categories</span>
            <div className="mt-1 flex gap-1.5">
              {CATEGORIES.map((c) => {
                const on = (form.concession_vehicle_categories || []).includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        concession_vehicle_categories: on
                          ? (form.concession_vehicle_categories || []).filter((x) => x !== c)
                          : [...(form.concession_vehicle_categories || []), c],
                      })
                    }
                    className={`rounded-lg px-2.5 py-1 text-[10.5px] font-semibold ring-1 ${on ? "bg-primary text-white ring-primary" : "bg-white text-slate-600 ring-border"}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="er-card p-4">
          <div className="er-label mb-2">Fare parameters</div>
          <div className="grid grid-cols-3 gap-2">
            {field("fare_base", "Base ₹", "number")}
            {field("fare_per_km", "Per km ₹", "number")}
            {field("fare_minimum", "Minimum ₹", "number")}
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">
            Regular fare = base + rate × distance, floored at the minimum. Concession is a percentage of that amount.
          </p>
        </div>

        <div className="er-card p-4">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="er-label">How AI is used</div>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{form.ai_note}</p>
          <button type="submit" disabled={busy} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-[12px] font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save configuration
          </button>
        </div>
      </form>
    </div>
  );
}