import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import AppShell from "@/components/AppShell";
import { useRole } from "@/lib/useRole";
import { canAccessRoute, homeForRole, ROLE_LABEL } from "@/lib/roles";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: requireSignedIn,
  errorComponent: AuthGateError,
  component: GuardedLayout,
});

/**
 * Role guard for every signed-in screen. A passenger who types a controller URL
 * is sent back to their own home instead of seeing the page.
 */
function GuardedLayout() {
  const role = useRole();
  const { isLoadingAuth } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const allowed = canAccessRoute(pathname, role);

  useEffect(() => {
    if (!allowed) navigate({ to: homeForRole(role), replace: true });
  }, [allowed, role, navigate]);

  // Never render a page before the session role is known.
  if (isLoadingAuth) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="er-card max-w-sm p-6 text-center">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-600/15">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <h1 className="mt-3 text-[17px] font-extrabold text-brand-navy">Restricted area</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            This screen is only available to the {ROLE_LABEL.admin} role. You are signed in as{" "}
            {ROLE_LABEL[role] || "a passenger"}, so there is nothing to change here.
          </p>
          <button
            onClick={() => navigate({ to: homeForRole(role), replace: true })}
            className="mt-4 w-full rounded-xl bg-primary py-2.5 text-[12px] font-bold text-white"
          >
            Go to my home screen
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}