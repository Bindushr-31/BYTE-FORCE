import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * Shared operational data store.
 * Loads in small sequential waves (never 15 requests at once), keeps a short
 * cache so moving between screens does not re-fetch reference data, and lets
 * every mounted screen refresh from one place after an action.
 */
const CORE = [
  ["Trip", { sort: "scheduled_departure", limit: 120 }],
  ["BusRoute", { sort: "code", limit: 60 }],
  ["Village", { sort: "name", limit: 60 }],
  ["BusStop", { sort: "name", limit: 80 }],
  ["TransferHub", { sort: "name", limit: 20 }],
  ["SystemConfig", { limit: 1 }],
  ["Notification", { sort: "-created_date", limit: 40 }],
  ["Incident", { sort: "-created_date", limit: 40 }],
  ["VehicleAssignment", { sort: "-created_date", limit: 40 }],
  ["GovBus", { limit: 20 }],
  ["PrivateBus", { limit: 20 }],
  ["FeederVehicle", { limit: 20 }],
  ["StudentPass", { limit: 60 }],
  ["Permit", { limit: 40 }],
  ["Volunteer", { limit: 20 }],
];

const VOLATILE = ["Trip", "Notification", "Incident", "VehicleAssignment", "FeederVehicle"];
const LIVE_ENTITIES = ["Trip", "VehicleAssignment", "Notification", "Incident", "FeederVehicle"];

const KEY = {
  Trip: "trips",
  BusRoute: "routes",
  Village: "villages",
  BusStop: "stops",
  TransferHub: "hubs",
  SystemConfig: "configs",
  Notification: "notifications",
  Incident: "incidents",
  VehicleAssignment: "assignments",
  GovBus: "govBuses",
  PrivateBus: "privateBuses",
  FeederVehicle: "feeders",
  StudentPass: "passes",
  Permit: "permits",
  Volunteer: "volunteers",
};

const TTL = 60000;
let cache = null;
let cachedAt = 0;
let inFlight = null;
const listeners = new Set();

async function fetchEntities(entries) {
  const out = {};
  for (let i = 0; i < entries.length; i += 3) {
    const wave = entries.slice(i, i + 3);
    const results = await Promise.all(
      wave.map(([name, opts]) =>
        base44.entities[name]
          .list(opts)
          .then((res) => [KEY[name], res?.items ?? res ?? []])
          .catch(() => [KEY[name], []])
      )
    );
    results.forEach(([key, items]) => {
      out[key] = items;
    });
  }
  return out;
}

function publish() {
  listeners.forEach((listener) => listener(cache));
}

export async function loadOps({ force = false, light = false } = {}) {
  if (!light && !force && cache && Date.now() - cachedAt < TTL) return cache;
  if (inFlight) return inFlight;

  const entries = light
    ? CORE.filter(([name]) => VOLATILE.includes(name))
    : CORE;

  inFlight = fetchEntities(entries)
    .then((data) => {
      cache = { ...(cache || {}), ...data };
      cache.config = cache.configs?.[0] || null;
      cachedAt = Date.now();
      inFlight = null;
      publish();
      return cache;
    })
    .catch((error) => {
      inFlight = null;
      throw error;
    });

  return inFlight;
}

export function useOpsData() {
  const [state, setState] = useState(() =>
    cache ? { loading: false, error: null, ...cache } : { loading: true, error: null }
  );

  useEffect(() => {
    let alive = true;
    const onData = (next) => {
      if (alive && next) setState({ loading: false, error: null, ...next });
    };
    listeners.add(onData);
    if (cache && Date.now() - cachedAt < TTL) {
      setState({ loading: false, error: null, ...cache });
    } else {
      loadOps().catch((error) => {
        if (alive) setState((prev) => ({ ...prev, loading: false, error: error?.message || "Could not load operational data." }));
      });
    }

    // Live updates: every portal reads the same entities, so one subscription
    // here refreshes the controller dashboard, driver portal, passenger portal
    // and map together. Polling is the fallback when subscriptions are unavailable.
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (alive) loadOps({ light: true }).catch(() => null);
      }, 700);
    };
    const unsubs = [];
    LIVE_ENTITIES.forEach((name) => {
      try {
        const off = base44.entities[name]?.subscribe?.(() => refresh());
        if (typeof off === "function") unsubs.push(off);
      } catch {
        /* entity unavailable to this role — polling covers it */
      }
    });
    const interval = unsubs.length
      ? null
      : setInterval(() => {
          if (document.visibilityState === "visible") refresh();
        }, 8000);

    const onWake = () => refresh();
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      alive = false;
      listeners.delete(onData);
      clearTimeout(timer);
      if (interval) clearInterval(interval);
      unsubs.forEach((off) => off());
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  const reload = useCallback(() => loadOps({ light: true }).catch(() => null), []);

  return { ...state, reload };
}

export function activeTrips(trips = []) {
  return trips.filter((t) => t.status === "active");
}

export function byRegistration(list = [], registration) {
  return list.find((v) => v.registration === registration) || null;
}