import { useSyncExternalStore } from "react";
import { useAuth } from "@/lib/AuthContext";
import { ROLES } from "@/lib/roles";

const KEY = "easyride.active_role";
const FALLBACK = "admin";
let current = null;
const listeners = new Set();

function read() {
  if (current) return current;
  if (typeof window === "undefined") return FALLBACK;
  try {
    current = window.localStorage.getItem(KEY) || FALLBACK;
  } catch {
    current = FALLBACK;
  }
  return current;
}

export function setActiveRole(role) {
  current = role;
  try {
    window.localStorage.setItem(KEY, role);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((listener) => listener());
}

export function subscribeRole(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The role the interface may show. Staff accounts (Base44 admins) can preview any
 * portal; every other signed-in account is a passenger and cannot switch itself
 * into a control role. Data access is still enforced by the entity rules and by
 * the controller-only backend functions.
 */
export function effectiveRole(user, stored) {
  if (user && user.role !== "admin") return "passenger";
  return ROLES.some((r) => r.id === stored) ? stored : FALLBACK;
}

export function readActiveRole() {
  return read();
}

export function useRole() {
  const stored = useSyncExternalStore(subscribeRole, read, () => FALLBACK);
  const { user } = useAuth();
  return effectiveRole(user, stored);
}