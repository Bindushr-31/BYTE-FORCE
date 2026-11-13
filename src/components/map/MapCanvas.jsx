import { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { computeOccupancy, timeAgo, levelClasses, levelLabel } from "@/lib/mobility";

/**
 * A map that was hidden (a collapsed section, a background tab) measures 0×0
 * and renders grey tiles. Leaflet must be told to re-measure when the container
 * becomes visible — never replaced with a static image.
 */
function MapLifecycle() {
  const map = useMap();

  useEffect(() => {
    const fix = () => map.invalidateSize();
    const raf = requestAnimationFrame(fix);
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && fix()),
      { threshold: 0.05 }
    );
    observer.observe(map.getContainer());
    window.addEventListener("resize", fix);
    document.addEventListener("visibilitychange", fix);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", fix);
      document.removeEventListener("visibilitychange", fix);
    };
  }, [map]);

  return null;
}

const ROUTE_STYLE = {
  main: { color: "#1D4ED8", weight: 6, opacity: 0.95 },
  secondary: { color: "#0F766E", weight: 3.4, opacity: 0.85 },
  feeder: { color: "#10B981", weight: 2.2, opacity: 0.9, dashArray: "6 7" },
};

function vehicleSvg(type) {
  if (type === "feeder") {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F766E" stroke-width="2.1" stroke-linecap="round"><path d="M3 15V8a2 2 0 0 1 2-2h9l4 4v5"/><path d="M3 15h15"/><circle cx="7" cy="17.5" r="1.4"/><circle cx="16" cy="17.5" r="1.4"/></svg>`;
  }
  const color = type === "government" ? "#1D4ED8" : "#7C3AED";
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round"><rect x="4" y="3.5" width="16" height="13" rx="3"/><path d="M4 11h16"/><circle cx="8.5" cy="18.6" r="1.4"/><circle cx="15.5" cy="18.6" r="1.4"/></svg>`;
}

function vehicleIcon(type, level) {
  const ring = level === "full" ? "#E11D48" : level === "warning" ? "#F59E0B" : "#10B981";
  return L.divIcon({
    className: "er-vehicle-marker",
    html: `<div style="display:grid;place-items:center;width:30px;height:30px;border-radius:9999px;background:#fff;border:2px solid ${ring};box-shadow:0 8px 18px -8px rgba(10,22,71,.6)">${vehicleSvg(type)}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function hubIcon() {
  return L.divIcon({
    className: "er-vehicle-marker",
    html: `<div style="display:grid;place-items:center;width:18px;height:18px;border-radius:6px;background:#0A1647;border:2px solid #22D3EE"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function stopIcon(highlight) {
  return L.divIcon({
    className: "er-vehicle-marker",
    html: `<div style="width:${highlight ? 12 : 9}px;height:${highlight ? 12 : 9}px;border-radius:9999px;background:${highlight ? "#34D399" : "#ffffff"};border:2px solid #0A1647"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export default function MapCanvas({ routes = [], trips = [], hubs = [], stops = [], villages = [], height = 460, selectedRouteCodes = [] }) {
  const active = trips.filter((t) => t.status === "active");

  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-border" style={{ height }}>
      <MapContainer center={[12.72, 74.9]} zoom={10} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <MapLifecycle />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {routes.map((route) => {
          const pts = (route.stops || []).map((s) => [s.lat, s.lng]);
          if (pts.length < 2) return null;
          const blocked = route.status === "disrupted";
          const base = ROUTE_STYLE[route.kind] || ROUTE_STYLE.secondary;
          const style = blocked
            ? { color: "#DC2626", weight: 5.5, opacity: 1, dashArray: "12 9" }
            : base;
          const dimmed = selectedRouteCodes.length > 0 && !selectedRouteCodes.includes(route.code);
          return (
            <Polyline
              key={route.code}
              positions={pts}
              pathOptions={{ ...style, opacity: dimmed ? 0.22 : style.opacity }}
            >
              <Tooltip sticky>
                {route.name}
                {blocked ? " · blocked — use the approved alternative" : ""}
              </Tooltip>
            </Polyline>
          );
        })}

        {hubs.map((hub) => (
          <Marker key={hub.code} position={[hub.lat, hub.lng]} icon={hubIcon()}>
            <Popup>
              <strong>{hub.name}</strong>
              <br />
              Transfer hub · {hub.platforms} platforms
              <br />
              {hub.daily_transfers} daily transfers
            </Popup>
            <Tooltip direction="top" offset={[0, -10]}>{hub.name}</Tooltip>
          </Marker>
        ))}

        {stops
          .filter((s) => s.kind !== "hub")
          .map((stop) => (
            <Marker key={stop.code} position={[stop.lat, stop.lng]} icon={stopIcon(stop.kind === "college")}>
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                {stop.kind === "college" ? "Destination institution" : `Stop · ${stop.students_waiting || 0} students waiting`}
              </Popup>
              <Tooltip direction="top" offset={[0, -8]}>{stop.name}</Tooltip>
            </Marker>
          ))}

        {villages.map((v) => (
          <Marker key={v.code} position={[v.lat, v.lng]} icon={stopIcon(false)}>
            <Popup>
              <strong>{v.name}</strong>
              <br />
              {v.students_count} students · road {v.road_type}
              <br />
              {v.large_bus_allowed ? "Large bus permitted" : "Large bus restricted — feeder only"}
            </Popup>
            <Tooltip direction="top" offset={[0, -8]}>{v.name}</Tooltip>
          </Marker>
        ))}

        {active.map((trip) => {
          if (!trip.lat || !trip.lng) return null;
          const occ = computeOccupancy({
            capacity: trip.capacity,
            tickets: trip.tickets_issued,
            manual: trip.manual_count,
            exited: trip.exits,
            transferred: trip.transfers,
            boarding_reports: trip.boarding_reports,
          });
          return (
            <Marker key={trip.trip_code} position={[trip.lat, trip.lng]} icon={vehicleIcon(trip.vehicle_type, occ.level)}>
              <Popup>
                <div className="min-w-[200px]">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <strong className="font-mono text-[12px]">{trip.vehicle_registration}</strong>
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "#F1F5F9" }}>
                      {trip.vehicle_type === "government" ? "Gov bus" : trip.vehicle_type === "private" ? "Private bus" : "Feeder van"}
                    </span>
                  </div>
                  <div className="text-[11px] leading-relaxed text-slate-600">
                    Trip: {trip.trip_code} · {trip.status}
                    <br />
                    Route: {trip.route_name || trip.route_code}
                    <br />
                    Destination: {trip.destination || "Sahyadri College"}
                    <br />
                    Onboard: {occ.estimated} of {occ.capacity} ({occ.pct}%)
                    <br />
                    Status: <strong>{levelLabel(occ.level)}</strong> · {occ.seats_free} seats free
                    <br />
                    Delay: {trip.delay_min || 0} min
                    <br />
                    Last GPS: {timeAgo(trip.last_gps_at)}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "#FEF3C7", color: "#92400E" }}>
                    Simulated GPS
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-xl border border-border/70 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="mb-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Legend</div>
        <div className="space-y-1 text-[10px] text-slate-600">
          <div className="flex items-center gap-1.5"><span className="h-[3px] w-6 rounded bg-[#1D4ED8]" /> NH66 main highway</div>
          <div className="flex items-center gap-1.5"><span className="h-[3px] w-6 rounded bg-[#0F766E]" /> Secondary road</div>
          <div className="flex items-center gap-1.5"><span className="h-[2px] w-6 rounded border-t-2 border-dashed border-[#10B981]" /> Feeder / village road</div>
          <div className="flex items-center gap-1.5"><span className="h-[3px] w-6 rounded border-t-2 border-dashed border-[#DC2626]" /> Blocked road / flooded</div>
          <div className="mt-1 flex items-center gap-2 border-t border-border/60 pt-1">
            <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-emerald-500 bg-white text-[7px]">🚌</span> Gov
            <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-violet-500 bg-white text-[7px]">🚌</span> Pvt
            <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-teal-600 bg-white text-[7px]">🚐</span> Van
          </div>
        </div>
      </div>
    </div>
  );
}