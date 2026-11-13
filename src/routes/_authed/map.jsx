import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useOpsData } from "@/lib/useOps";
import PageHeader from "@/components/er/PageHeader";
import OccupancyMeter from "@/components/er/OccupancyMeter";
import { Radio, Loader2 } from "lucide-react";

const MapCanvas = lazy(() => import("@/components/map/MapCanvas"));

export const Route = createFileRoute("/_authed/map")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Fleet map" }] }),
  component: MapPage,
});

function MapPage() {
  const { loading, trips = [], routes = [], hubs = [], stops = [], villages = [] } = useOpsData();
  const active = trips.filter((t) => t.status === "active");

  return (
    <div>
      <PageHeader
        eyebrow="Live network"
        title="Fleet map"
        description="Government and private buses on NH66, feeder vans through the villages and every designated transfer hub. Positions are simulated demo data."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-600/15">
            <Radio className="h-3.5 w-3.5" /> {active.length} vehicles reporting
          </span>
        }
      />

      {loading ? (
        <div className="grid h-[420px] place-items-center rounded-2xl border border-border bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <ClientOnly fallback={<div className="h-[460px] rounded-2xl bg-muted" />}>
          <Suspense fallback={<div className="grid h-[460px] place-items-center rounded-2xl border border-border bg-white"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
            <MapCanvas routes={routes} trips={trips} hubs={hubs} stops={stops} villages={villages} height={480} />
          </Suspense>
        </ClientOnly>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((trip) => (
          <div key={trip.trip_code} className="er-card p-3.5">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[12px] font-semibold text-brand-navy">{trip.vehicle_registration}</div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {trip.vehicle_type === "feeder" ? "Feeder van" : trip.vehicle_type === "private" ? "Private bus" : "Gov bus"}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{trip.route_name || trip.route_code}</div>
            <div className="mt-2"><OccupancyMeter trip={trip} compact /></div>
          </div>
        ))}
      </div>
    </div>
  );
}