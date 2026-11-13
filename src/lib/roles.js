export const ROLES = [
  { id: "admin", label: "Admin", subtitle: "Control center", short: "Admin" },
  { id: "passenger", label: "Student", subtitle: "Passenger", short: "Student" },
  { id: "gov_driver", label: "Gov. bus driver", subtitle: "KSRTC", short: "Gov bus" },
  { id: "private_driver", label: "Private bus driver", subtitle: "Operator bus", short: "Pvt bus" },
  { id: "operator", label: "Van operator", subtitle: "Authorized feeder", short: "Operator" },
  { id: "volunteer", label: "Volunteer", subtitle: "Village network", short: "Volunteer" },
];

export const ROLE_LABEL = ROLES.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {});

const ICONS = {
  home: "LayoutDashboard",
  map: "Map",
  journey: "Route",
  pass: "BadgeCheck",
  conductor: "Ticket",
  updates: "Megaphone",
  driver: "BusFront",
  operator: "Truck",
  volunteer: "HandHeart",
  incidents: "TriangleAlert",
  allocations: "Shuffle",
  analytics: "BarChart3",
  ai: "Sparkles",
  notifications: "Bell",
  settings: "Settings2",
  demo: "FlaskConical",
};

export const NAV_BY_ROLE = {
  admin: [
    { to: "/", label: "Control center", icon: ICONS.home, primary: true },
    { to: "/map", label: "Fleet map", icon: ICONS.map, primary: true },
    { to: "/allocations", label: "Allocations", icon: ICONS.allocations, primary: true },
    { to: "/incidents", label: "Incidents", icon: ICONS.incidents, primary: true },
    { to: "/conductor", label: "Ticketing", icon: ICONS.conductor },
    { to: "/updates", label: "Updates", icon: ICONS.updates },
    { to: "/pass", label: "Mobility pass", icon: ICONS.pass },
    { to: "/analytics", label: "Analytics", icon: ICONS.analytics },
    { to: "/ai", label: "AI insights", icon: ICONS.ai },
    { to: "/notifications", label: "Notifications", icon: ICONS.notifications },
    { to: "/settings", label: "Rules & config", icon: ICONS.settings },
    { to: "/demo", label: "Demo panel", icon: ICONS.demo },
  ],
  passenger: [
    { to: "/", label: "My travel", icon: ICONS.home, primary: true },
    { to: "/journey", label: "Find transport", icon: ICONS.journey, primary: true },
    { to: "/map", label: "Live map", icon: ICONS.map, primary: true },
    { to: "/pass", label: "My pass", icon: ICONS.pass, primary: true },
    { to: "/notifications", label: "Alerts", icon: ICONS.notifications },
  ],
  gov_driver: [
    { to: "/driver", label: "Trip console", icon: ICONS.driver, primary: true },
    { to: "/conductor", label: "Ticket counter", icon: ICONS.conductor, primary: true },
    { to: "/updates", label: "Updates", icon: ICONS.updates, primary: true },
    { to: "/map", label: "Route map", icon: ICONS.map, primary: true },
    { to: "/incidents", label: "Report incident", icon: ICONS.incidents, primary: true },
    { to: "/notifications", label: "Alerts", icon: ICONS.notifications },
  ],
  private_driver: [
    { to: "/driver", label: "Trip console", icon: ICONS.driver, primary: true },
    { to: "/conductor", label: "Ticket counter", icon: ICONS.conductor, primary: true },
    { to: "/updates", label: "Updates", icon: ICONS.updates, primary: true },
    { to: "/map", label: "Route map", icon: ICONS.map, primary: true },
    { to: "/incidents", label: "Report incident", icon: ICONS.incidents, primary: true },
    { to: "/notifications", label: "Alerts", icon: ICONS.notifications },
  ],
  operator: [
    { to: "/operator", label: "Van console", icon: ICONS.operator, primary: true },
    { to: "/map", label: "Feeder map", icon: ICONS.map, primary: true },
    { to: "/notifications", label: "Alerts", icon: ICONS.notifications, primary: true },
  ],
  volunteer: [
    { to: "/volunteer", label: "Village desk", icon: ICONS.volunteer, primary: true },
    { to: "/map", label: "Village map", icon: ICONS.map, primary: true },
    { to: "/incidents", label: "Report hazard", icon: ICONS.incidents, primary: true },
    { to: "/notifications", label: "Tasks", icon: ICONS.notifications, primary: true },
  ],
};

const ALL_ROLES = ROLES.map((r) => r.id);

// Which roles may open which screen. Anything not listed is controller-only, so a
// new page is restricted by default instead of exposed by accident.
export const ROUTE_ACCESS = {
  "/": ALL_ROLES,
  "/map": ALL_ROLES,
  "/notifications": ALL_ROLES,
  "/journey": ["passenger", "admin"],
  "/pass": ["passenger", "admin"],
  "/driver": ["admin", "gov_driver", "private_driver"],
  "/conductor": ["admin", "gov_driver", "private_driver"],
  "/updates": ["admin", "gov_driver", "private_driver"],
  "/operator": ["admin", "operator"],
  "/volunteer": ["admin", "volunteer"],
  "/incidents": ["admin", "gov_driver", "private_driver", "volunteer"],
  "/allocations": ["admin"],
  "/analytics": ["admin"],
  "/ai": ["admin"],
  "/settings": ["admin"],
  "/demo": ["admin"],
};

export function canAccessRoute(pathname, role) {
  const allowed = ROUTE_ACCESS[pathname] || ["admin"];
  return allowed.includes(role);
}

export function navForRole(role) {
  return NAV_BY_ROLE[role] || NAV_BY_ROLE.admin;
}

export function homeForRole(role) {
  if (role === "gov_driver" || role === "private_driver") return "/driver";
  if (role === "operator") return "/operator";
  if (role === "volunteer") return "/volunteer";
  if (role === "passenger") return "/journey";
  return "/";
}