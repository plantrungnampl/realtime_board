export type DashboardOwnerFilter = "any" | "me" | "others";
export type DashboardSort = "last_opened" | "last_edited" | "name" | "created";

export const DEFAULT_DASHBOARD_OWNER_FILTER: DashboardOwnerFilter = "any";
export const DEFAULT_DASHBOARD_SORT: DashboardSort = "last_opened";

export function normalizeOwnerFilter(value?: string): DashboardOwnerFilter {
  if (value === "me" || value === "others" || value === "any") {
    return value;
  }
  return DEFAULT_DASHBOARD_OWNER_FILTER;
}

export function normalizeSort(value?: string): DashboardSort {
  if (
    value === "last_opened" ||
    value === "last_edited" ||
    value === "name" ||
    value === "created"
  ) {
    return value;
  }
  return DEFAULT_DASHBOARD_SORT;
}
