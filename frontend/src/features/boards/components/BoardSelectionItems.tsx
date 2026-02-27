import { memo, useCallback, useMemo } from "react";
import type { Graphics } from "pixi.js";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import type { BoardElement, SelectionOverlay } from "@/features/boards/types";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import {
  coerceNumber,
  getRectBounds,
  parseColor,
  setStrokeStyle,
  toRectBounds,
} from "@/features/boards/boardCanvas/renderUtils";

const DEG_TO_RAD = Math.PI / 180;
const SELECTION_STROKE = "#60A5FA";

export type SelectionOutlineProps = {
  element: BoardElement;
  selectionStrokeWidth: number;
  selectionPadding: number;
};

const RectangleSelection = memo(function RectangleSelection({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: SelectionOutlineProps) {
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
});

const CircleSelection = memo(function CircleSelection({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: SelectionOutlineProps) {
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
});

const TextSelection = memo(function TextSelection({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: SelectionOutlineProps) {
  const textElement = element as Extract<BoardElement, { element_type: "Text" }>;
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
  const content = textElement.properties?.content ?? "";
  const metrics = useMemo(
    () => getTextMetrics(content, fontSize),
    [content, fontSize],
  );
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
});

const StickyNoteSelection = memo(function StickyNoteSelection({
  element,
  selectionStrokeWidth,
  selectionPadding,
}: SelectionOutlineProps) {
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
});

export const SelectionOutline = memo(function SelectionOutline(props: SelectionOutlineProps) {
  const { element } = props;
  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      return <RectangleSelection {...props} />;
    }
    if (element.properties.shapeType === "circle") {
      return <CircleSelection {...props} />;
    }
  }

  if (element.element_type === "Text") {
    return <TextSelection {...props} />;
  }

  if (element.element_type === "StickyNote") {
    return <StickyNoteSelection {...props} />;
  }

  return null;
});

export type PresenceOverlayItemProps = {
  overlay: SelectionOverlay;
  selectionStrokeWidth: number;
  selectionPadding: number;
  stageScale: number;
};

export const PresenceOverlayItem = memo(function PresenceOverlayItem({
  overlay,
  selectionStrokeWidth,
  selectionPadding,
  stageScale,
}: PresenceOverlayItemProps) {
  // Always call hooks at the top level
  const rawBounds = useMemo(() => getElementBounds(overlay.element), [overlay.element]);
  const bounds = useMemo(() => rawBounds ? toRectBounds(rawBounds) : null, [rawBounds]);
  const color = useMemo(() => parseColor(overlay.color), [overlay.color]);

  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      if (bounds) {
        setStrokeStyle(graphics, selectionStrokeWidth, color);
        graphics.rect(
          bounds.x - selectionPadding,
          bounds.y - selectionPadding,
          bounds.width + selectionPadding * 2,
          bounds.height + selectionPadding * 2,
        );
        graphics.stroke();
      }
    },
    [bounds, selectionPadding, selectionStrokeWidth, color],
  );

  const labelFontSize = 11 / stageScale;
  const labelOffset = 6 / stageScale;

  const labelStyle = useMemo(
    () => ({
      fontSize: labelFontSize,
      fill: overlay.color,
    }),
    [labelFontSize, overlay.color],
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
          style={labelStyle}
        />
      )}
    </>
  );
});
