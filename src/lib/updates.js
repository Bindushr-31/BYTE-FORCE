/** Shared rules for conductor updates / announcements. */

export const PRIORITY_STYLES = {
  urgent: { chip: "bg-rose-50 text-rose-700 ring-rose-600/20", ring: "ring-rose-300", label: "Urgent", dot: "bg-rose-500" },
  important: { chip: "bg-amber-50 text-amber-700 ring-amber-600/20", ring: "ring-amber-300", label: "Important", dot: "bg-amber-500" },
  normal: { chip: "bg-slate-100 text-slate-600 ring-slate-400/20", ring: "ring-border", label: "Normal", dot: "bg-slate-400" },
};

export function priorityOf(update) {
  if (update?.priority) return update.priority;
  if (update?.level === "critical") return "urgent";
  if (update?.level === "warning") return "important";
  return "normal";
}

/** Expired or not-yet-valid updates stop popping up but stay in history. */
export function isLive(update, now = Date.now()) {
  const end = update?.expires_at ? new Date(update.expires_at).getTime() : null;
  if (end && Number.isFinite(end) && end < now) return false;
  const start = update?.valid_from ? new Date(update.valid_from).getTime() : null;
  if (start && Number.isFinite(start) && start > now) return false;
  return true;
}

export function priorityOrder(update) {
  const order = { urgent: 0, important: 1, normal: 2 };
  return order[priorityOf(update)] ?? 3;
}

/** A passenger sees only updates matching their route, bus, journey or stops. */
export function relevantToPassenger(update, context = {}) {
  if (!["passenger", "all"].includes(update?.audience || "all")) return false;
  const { routeCodes = [], tripCodes = [], vehicles = [], stopCodes = [] } = context;
  const targeted =
    update?.route_code ||
    update?.trip_code ||
    update?.vehicle_registration ||
    (update?.stop_codes || []).length;
  if (!targeted) return true;
  if (update.route_code && routeCodes.includes(update.route_code)) return true;
  if (update.trip_code && tripCodes.includes(update.trip_code)) return true;
  if (update.vehicle_registration && vehicles.includes(update.vehicle_registration)) return true;
  if ((update.stop_codes || []).some((code) => stopCodes.includes(code))) return true;
  return false;
}

export function sortUpdates(list = []) {
  return [...list].sort((a, b) => {
    const byPriority = priorityOrder(a) - priorityOrder(b);
    if (byPriority !== 0) return byPriority;
    return String(b.created_date || "").localeCompare(String(a.created_date || ""));
  });
}