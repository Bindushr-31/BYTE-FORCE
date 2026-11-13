import { useEffect, useState } from "react";
import { QRCodeCanvas } from "@/components/pass/QrCode";

export default function PassCard({ pass, onPrint }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy via-[#122B6B] to-[#0B3F52] p-5 text-white shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Student mobility pass</div>
          <div className="mt-1.5 font-display text-[19px] font-extrabold leading-tight">{pass.student_name}</div>
          <div className="mt-0.5 text-[11px] text-white/60">{pass.college}</div>
        </div>
        <div className="rounded-lg bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-200 ring-1 ring-white/15">
          {pass.status}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[9.5px] uppercase tracking-[0.14em] text-white/45">Pass ID</div>
          <div className="font-mono text-[13px] font-bold tracking-wide">{pass.pass_code}</div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] text-white/70">
            <div>
              <span className="text-white/40">Valid from</span>
              <div className="font-semibold text-white">{pass.valid_from || "—"}</div>
            </div>
            <div>
              <span className="text-white/40">Valid to</span>
              <div className="font-semibold text-white">{pass.valid_to || "—"}</div>
            </div>
            <div>
              <span className="text-white/40">Concession</span>
              <div className="font-semibold text-emerald-300">{pass.concession_pct}%</div>
            </div>
            <div>
              <span className="text-white/40">Vehicles</span>
              <div className="font-semibold text-white">{(pass.vehicle_categories || []).join(", ")}</div>
            </div>
          </div>
        </div>
        <QRCodeCanvas value={`EASY-RIDE|${pass.pass_code}|${pass.student_name}|${pass.valid_to}`} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-2.5 text-[9.5px] text-white/45">
        <span>Scan or type the pass ID at the ticket counter</span>
        <button onClick={onPrint} className="rounded-md bg-white/10 px-2 py-1 text-[9.5px] font-semibold text-white ring-1 ring-white/15">
          Print
        </button>
      </div>
    </div>
  );
}