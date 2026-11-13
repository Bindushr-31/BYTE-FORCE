import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-middleware";

/**
 * Conductor / controller updates (announcements). One record in the shared
 * Notification entity, linked to its bus, route, trip and stops; every portal
 * reads the same rows and filters them by what affects that passenger.
 */

const nowIso = () => new Date().toISOString();
const listOf = (res) => res?.items ?? res ?? [];

export const UPDATE_CATEGORIES = [
  "Bus Delay",
  "Bus Cancellation",
  "Route Change",
  "Road Blockage",
  "Bus Replacement",
  "Schedule Change",
  "Feeder Vehicle Update",
  "General Announcement",
];

export const UPDATE_PRIORITIES = ["normal", "important", "urgent"];
const LEVEL = { normal: "info", important: "warning", urgent: "critical" };

export const publishUpdate = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const title = String(data?.title || "").trim().slice(0, 120);
    const message = String(data?.message || "").trim().slice(0, 700);
    if (!title || !message) return { ok: false, error: "A title and a message are required." };

    const vehicle = String(data?.vehicle_registration || "").trim();
    const routeCode = String(data?.route_code || "").trim();
    const tripCode = String(data?.trip_code || "").trim();
    if (!vehicle && !routeCode) return { ok: false, error: "Choose the affected bus or route." };

    // A conductor may only publish for their own assigned vehicle; the
    // controller may publish for any route.
    const isController = context.user?.role === "admin";
    if (!isController) {
      const mine = listOf(
        await sdk.entities.Trip.filter({ vehicle_registration: vehicle }, { limit: 10 })
      ).filter((t) => t.status === "active");
      const ownBus = mine.some(
        (t) => String(t.driver_name || "").toLowerCase() === String(context.user?.full_name || "").toLowerCase()
      );
      if (!vehicle || !ownBus) {
        return { ok: false, error: "You can only publish updates for your own assigned bus." };
      }
    }

    const category = UPDATE_CATEGORIES.includes(data?.category) ? data.category : "General Announcement";
    const priority = UPDATE_PRIORITIES.includes(data?.priority) ? data.priority : "normal";
    const stopCodes = Array.isArray(data?.stop_codes)
      ? data.stop_codes.filter((c) => typeof c === "string" && c.trim()).slice(0, 20)
      : [];

    const update = await sdk.asServiceRole.entities.Notification.create({
      title,
      message,
      category,
      priority,
      audience: "all",
      level: LEVEL[priority],
      route_code: routeCode,
      trip_code: tripCode,
      vehicle_registration: vehicle,
      stop_codes: stopCodes,
      valid_from: data?.valid_from ? String(data.valid_from) : nowIso(),
      expires_at: data?.expires_at ? String(data.expires_at) : "",
      published_by: context.user?.full_name || "Conductor",
      published_role: isController ? "controller" : "conductor",
      requires_ack: priority === "urgent",
    });

    return { ok: true, update };
  });

/** Records that this passenger has seen an update; it stays in their history. */
export const markUpdateRead = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ data, context }) => {
    const sdk = context.getBase44();
    const email = context.user?.email;
    const notificationId = String(data?.notification_id || "");
    if (!email || !notificationId) return { ok: false, error: "Nothing to mark." };

    const existing = listOf(
      await sdk.entities.AnnouncementRead.filter(
        { notification_id: notificationId, user_email: email },
        { limit: 1 }
      )
    )[0];

    if (!existing) {
      await sdk.entities.AnnouncementRead.create({
        notification_id: notificationId,
        user_email: email,
        read_at: nowIso(),
        dismissed: true,
      });
    }
    return { ok: true };
  });