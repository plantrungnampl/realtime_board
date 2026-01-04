import type { OrganizationSummary } from "./types";

const CURRENT_ORG_KEY = "current_organization";
const ORGS_KEY = "organizations";

function canAccessStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage<T>(key: string, fallback: T): T {
  if (!canAccessStorage()) return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function getStoredOrganizations(): OrganizationSummary[] {
  return readStorage<OrganizationSummary[]>(ORGS_KEY, []);
}

export function getStoredCurrentOrganization(): OrganizationSummary | null {
  return readStorage<OrganizationSummary | null>(CURRENT_ORG_KEY, null);
}

export function setStoredOrganizations(organizations: OrganizationSummary[]) {
  if (!canAccessStorage()) return;
  window.localStorage.setItem(ORGS_KEY, JSON.stringify(organizations));
}

export function setStoredCurrentOrganization(org: OrganizationSummary | null) {
  if (!canAccessStorage()) return;
  if (!org) {
    window.localStorage.removeItem(CURRENT_ORG_KEY);
    return;
  }
  window.localStorage.setItem(CURRENT_ORG_KEY, JSON.stringify(org));
}

export function clearOrganizationStorage() {
  if (!canAccessStorage()) return;
  window.localStorage.removeItem(CURRENT_ORG_KEY);
  window.localStorage.removeItem(ORGS_KEY);
}
