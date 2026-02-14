import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const FILL_COLORS = [
  "#FFFFFF",
  "#FDE68A",
  "#A7F3D0",
  "#BFDBFE",
  "#FCA5A5",
  "transparent",
];

const STROKE_COLORS = [
  "#FFFFFF",
  "#111827",
  "#F59E0B",
  "#22C55E",
  "#3B82F6",
  "#EF4444",
];

const COLOR_NAMES: Record<string, string> = {
  "#FFFFFF": "board.colors.white",
  "#FDE68A": "board.colors.yellowLight",
  "#A7F3D0": "board.colors.greenLight",
  "#BFDBFE": "board.colors.blueLight",
  "#FCA5A5": "board.colors.redLight",
  transparent: "board.colors.transparent",
  "#111827": "board.colors.black",
  "#F59E0B": "board.colors.yellow",
  "#22C55E": "board.colors.green",
  "#3B82F6": "board.colors.blue",
  "#EF4444": "board.colors.red",
};

const STROKE_WIDTHS = [1, 2, 4];

type ToolbarPosition = {
  x: number;
  y: number;
};

type BoardSelectionToolbarProps = {
  position: ToolbarPosition | null;
  visible: boolean;
  supportsFill: boolean;
  supportsStroke: boolean;
  fill: string | undefined;
  stroke: string | undefined;
  strokeWidth: number | undefined;
  onFillChange: (color: string) => void;
  onStrokeChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
};

export function BoardSelectionToolbar({
  position,
  visible,
  supportsFill,
  supportsStroke,
  fill,
  stroke,
  strokeWidth,
  onFillChange,
  onStrokeChange,
  onStrokeWidthChange,
}: BoardSelectionToolbarProps) {
  const { t } = useTranslation();

  const toolbarStyle = useMemo<CSSProperties | undefined>(() => {
    if (!position) return undefined;
    return {
      transform: "translate(-50%, -100%)",
      left: position.x,
      top: position.y,
    };
  }, [position]);

  if (!visible || !position) {
    return null;
  }

  return (
    <div
      className="absolute z-30 flex items-center gap-3 rounded-full border border-border bg-bg-surface/95 px-3 py-2 shadow-lg backdrop-blur"
      style={toolbarStyle}
      role="toolbar"
      aria-label={t("board.toolbar.label")}
    >
      {supportsFill && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{t("board.toolbar.fill")}</span>
          <div className="flex items-center gap-1">
            {FILL_COLORS.map((color) => {
              const isActive = (fill ?? "transparent") === color;
              return (
                <button
                  key={`fill-${color}`}
                  type="button"
                  className={cn(
                    "h-5 w-5 rounded-full border border-border/70 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
                    isActive && "ring-2 ring-offset-2 ring-blue-500/70 ring-offset-bg-surface",
                    color === "transparent" && "bg-[linear-gradient(135deg,#374151_25%,transparent_25%,transparent_50%,#374151_50%,#374151_75%,transparent_75%,transparent)] bg-[length:8px_8px]",
                  )}
                  style={color === "transparent" ? undefined : { backgroundColor: color }}
                  aria-label={`${t("board.toolbar.fill")} ${t(COLOR_NAMES[color])}`}
                  onClick={() => onFillChange(color)}
                />
              );
            })}
          </div>
        </div>
      )}

      {supportsStroke && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{t("board.toolbar.stroke")}</span>
          <div className="flex items-center gap-1">
            {STROKE_COLORS.map((color) => {
              const isActive = (stroke ?? "") === color;
              return (
                <button
                  key={`stroke-${color}`}
                  type="button"
                  className={cn(
                    "h-5 w-5 rounded-full border border-border/70 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
                    isActive && "ring-2 ring-offset-2 ring-blue-500/70 ring-offset-bg-surface",
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`${t("board.toolbar.stroke")} ${t(COLOR_NAMES[color])}`}
                  onClick={() => onStrokeChange(color)}
                />
              );
            })}
          </div>
        </div>
      )}

      {supportsStroke && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {t("board.toolbar.strokeWidth")}
          </span>
          <div className="flex items-center gap-1">
            {STROKE_WIDTHS.map((width) => (
              <Button
                key={`stroke-width-${width}`}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 w-8 p-0 rounded-full",
                  strokeWidth === width && "bg-bg-elevated text-text-primary",
                )}
                aria-label={`${t("board.toolbar.strokeWidth")} ${width}`}
                onClick={() => onStrokeWidthChange(width)}
              >
                <span
                  className="block w-4 rounded-full bg-text-primary"
                  style={{ height: Math.max(1, width) }}
                />
              </Button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
