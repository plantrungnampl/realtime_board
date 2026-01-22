export type DashboardView = "home" | "recent" | "starred";

export const DEFAULT_DASHBOARD_VIEW: DashboardView = "home";

export function normalizeDashboardView(value?: string): DashboardView {
  if (value === "recent" || value === "starred" || value === "home") {
    return value;
  }
  return DEFAULT_DASHBOARD_VIEW;
}
