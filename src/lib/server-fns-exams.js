import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/auth-middleware";

/**
 * Exam times feed the exam-day scenario (students whose exam starts within
 * the next two hours are prioritised for replacement capacity).
 * Only the controller may set them.
 */
export const setExamTime = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const id = String(data?.id || "");
    const raw = String(data?.exam_time || "").trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return { ok: false, error: "Use a 24-hour time, for example 13:45." };
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return { ok: false, error: "That is not a valid time of day." };

    const exam_time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const exam_subject = String(data?.exam_subject || "").slice(0, 60);

    const student = await sdk.entities.Student.get(id).catch(() => null);
    if (!student) return { ok: false, error: "Student record not found." };

    await sdk.entities.Student.update(id, { exam_time, exam_subject });
    return { ok: true, student: { ...student, exam_time, exam_subject } };
  });