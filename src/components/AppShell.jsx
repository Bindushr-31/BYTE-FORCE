import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRole, setActiveRole } from "@/lib/useRole";
import { ROLES, ROLE_LABEL, navForRole } from "@/lib/roles";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Map, Route, BadgeCheck, Ticket, BusFront, Truck,
  HandHeart, TriangleAlert, Shuffle, BarChart3, Sparkles, Bell,
  Settings2, FlaskConical, LogOut, ChevronDown, Radio, Megaphone,
} from "lucide-react";

const ICON_MAP = {
  LayoutDashboard, Map, Route, BadgeCheck, Ticket, BusFront, Truck,
  HandHeart, TriangleAlert, Shuffle, BarChart3, Sparkles, Bell,
  Settings2, FlaskConical, Megaphone,
};

function NavIcon({ name, className }) {
  const Icon = ICON_MAP[name] || LayoutDashboard;
  return <Icon className={className} strokeWidth={1.9} />;
}

export function RoleSelect({ compact = false }) {
  const role = useRole();
  const { user } = useAuth();

  // Only staff accounts may preview portals; a passenger sees a fixed label.
  if (user && user.role !== "admin") {
    return (
      <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-[12.5px] font-semibold text-slate-600">
        {ROLE_LABEL[role] || "Student"} · view only
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        aria-label="Viewing as"
        value={role}
        onChange={(e) => setActiveRole(e.target.value)}
        className={cn(
          "w-full cursor-pointer appearance-none rounded-xl border border-border bg-white py-2 pl-3 pr-8 text-[12.5px] font-semibold text-brand-navy shadow-sm outline-none transition hover:border-primary/40 focus:ring-2 focus:ring-primary/20",
          compact ? "max-w-[168px]" : ""
        )}
      >
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label} · {r.subtitle}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function NavList({ items, pathname, onNavigate }) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition",
              active
                ? "bg-primary/8 text-primary shadow-[inset_0_0_0_1px_rgba(29,78,216,0.14)]"
                : "text-slate-600 hover:bg-muted hover:text-brand-navy"
            )}
          >
            <NavIcon name={item.icon} className={cn("h-[17px] w-[17px]", active ? "text-primary" : "text-slate-400 group-hover:text-brand-navy")} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const role = useRole();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navForRole(role);
  const primaryItems = items.filter((i) => i.primary).slice(0, 4);
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="mx-auto flex w-full max-w-[1480px]">
        <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col border-r border-border/70 bg-white/85 px-3 py-5 backdrop-blur print:hidden lg:flex">
          <Link to="/" className="px-1.5">
            <Logo size={38} withWordmark />
          </Link>
          <div className="mt-6 px-1.5">
            <div className="er-label mb-1.5">Viewing as</div>
            <RoleSelect />
          </div>
          <nav className="mt-5 flex-1 overflow-y-auto pr-0.5">
            <NavList items={items} pathname={pathname} />
          </nav>
          <div className="mt-3 rounded-xl border border-border/80 bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-navy text-[11px] font-bold text-white">
                {(user?.full_name || user?.email || "E").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold leading-tight">{user?.full_name || "Demo operator"}</div>
                <div className="truncate text-[10.5px] text-muted-foreground">{user?.email || "demo@easyride.in"}</div>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white py-1.5 text-[11.5px] font-semibold text-slate-600 transition hover:border-destructive/40 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-8">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md print:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2.5 lg:hidden">
                <Logo size={32} />
                <div className="font-display text-[13px] font-extrabold tracking-[0.16em] text-brand-navy">EASY RIDE</div>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-emerald-700 ring-1 ring-emerald-600/15">
                  <Radio className="h-3 w-3" /> Live coordination
                </span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold text-amber-700 ring-1 ring-amber-500/20">
                  Simulated demo data
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="lg:hidden">
                  <RoleSelect compact />
                </div>
                <Link
                  to="/notifications"
                  className="relative grid h-9 w-9 place-items-center rounded-xl border border-border bg-white text-slate-500 transition hover:text-primary"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
                </Link>
                <button
                  onClick={() => setMobileNav((v) => !v)}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-white text-slate-500 lg:hidden"
                  aria-label="Menu"
                >
                  <ChevronDown className={cn("h-4 w-4 transition", mobileNav && "rotate-180")} />
                </button>
              </div>
            </div>
            {mobileNav && (
              <div className="border-t border-border/70 bg-white px-3 py-3 lg:hidden">
                <NavList items={items} pathname={pathname} onNavigate={() => setMobileNav(false)} />
              </div>
            )}
          </header>

          <div className="px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-1.5">
          {primaryItems.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition",
                  active ? "text-primary" : "text-slate-400"
                )}
              >
                <NavIcon name={item.icon} className="h-[19px] w-[19px]" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}