import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type QuickCreateDirection = "top" | "right" | "bottom" | "left";

type HandlePosition = {
  x: number;
  y: number;
};

type QuickCreatePositions = {
  top: HandlePosition;
  right: HandlePosition;
  bottom: HandlePosition;
  left: HandlePosition;
};

type BoardQuickCreateHandlesProps = {
  positions: QuickCreatePositions | null;
  visible: boolean;
  onCreate: (direction: QuickCreateDirection) => void;
  onHoverChange?: (direction: QuickCreateDirection | null) => void;
};

export function BoardQuickCreateHandles({
  positions,
  visible,
  onCreate,
  onHoverChange,
}: BoardQuickCreateHandlesProps) {
  const { t } = useTranslation();

  if (!visible || !positions) {
    return null;
  }

  const buildLabel = (direction: QuickCreateDirection) =>
    t(`board.quickCreate.${direction}`);

  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((direction) => (
        <Button
          key={`quick-create-${direction}`}
          type="button"
          variant="secondary"
          size="sm"
          className={cn(
            "absolute z-30 h-7 w-7 rounded-full p-0 shadow-md",
          )}
          style={{
            left: positions[direction].x,
            top: positions[direction].y,
            transform: "translate(-50%, -50%)",
          }}
          aria-label={buildLabel(direction)}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseEnter={() => onHoverChange?.(direction)}
          onMouseLeave={() => onHoverChange?.(null)}
          onFocus={() => onHoverChange?.(direction)}
          onBlur={() => onHoverChange?.(null)}
          onClick={(event) => {
            event.stopPropagation();
            onCreate(direction);
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      ))}
    </>
  );
}
