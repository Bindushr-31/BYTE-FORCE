import { createFileRoute } from "@tanstack/react-router";
import { useRole } from "@/lib/useRole";
import { useOpsData } from "@/lib/useOps";
import AdminHome from "@/components/home/AdminHome";
import StudentHome from "@/components/home/StudentHome";
import CrewHome from "@/components/home/CrewHome";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authed/")({
  ssr: false,
  head: () => ({ meta: [{ title: "EASY RIDE · Control centre" }] }),
  component: HomePage,
});

function HomePage() {
  const role = useRole();
  const data = useOpsData();

  if (data.loading) {
    return (
      <div className="grid h-72 place-items-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
          <p className="mt-2 text-[11.5px] text-muted-foreground">Loading corridor data…</p>
        </div>
      </div>
    );
  }
  if (data.error) {
    return <div className="er-card p-6 text-[12.5px] text-muted-foreground">{data.error}</div>;
  }

  if (role === "passenger") return <StudentHome data={data} />;
  if (role === "admin") return <AdminHome data={data} />;
  return <CrewHome role={role} />;
}