import { memo, useCallback, Fragment } from "react";
import type { FederatedPointerEvent, Graphics as PixiGraphics } from "pixi.js";
import type { BoardElement } from "@/types/board";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import {
  coerceNumber,
  parseColor,
  getRectBounds,
  toRectBounds,
  setStrokeStyle,
  setFillStyle,
} from "@/features/boards/boardCanvas/renderUtils";

const DEG_TO_RAD = Math.PI / 180;
const SELECTION_STROKE = "#60A5FA";

type SelectionOutlineProps = {
  element: BoardElement;
  strokeWidth: number;
  padding: number;
};

export const SelectionOutline = memo(function SelectionOutline({
  element,
  strokeWidth,
  padding,
}: SelectionOutlineProps) {
  const rotation = (element.rotation ?? 0) * DEG_TO_RAD;

  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
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
          rotation={rotation}
          eventMode="passive"
        >
          <pixiGraphics draw={draw} />
        </pixiContainer>
      );
    }

    if (element.properties.shapeType === "circle") {
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
          rotation={rotation}
          eventMode="passive"
        >
          <pixiGraphics draw={draw} />
        </pixiContainer>
      );
    }
  }

  if (element.element_type === "Text") {
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
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
        rotation={rotation}
        eventMode="passive"
      >
        <pixiGraphics draw={draw} />
      </pixiContainer>
    );
  }

  if (element.element_type === "StickyNote") {
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
        rotation={rotation}
        eventMode="passive"
      >
        <pixiGraphics draw={draw} />
      </pixiContainer>
    );
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
  if (!rawBounds) return null;
  const bounds = toRectBounds(rawBounds);
  const labelFontSize = 11 / stageScale;
  const labelOffset = 6 / stageScale;

  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(color));
      graphics.rect(
        -padding,
        -padding,
        bounds.width + padding * 2,
        bounds.height + padding * 2,
      );
      graphics.stroke();
    },
    [bounds.width, bounds.height, strokeWidth, padding, color],
  );

  return (
    <Fragment>
      <pixiContainer x={bounds.x} y={bounds.y} eventMode="passive">
        <pixiGraphics draw={draw} />
      </pixiContainer>
      {label && (
        <pixiText
          text={label}
          x={bounds.x}
          y={bounds.y - labelFontSize - labelOffset}
          style={{
            fontSize: labelFontSize,
            fill: color,
          }}
        />
      )}
    </Fragment>
  );
});

type TransformHandleProps = {
  x: number;
  y: number;
  handleKey: "nw" | "ne" | "se" | "sw";
  element: BoardElement;
  stageScale: number;
  handleSize: number;
  onBeginResize: (event: FederatedPointerEvent, element: BoardElement, handle: "nw" | "ne" | "se" | "sw") => void;
};

export const TransformHandle = memo(function TransformHandle({
  x,
  y,
  handleKey,
  element,
  stageScale,
  handleSize,
  onBeginResize,
}: TransformHandleProps) {
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setFillStyle(graphics, 0xffffff);
      setStrokeStyle(graphics, 1 / stageScale, parseColor(SELECTION_STROKE));
      graphics.rect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
      graphics.fill();
      graphics.stroke();
    },
    [handleSize, stageScale],
  );

  const handlePointerDown = useCallback(
    (event: FederatedPointerEvent) => onBeginResize(event, element, handleKey),
    [onBeginResize, element, handleKey],
  );

  return (
    <pixiGraphics
      x={x}
      y={y}
      eventMode="static"
      onPointerDown={handlePointerDown}
      draw={draw}
    />
  );
});

type TransformLineProps = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  strokeWidth: number;
};

export const TransformLine = memo(function TransformLine({
  start,
  end,
  strokeWidth,
}: TransformLineProps) {
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.moveTo(start.x, start.y);
      graphics.lineTo(end.x, end.y);
      graphics.stroke();
    },
    [start.x, start.y, end.x, end.y, strokeWidth],
  );

  return <pixiGraphics draw={draw} />;
});

type RotateHandleProps = {
  x: number;
  y: number;
  handleSize: number;
  element: BoardElement;
  onBeginRotate: (event: FederatedPointerEvent, element: BoardElement) => void;
};

export const RotateHandle = memo(function RotateHandle({
  x,
  y,
  handleSize,
  element,
  onBeginRotate,
}: RotateHandleProps) {
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setFillStyle(graphics, parseColor(SELECTION_STROKE));
      graphics.circle(0, 0, handleSize / 2);
      graphics.fill();
    },
    [handleSize],
  );

  const handlePointerDown = useCallback(
    (event: FederatedPointerEvent) => onBeginRotate(event, element),
    [onBeginRotate, element],
  );

  return (
    <pixiGraphics
      x={x}
      y={y}
      eventMode="static"
      onPointerDown={handlePointerDown}
      draw={draw}
    />
  );
});
