import { memo, useCallback, useMemo } from "react";
import type { Graphics as PixiGraphics, FederatedPointerEvent } from "pixi.js";
import type { BoardElement, SelectionOverlay } from "@/types/board";
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

const SELECTION_STROKE = "#60A5FA";
const DEG_TO_RAD = Math.PI / 180;

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
  const drawRect = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      const rect = getRectBounds(element);
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -padding,
        -padding,
        rect.width + padding * 2,
        rect.height + padding * 2,
      );
      graphics.stroke();
    },
    [element.width, element.height, padding, strokeWidth, element.properties]
  );

  const drawCircle = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      const radius = Math.hypot(element.width || 0, element.height || 0);
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.circle(0, 0, radius + padding);
      graphics.stroke();
    },
    [element.width, element.height, padding, strokeWidth]
  );

  const drawText = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
      const content = (element.element_type === "Text" ? element.properties.content : "") || "";
      const metrics = getTextMetrics(content, fontSize);
      setStrokeStyle(graphics, strokeWidth, parseColor(SELECTION_STROKE));
      graphics.rect(
        -padding,
        -padding,
        metrics.width + padding * 2,
        metrics.height + padding * 2,
      );
      graphics.stroke();
    },
    [element.style.fontSize, (element as any).properties?.content, padding, strokeWidth]
  );

  // Common properties
  const rotation = (element.rotation ?? 0) * DEG_TO_RAD;

  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      const rect = getRectBounds(element);
      return (
        <pixiContainer
          x={rect.x}
          y={rect.y}
          rotation={rotation}
          eventMode="passive"
        >
          <pixiGraphics draw={drawRect} />
        </pixiContainer>
      );
    }
    if (element.properties.shapeType === "circle") {
      const positionX = coerceNumber(element.position_x, 0);
      const positionY = coerceNumber(element.position_y, 0);
      return (
        <pixiContainer
          x={positionX}
          y={positionY}
          rotation={rotation}
          eventMode="passive"
        >
          <pixiGraphics draw={drawCircle} />
        </pixiContainer>
      );
    }
  }

  if (element.element_type === "Text") {
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    return (
      <pixiContainer
        x={positionX}
        y={positionY}
        rotation={rotation}
        eventMode="passive"
      >
        <pixiGraphics draw={drawText} />
      </pixiContainer>
    );
  }

  if (element.element_type === "StickyNote") {
    const rect = getRectBounds(element);
    return (
      <pixiContainer
        x={rect.x}
        y={rect.y}
        rotation={rotation}
        eventMode="passive"
      >
        <pixiGraphics draw={drawRect} />
      </pixiContainer>
    );
  }

  return null;
});

type PresenceOverlayItemProps = {
  overlay: SelectionOverlay;
  strokeWidth: number;
  padding: number;
  stageScale: number;
};

export const PresenceOverlayItem = memo(function PresenceOverlayItem({
  overlay,
  strokeWidth,
  padding,
  stageScale,
}: PresenceOverlayItemProps) {
  const rawBounds = getElementBounds(overlay.element);

  const bounds = rawBounds ? toRectBounds(rawBounds) : null;

  const draw = useCallback(
    (graphics: PixiGraphics) => {
        graphics.clear();
        if (!bounds) return;
        setStrokeStyle(graphics, strokeWidth, parseColor(overlay.color));
        graphics.rect(
          -padding,
          -padding,
          bounds.width + padding * 2,
          bounds.height + padding * 2,
        );
        graphics.stroke();
    },
    [bounds?.width, bounds?.height, strokeWidth, overlay.color, padding]
  );

  const labelFontSize = 11 / stageScale;
  const labelOffset = 6 / stageScale;

  const textStyle = useMemo(() => ({
    fontSize: labelFontSize,
    fill: overlay.color,
  }), [labelFontSize, overlay.color]);

  if (!bounds) return null;

  return (
    <pixiContainer x={bounds.x} y={bounds.y}>
      <pixiGraphics draw={draw} />
      {overlay.label && (
        <pixiText
          text={overlay.label}
          x={0}
          y={-labelFontSize - labelOffset}
          style={textStyle}
        />
      )}
    </pixiContainer>
  );
});

type TransformHandleProps = {
  x: number;
  y: number;
  handleKey: "nw" | "ne" | "se" | "sw";
  handleSize: number;
  stageScale: number;
  onBeginResize: (event: FederatedPointerEvent, element: BoardElement, handle: "nw" | "ne" | "se" | "sw") => void;
  element: BoardElement;
};

const TransformHandle = memo(function TransformHandle({
  x,
  y,
  handleKey,
  handleSize,
  stageScale,
  onBeginResize,
  element,
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
    [handleSize, stageScale]
  );

  const onDown = useCallback(
    (event: FederatedPointerEvent) => onBeginResize(event, element, handleKey),
    [onBeginResize, element, handleKey]
  );

  return (
    <pixiGraphics
      x={x}
      y={y}
      eventMode="static"
      onPointerDown={onDown}
      draw={draw}
    />
  );
});

type RotateHandleProps = {
  x: number;
  y: number;
  handleSize: number;
  onBeginRotate: (event: FederatedPointerEvent, element: BoardElement) => void;
  element: BoardElement;
};

const RotateHandle = memo(function RotateHandle({
  x,
  y,
  handleSize,
  onBeginRotate,
  element,
}: RotateHandleProps) {
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setFillStyle(graphics, parseColor(SELECTION_STROKE));
      graphics.circle(0, 0, handleSize / 2);
      graphics.fill();
    },
    [handleSize]
  );

  const onDown = useCallback(
    (event: FederatedPointerEvent) => onBeginRotate(event, element),
    [onBeginRotate, element]
  );

  return (
    <pixiGraphics
      x={x}
      y={y}
      eventMode="static"
      onPointerDown={onDown}
      draw={draw}
    />
  );
});

type TransformControlsProps = {
  transformHandles: {
    element: BoardElement;
    handles: Array<{ key: "nw" | "ne" | "se" | "sw"; x: number; y: number }>;
    rotateHandle: { x: number; y: number };
    rotateLineStart: { x: number; y: number };
  };
  selectionStrokeWidth: number;
  handleSize: number;
  stageScale: number;
  onBeginRotate: (event: FederatedPointerEvent, element: BoardElement) => void;
  onBeginResize: (event: FederatedPointerEvent, element: BoardElement, handle: "nw" | "ne" | "se" | "sw") => void;
};

export const TransformControls = memo(function TransformControls({
  transformHandles,
  selectionStrokeWidth,
  handleSize,
  stageScale,
  onBeginRotate,
  onBeginResize,
}: TransformControlsProps) {
  const drawRotateLine = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
      graphics.moveTo(transformHandles.rotateLineStart.x, transformHandles.rotateLineStart.y);
      graphics.lineTo(transformHandles.rotateHandle.x, transformHandles.rotateHandle.y);
      graphics.stroke();
    },
    [transformHandles.rotateLineStart.x, transformHandles.rotateLineStart.y, transformHandles.rotateHandle.x, transformHandles.rotateHandle.y, selectionStrokeWidth]
  );

  return (
    <pixiContainer eventMode="static">
      <pixiGraphics draw={drawRotateLine} />

      <RotateHandle
        x={transformHandles.rotateHandle.x}
        y={transformHandles.rotateHandle.y}
        handleSize={handleSize}
        onBeginRotate={onBeginRotate}
        element={transformHandles.element}
      />

      {transformHandles.handles.map((handle) => (
        <TransformHandle
          key={handle.key}
          x={handle.x}
          y={handle.y}
          handleKey={handle.key}
          handleSize={handleSize}
          stageScale={stageScale}
          onBeginResize={onBeginResize}
          element={transformHandles.element}
        />
      ))}
    </pixiContainer>
  );
});
