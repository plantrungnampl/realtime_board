/**
 * BoardSelectionItems.tsx
 *
 * This file contains memoized components for rendering selection outlines and presence overlays.
 * By extracting these into separate components with stable `draw` callbacks, we prevent
 * unnecessary re-renders and re-draws of PixiJS graphics when other parts of the stage update
 * (e.g. during panning, zooming, or when other users move their cursors).
 */
import { memo, useCallback } from "react";
import type { Graphics as PixiGraphics } from "pixi.js";
import type { BoardElement, SelectionOverlay } from "@/features/boards/types";
import {
  coerceNumber,
  parseColor,
  setStrokeStyle,
  getRectBounds,
  toRectBounds,
} from "@/features/boards/boardCanvas/renderUtils";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";

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
  const type = element.element_type;
  const shapeType = type === "Shape" ? element.properties.shapeType : null;
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
  const content =
    (type === "Text" || type === "StickyNote") ? element.properties.content : "";

  let x = 0;
  let y = 0;
  const rotation = (element.rotation ?? 0) * DEG_TO_RAD;
  let drawWidth = 0;
  let drawHeight = 0;
  let radius = 0;

  let isValid = false;

  if (type === "Shape") {
    if (shapeType === "rectangle") {
      const rect = getRectBounds(element);
      x = rect.x;
      y = rect.y;
      drawWidth = rect.width;
      drawHeight = rect.height;
      isValid = true;
    } else if (shapeType === "circle") {
      x = coerceNumber(element.position_x, 0);
      y = coerceNumber(element.position_y, 0);
      radius = Math.hypot(width, height);
      isValid = true;
    }
  } else if (type === "Text") {
    x = coerceNumber(element.position_x, 0);
    y = coerceNumber(element.position_y, 0);
    const metrics = getTextMetrics(content, fontSize);
    drawWidth = metrics.width;
    drawHeight = metrics.height;
    isValid = true;
  } else if (type === "StickyNote") {
    const rect = getRectBounds(element);
    x = rect.x;
    y = rect.y;
    drawWidth = rect.width;
    drawHeight = rect.height;
    isValid = true;
  }

  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));

      if (type === "Shape" && shapeType === "circle") {
        graphics.circle(0, 0, radius + padding);
      } else {
        graphics.rect(
          -padding,
          -padding,
          drawWidth + padding * 2,
          drawHeight + padding * 2,
        );
      }
      graphics.stroke();
    },
    [
      type,
      shapeType,
      radius,
      drawWidth,
      drawHeight,
      padding,
      strokeWidth,
    ],
  );

  if (!isValid) return null;

  return (
    <pixiContainer x={x} y={y} rotation={rotation} eventMode="passive">
      <pixiGraphics draw={draw} />
    </pixiContainer>
  );
});

type PresenceOverlayProps = {
  overlay: SelectionOverlay;
  strokeWidth: number;
  padding: number;
  stageScale: number;
};

export const PresenceOverlay = memo(function PresenceOverlay({
  overlay,
  strokeWidth,
  padding,
  stageScale,
}: PresenceOverlayProps) {
  const rawBounds = getElementBounds(overlay.element);
  const bounds = rawBounds ? toRectBounds(rawBounds) : { x: 0, y: 0, width: 0, height: 0 };
  const labelFontSize = 11 / stageScale;
  const labelOffset = 6 / stageScale;

  // We position the container at bounds.x, bounds.y
  // So drawing is relative to 0,0
  const width = bounds.width;
  const height = bounds.height;
  const color = overlay.color;

  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(color));
      graphics.rect(
        -padding,
        -padding,
        width + padding * 2,
        height + padding * 2,
      );
      graphics.stroke();
    },
    [width, height, padding, strokeWidth, color],
  );

  if (!rawBounds) return null;

  return (
    <pixiContainer x={bounds.x} y={bounds.y} eventMode="passive">
      <pixiGraphics draw={draw} />
      {overlay.label && (
        <pixiText
          text={overlay.label}
          x={0}
          y={-labelFontSize - labelOffset}
          style={{
            fontSize: labelFontSize,
            fill: color,
          }}
        />
      )}
    </pixiContainer>
  );
});
