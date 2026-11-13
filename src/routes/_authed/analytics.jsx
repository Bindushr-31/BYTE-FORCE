import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAnalytics } from "@/lib/server-fns";
import PageHeader from "@/components/er/PageHeader";
import StatTile from "@/components/er/StatTile";
import { Loader2, Users, TrendingUp, MapPinned, Ticket } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authed/analytics")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Analytics" }] }),
  component: AnalyticsPage,
});

const PIE_COLORS = ["#1D4ED8", "#7C3AED", "#0F766E"];

function AnalyticsPage() {
  const fetchAnalytics = useServerFn(getAnalytics);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchAnalytics({}).then((res) => setData(res)).catch(() => setData({ ok: false }));
  }, [fetchAnalytics]);

  if (!data) return <div className="grid h-72 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (!data.ok) return <div className="er-card p-6 text-[13px] text-muted-foreground">Analytics could not be loaded.</div>;

  const contribution = [
    { name: "Government", value: data.contribution.government || 0 },
    { name: "Private", value: data.contribution.private || 0 },
    { name: "Feeder", value: data.contribution.feeder || 0 },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="Demand, utilisation and settlement"
        description="Computed from stored trips, tickets and concession records. Every figure below is reproducible from the data — simulated demo data."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Unboarded students" value={data.unboarded} hint="left at stops across all trips" icon={Users} tone="rose" />
        <StatTile label="Open incidents" value={data.incidents.open} hint={`${data.incidents.total} recorded in total`} tone="amber" />
        <StatTile label="Concession transactions" value={data.concession.count} hint={`₹${data.concession.total} logged for settlement`} icon={Ticket} tone="teal" />
        <StatTile label="Active passes" value={data.concession.passes} hint="valid mobility passes" icon={TrendingUp} tone="blue" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="er-card p-4">
          <div className="er-label">Route demand · estimated onboard vs capacity</div>
          <div className="mt-3 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byRoute} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="route_code" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={44} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                <Bar dataKey="onboard" name="Onboard" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="capacity" name="Capacity" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="er-card p-4">
          <div className="er-label">Peak demand by departure hour</div>
          <div className="mt-3 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.peak} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="peakFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
                <Area type="monotone" dataKey="onboard" name="Students moving" stroke="#0F766E" strokeWidth={2} fill="url(#peakFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="er-card p-4">
          <div className="er-label">Who carries the students · tickets by vehicle type</div>
          <div className="mt-2 h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={contribution} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={3}>
                  {contribution.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="er-card p-4">
          <div className="flex items-center gap-1.5">
            <MapPinned className="h-4 w-4 text-amber-600" />
            <div className="er-label">Poorly connected villages</div>
          </div>
          <div className="mt-2 space-y-1.5">
            {data.poorlyConnected.length === 0 ? (
              <p className="text-[11.5px] text-muted-foreground">Every village on the corridor has a feasible feeder.</p>
            ) : (
              data.poorlyConnected.map((v) => (
                <div key={v.code} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5">
                  <div>
                    <div className="text-[11.5px] font-semibold text-brand-navy">{v.name}</div>
                    <div className="text-[10px] text-amber-800">road {v.road_type} · large bus restricted</div>
                  </div>
                  <div className="text-[12px] font-bold text-amber-800">{v.students}</div>
                </div>
              ))
            )}
          </div>
          <div className="mt-3 border-t border-border/70 pt-2">
            <div className="er-label mb-1.5">Incidents by stage</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.incidents.byStatus || {}).map(([status, count]) => (
                <span key={status} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {status}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 er-card overflow-x-auto">
        <div className="border-b border-border/70 bg-muted/40 px-4 py-2.5">
          <div className="er-label">Route utilisation</div>
        </div>
        <table className="w-full min-w-[520px] text-left text-[11.5px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Route</th>
              <th className="px-4 py-2 font-semibold">Trips</th>
              <th className="px-4 py-2 font-semibold">Onboard</th>
              <th className="px-4 py-2 font-semibold">Capacity</th>
              <th className="px-4 py-2 font-semibold">Utilisation</th>
              <th className="px-4 py-2 font-semibold">Unboarded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.byRoute.map((r) => (
              <tr key={r.route_code}>
                <td className="px-4 py-2 font-semibold text-brand-navy">{data.routes.find((x) => x.code === r.route_code)?.name || r.route_code}</td>
                <td className="px-4 py-2">{r.trips}</td>
                <td className="px-4 py-2">{r.onboard}</td>
                <td className="px-4 py-2">{r.capacity}</td>
                <td className="px-4 py-2">{r.capacity ? Math.round((r.onboard / r.capacity) * 100) : 0}%</td>
                <td className="px-4 py-2">{r.unboarded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}