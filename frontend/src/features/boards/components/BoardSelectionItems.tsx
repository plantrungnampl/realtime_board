import { memo, useCallback, useMemo } from "react";
import type { Graphics } from "pixi.js";
import type { BoardElement, SelectionOverlay } from "@/features/boards/types";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import {
  coerceNumber,
  parseColor,
  setStrokeStyle,
  getRectBounds,
  toRectBounds,
} from "@/features/boards/boardCanvas/renderUtils";

const DEG_TO_RAD = Math.PI / 180;
const SELECTION_STROKE = "#60A5FA";

type BaseSelectionOutlineProps = {
  element: BoardElement;
  selectionStrokeWidth: number;
  selectionPadding: number;
};

const SelectionRectangleOutline = ({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: BaseSelectionOutlineProps) => {
  const rect = getRectBounds(element);
  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -selectionPadding,
        -selectionPadding,
        rect.width + selectionPadding * 2,
        rect.height + selectionPadding * 2,
      );
      graphics.stroke();
    },
    [rect.width, rect.height, selectionPadding, selectionStrokeWidth],
  );

  return (
    <pixiContainer
      x={rect.x}
      y={rect.y}
      rotation={(element.rotation ?? 0) * DEG_TO_RAD}
      eventMode="passive"
    >
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};

const SelectionCircleOutline = ({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: BaseSelectionOutlineProps) => {
  const radius = Math.hypot(element.width || 0, element.height || 0);
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
      graphics.circle(0, 0, radius + selectionPadding);
      graphics.stroke();
    },
    [radius, selectionPadding, selectionStrokeWidth],
  );

  return (
    <pixiContainer
      x={positionX}
      y={positionY}
      rotation={(element.rotation ?? 0) * DEG_TO_RAD}
      eventMode="passive"
    >
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};

const SelectionTextOutline = ({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: BaseSelectionOutlineProps) => {
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
  const content = element.properties?.content ?? "";
  const metrics = useMemo(() => getTextMetrics(content, fontSize), [content, fontSize]);

  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -selectionPadding,
        -selectionPadding,
        metrics.width + selectionPadding * 2,
        metrics.height + selectionPadding * 2,
      );
      graphics.stroke();
    },
    [metrics.width, metrics.height, selectionPadding, selectionStrokeWidth],
  );

  return (
    <pixiContainer
      x={positionX}
      y={positionY}
      rotation={(element.rotation ?? 0) * DEG_TO_RAD}
      eventMode="passive"
    >
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};

const SelectionStickyNoteOutline = ({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: BaseSelectionOutlineProps) => {
  const rect = getRectBounds(element);
  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -selectionPadding,
        -selectionPadding,
        rect.width + selectionPadding * 2,
        rect.height + selectionPadding * 2,
      );
      graphics.stroke();
    },
    [rect.width, rect.height, selectionPadding, selectionStrokeWidth],
  );

  return (
    <pixiContainer
      x={rect.x}
      y={rect.y}
      rotation={(element.rotation ?? 0) * DEG_TO_RAD}
      eventMode="passive"
    >
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
};

export const SelectionOutline = memo(function SelectionOutline(props: BaseSelectionOutlineProps) {
  const { element } = props;
  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      return <SelectionRectangleOutline {...props} />;
    }
    if (element.properties.shapeType === "circle") {
      return <SelectionCircleOutline {...props} />;
    }
  }

  if (element.element_type === "Text") {
    return <SelectionTextOutline {...props} />;
  }

  if (element.element_type === "StickyNote") {
    return <SelectionStickyNoteOutline {...props} />;
  }

  return null;
});

type PresenceOutlineProps = {
  overlay: SelectionOverlay;
  selectionStrokeWidth: number;
  selectionPadding: number;
  stageScale: number;
};

export const PresenceOutline = memo(function PresenceOutline({
  overlay,
  selectionStrokeWidth,
  selectionPadding,
  stageScale,
}: PresenceOutlineProps) {
  const rawBounds = getElementBounds(overlay.element);
  const bounds = rawBounds ? toRectBounds(rawBounds) : null;
  const labelFontSize = 11 / stageScale;
  const labelOffset = 6 / stageScale;

  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      if (!bounds) return;
      setStrokeStyle(graphics, selectionStrokeWidth, parseColor(overlay.color));
      graphics.rect(
        bounds.x - selectionPadding,
        bounds.y - selectionPadding,
        bounds.width + selectionPadding * 2,
        bounds.height + selectionPadding * 2,
      );
      graphics.stroke();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds?.x, bounds?.y, bounds?.width, bounds?.height, selectionPadding, selectionStrokeWidth, overlay.color],
  );

  if (!bounds) return null;

  return (
    <>
      <pixiGraphics draw={draw} />
      {overlay.label && (
        <pixiText
          text={overlay.label}
          x={bounds.x}
          y={bounds.y - labelFontSize - labelOffset}
          style={{
            fontSize: labelFontSize,
            fill: overlay.color,
          }}
        />
      )}
    </>
  );
});
