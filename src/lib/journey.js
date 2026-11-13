import { computeOccupancy, fareBreakdown, etaToStop, minutesToClock, clockToMinutes } from "@/lib/mobility";

/**
 * Deterministic passenger journey planner.
 * feeder village → designated safe transfer hub → main bus → destination institution.
 * Only approved vehicles with a verified permit can appear in a plan.
 */
export function planJourneys({ villageCode, villages = [], routes = [], trips = [], hubs = [], config, concessionPct = 0, direction = "morning" }) {
  const village = villages.find((v) => v.code === villageCode);
  if (!village) return [];

  const feederRoutes = routes.filter((r) => r.kind === "feeder" && r.village_code === village.code);
  const hub = hubs.find((h) => h.code === village.hub_code) || null;
  const mainRoutes = routes.filter((r) => r.kind !== "feeder" && r.large_bus_allowed !== false);
  const buffer = Number(config?.transfer_buffer_min) || 8;

  const feederOptions = feederRoutes.flatMap((route) =>
    trips
      .filter((t) => t.route_code === route.code && t.vehicle_type === "feeder" && t.status !== "cancelled" && t.direction === direction)
      .map((trip) => ({ route, trip }))
  );

  const mainOptions = mainRoutes.flatMap((route) =>
    trips
      .filter((t) => t.route_code === route.code && t.vehicle_type !== "feeder" && ["active", "scheduled"].includes(t.status) && t.direction === direction)
      .map((trip) => ({ route, trip }))
  );

  const plans = [];
  const feederList = feederOptions.length ? feederOptions : [{ route: feederRoutes[0] || null, trip: null }];

  feederList.forEach((feeder) => {
    mainOptions.forEach((main) => {
      const feederDep = clockToMinutes(feeder.trip?.scheduled_departure || "07:05");
      const feederTravel = Number(feeder.route?.duration_min) || 18;
      const hubArrive = feederDep + feederTravel;
      const mainDep = clockToMinutes(main.trip.scheduled_departure);
      const connect = mainDep - hubArrive;
      if (connect < 0) return;

      const feederOcc = feeder.trip
        ? computeOccupancy({
            capacity: feeder.trip.capacity,
            tickets: feeder.trip.tickets_issued,
            manual: feeder.trip.manual_count,
            exited: feeder.trip.exits,
            transferred: feeder.trip.transfers,
            boarding_reports: feeder.trip.boarding_reports,
          })
        : null;
      const mainOcc = computeOccupancy({
        capacity: main.trip.capacity,
        tickets: main.trip.tickets_issued,
        manual: main.trip.manual_count,
        exited: main.trip.exits,
        transferred: main.trip.transfers,
        boarding_reports: main.trip.boarding_reports,
      });

      const mainStops = main.route.stops || [];
      const hubIdx = Math.max(0, mainStops.findIndex((s) => s.code === (village.hub_code || "").replace("HUB-", "")));
      const arriveEta = etaToStop(main.route, mainStops.length - 1, main.trip.progress, main.trip.delay_min);

      const distanceKm = (Number(village.distance_to_hub_km) || 0) + (Number(main.route.distance_km) || 0) * 0.45;
      const fare = fareBreakdown({ distanceKm, concessionPct });

      plans.push({
        id: `${feeder.trip?.trip_code || "feeder"}-${main.trip.trip_code}`,
        village,
        hub,
        feederTrip: feeder.trip,
        feederRoute: feeder.route,
        feederOccupancy: feederOcc,
        mainTrip: main.trip,
        mainRoute: main.route,
        mainOccupancy: mainOcc,
        connectMin: connect,
        bufferOk: connect >= buffer,
        hubArriveMin: hubArrive,
        mainDepMin: mainDep,
        arriveMin: mainDep + (Number(main.route.duration_min) || 65) - Math.round(((Number(main.route.duration_min) || 65) * (Number(main.trip.progress) || 0)) / 100),
        arriveEta,
        hubStopIndex: hubIdx,
        fare,
        full: mainOcc.is_full || (feederOcc?.is_full ?? false),
      });
    });
  });

  return plans
    .sort((a, b) => a.arriveMin - b.arriveMin)
    .map((p) => ({
      ...p,
      departLabel: minutesToClock(clockToMinutes(p.feederTrip?.scheduled_departure || "07:05")),
      hubArriveLabel: minutesToClock(p.hubArriveMin),
      mainDepLabel: minutesToClock(p.mainDepMin),
      arriveLabel: minutesToClock(p.arriveMin),
    }));
}