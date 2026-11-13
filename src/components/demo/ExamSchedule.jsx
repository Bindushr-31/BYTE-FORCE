import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { setExamTime } from "@/lib/server-fns-exams";
import { CalendarClock, Loader2 } from "lucide-react";

/** Controller-only: set the exam schedule used by the exam-day scenario. */
export default function ExamSchedule() {
  const save = useServerFn(setExamTime);
  const [students, setStudents] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    base44.entities.Student
      .list({ limit: 12 })
      .then((res) => {
        if (alive) setStudents(res?.items ?? res ?? []);
      })
      .catch(() => alive && setStudents([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function apply(student) {
    const value = drafts[student.id] ?? student.exam_time ?? "";
    if (!value) {
      toast.error("Pick an exam time first.");
      return;
    }
    setBusy(student.id);
    const res = await save({ data: { id: student.id, exam_time: value, exam_subject: student.exam_subject || "" } });
    setBusy(null);
    if (!res?.ok) {
      toast.error(res?.error || "Could not save the exam time.");
      return;
    }
    setStudents((prev) => prev.map((s) => (s.id === student.id ? { ...s, exam_time: res.student.exam_time } : s)));
    toast.success(`Exam time set for ${student.name}`);
  }

  return (
    <div className="er-card mt-3 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <div className="text-[13px] font-semibold text-brand-navy">Exam schedule</div>
      </div>
      <p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">
        The exam-day scenario prioritises students whose exam starts within two hours. Set a time here so the ranking
        has real input — capacity, fares and routes stay under application control.
      </p>

      {loading ? (
        <div className="grid h-16 place-items-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : students.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground">No student records yet.</p>
      ) : (
        <div className="space-y-1.5">
          {students.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 px-2.5 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-semibold text-brand-navy">{s.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {s.village_code || "—"} · {s.pass_code || "no pass"} · {s.exam_subject || "no subject"}
                </div>
              </div>
              <input
                type="time"
                value={drafts[s.id] ?? s.exam_time ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                className="rounded-lg border border-border bg-white px-2 py-1 text-[11.5px] outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => apply(s)}
                disabled={busy === s.id}
                className="rounded-lg bg-primary px-2.5 py-1 text-[10.5px] font-bold text-white disabled:opacity-60"
              >
                {busy === s.id ? "Saving…" : "Save"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}