import { useEffect } from "react";

export type ThemePreference = "light" | "dark" | "system";

function normalizeTheme(value?: string): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function useThemePreference(preference?: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const normalized = normalizeTheme(preference);

    const apply = (isDark: boolean) => {
      applyTheme(isDark ? "dark" : "light");
    };

    if (normalized === "system") {
      apply(media.matches);
      const handler = (event: MediaQueryListEvent) => {
        apply(event.matches);
      };

      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", handler);
        return () => media.removeEventListener("change", handler);
      }

      media.addListener(handler);
      return () => media.removeListener(handler);
    }

    apply(normalized === "dark");
  }, [preference]);
}
