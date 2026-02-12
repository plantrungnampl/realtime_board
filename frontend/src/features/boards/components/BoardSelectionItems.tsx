import { memo, useCallback, useMemo, Fragment } from "react";
import type { Graphics as PixiGraphics } from "pixi.js";
import type { BoardElement } from "@/types/board";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import {
  coerceNumber,
  parseColor,
  getRectBounds,
  toRectBounds,
  setStrokeStyle,
} from "@/features/boards/boardCanvas/renderUtils";
import { getElementBounds } from "@/features/boards/elementMove.utils";

const DEG_TO_RAD = Math.PI / 180;
const SELECTION_STROKE = "#60A5FA";

type SelectionOutlineProps = {
  element: BoardElement;
  strokeWidth: number;
  padding: number;
};

const SelectionRectangle = ({ element, strokeWidth, padding }: SelectionOutlineProps) => {
  const rect = getRectBounds(element);
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -padding,
        -padding,
        rect.width + padding * 2,
        rect.height + padding * 2,
      );
      graphics.stroke();
    },
    [rect.width, rect.height, strokeWidth, padding],
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

const SelectionCircle = ({ element, strokeWidth, padding }: SelectionOutlineProps) => {
  const radius = Math.hypot(element.width || 0, element.height || 0);
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.circle(0, 0, radius + padding);
      graphics.stroke();
    },
    [radius, strokeWidth, padding],
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

const SelectionText = ({ element, strokeWidth, padding }: SelectionOutlineProps) => {
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  // @ts-expect-error - Casting to TextElement to access style.fontSize safely
  const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
  // @ts-expect-error - Casting to TextElement to access properties.content safely
  const content = element.properties?.content ?? "";
  const metrics = getTextMetrics(content, fontSize);

  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -padding,
        -padding,
        metrics.width + padding * 2,
        metrics.height + padding * 2,
      );
      graphics.stroke();
    },
    [metrics.width, metrics.height, strokeWidth, padding],
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

const SelectionStickyNote = ({ element, strokeWidth, padding }: SelectionOutlineProps) => {
  const rect = getRectBounds(element);
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -padding,
        -padding,
        rect.width + padding * 2,
        rect.height + padding * 2,
      );
      graphics.stroke();
    },
    [rect.width, rect.height, strokeWidth, padding],
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

export const SelectionOutline = memo(function SelectionOutline(props: SelectionOutlineProps) {
  const { element } = props;
  if (element.element_type === "Shape") {
    // @ts-expect-error - property shapeType exists on ShapeElement
    if (element.properties.shapeType === "rectangle") {
      return <SelectionRectangle {...props} />;
    }
    // @ts-expect-error - property shapeType exists on ShapeElement
    if (element.properties.shapeType === "circle") {
      return <SelectionCircle {...props} />;
    }
  }
  if (element.element_type === "Text") {
    return <SelectionText {...props} />;
  }
  if (element.element_type === "StickyNote") {
    return <SelectionStickyNote {...props} />;
  }
  return null;
});

type PresenceOverlayProps = {
  element: BoardElement;
  color: string;
  label?: string;
  strokeWidth: number;
  padding: number;
  stageScale: number;
};

export const PresenceOverlay = memo(function PresenceOverlay({
  element,
  color,
  label,
  strokeWidth,
  padding,
  stageScale,
}: PresenceOverlayProps) {
  const rawBounds = getElementBounds(element);
  const bounds = rawBounds ? toRectBounds(rawBounds) : null;
  const labelFontSize = 11 / stageScale;
  const labelOffset = 6 / stageScale;

  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      if (!bounds) return;
      setStrokeStyle(graphics, strokeWidth, parseColor(color));
      graphics.rect(
        bounds.x - padding,
        bounds.y - padding,
        bounds.width + padding * 2,
        bounds.height + padding * 2,
      );
      graphics.stroke();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounds?.x, bounds?.y, bounds?.width, bounds?.height, strokeWidth, color, padding],
  );

  const style = useMemo(
    () => ({
      fontSize: labelFontSize,
      fill: color,
    }),
    [labelFontSize, color],
  );

  if (!bounds) return null;

  return (
    <Fragment>
      <pixiGraphics draw={draw} />
      {label && (
        <pixiText
          text={label}
          x={bounds.x}
          y={bounds.y - labelFontSize - labelOffset}
          style={style}
        />
      )}
    </Fragment>
  );
});
