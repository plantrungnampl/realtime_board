import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Stage,
  Layer,
  Circle,
  Rect,
  Line,
  Path,
  Text as KonvaText,
  Group,
  Transformer,
} from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type Konva from "konva";
import type { BoardElement } from "@/types/board";
import type { CursorBroadcast, SelectionPresence } from "@/features/boards/types";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import type { SnapGuide } from "@/features/boards/elementMove.utils";
import { BoardGrid } from "@/features/boards/components/BoardGrid";

type TextEditorPayload = {
  x: number;
  y: number;
  value: string;
  elementId: string;
  fontSize: number;
  color: string;
  elementType: "Text" | "StickyNote";
  backgroundColor?: string;
  editorWidth?: number;
  editorHeight?: number;
};

type BoardCanvasStageProps = {
  stageRef: RefObject<KonvaStage | null>;
  width: number;
  height: number;
  stageScale: number;
  stagePosition: { x: number; y: number };
  onMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  onMouseMove: (event: KonvaEventObject<MouseEvent>) => void;
  onMouseUp: (event: KonvaEventObject<MouseEvent>) => void;
  onMouseLeave: () => void;
  onWheel: (event: KonvaEventObject<WheelEvent>) => void;
  worldRect: { x: number; y: number; width: number; height: number };
  backgroundColor: string;
  gridSize: number;
  gridEnabled: boolean;
  snapGuides: SnapGuide[];
  elements: BoardElement[];
  ghostElement?: BoardElement | null;
  selectedElementIds: string[];
  selectionPresence: SelectionPresence[];
  cursorList: CursorBroadcast[];
  localOverrideIds: Set<string>;
  lockedElementIds: Set<string>;
  isDragEnabled: boolean;
  onElementDragMove: (
    id: string,
    position: { x: number; y: number },
    modifiers?: { allowSnap?: boolean },
  ) => void;
  onElementDragEnd: (
    id: string,
    position: { x: number; y: number },
    modifiers?: { allowSnap?: boolean },
  ) => void;
  onElementTransform: (id: string, payload: {
    position_x: number;
    position_y: number;
    width: number;
    height: number;
    rotation: number;
    font_size?: number;
  }) => void;
  onElementTransformEnd: (id: string, payload: {
    position_x: number;
    position_y: number;
    width: number;
    height: number;
    rotation: number;
    font_size?: number;
  }) => void;
  onDrawingDragEnd: (
    id: string,
    position: { x: number; y: number },
    modifiers?: { allowSnap?: boolean },
  ) => void;
  onOpenTextEditor: (payload: TextEditorPayload) => void;
};

const CURSOR_SMOOTH_DURATION = 0.12;
const MIN_TRANSFORM_SIZE = 12;

const CursorMarker = memo(function CursorMarker({
  cursor,
}: {
  cursor: CursorBroadcast;
}) {
  const groupRef = useRef<Konva.Group | null>(null);

  useEffect(() => {
    const node = groupRef.current;
    if (!node) return;
    node.to({
      x: cursor.x ?? 0,
      y: cursor.y ?? 0,
      duration: CURSOR_SMOOTH_DURATION,
    });
  }, [cursor.x, cursor.y]);

  return (
    <Group ref={groupRef} x={cursor.x ?? 0} y={cursor.y ?? 0} listening={false}>
      <Circle radius={4} fill={cursor.color} stroke="#171717" strokeWidth={1} />
      <KonvaText
        text={cursor.user_name}
        y={10}
        x={-10}
        fill={cursor.color}
        fontSize={10}
      />
    </Group>
  );
});

const SELECTION_STROKE = "#FBBF24";
const SNAP_GUIDE_COLORS = {
  vertical: "#EF4444",
  horizontal: "#3B82F6",
};
const MEDIA_LABELS: Record<string, string> = {
  Image: "Image",
  Video: "Video",
  Embed: "Embed",
  Document: "Document",
  Component: "Component",
};

type ElementBounds = { x: number; y: number; width: number; height: number };

const invalidElementWarnings = new Set<string>();

const warnInvalidElementOnce = (
  element: BoardElement,
  reason: string,
) => {
  if (!import.meta.env.DEV) return;
  const key = `${element.id}:${reason}`;
  if (invalidElementWarnings.has(key)) return;
  invalidElementWarnings.add(key);
  console.warn(
    `[BoardCanvas] Skipping invalid ${element.element_type} ${element.id}: ${reason}`,
    element,
  );
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const coerceNumber = (value: unknown, fallback: number) =>
  isFiniteNumber(value) ? value : fallback;

function isValidPointArray(
  points: unknown[],
  minLength = 4,
): points is number[] {
  return (
    points.length >= minLength
    && points.length % 2 === 0
    && points.every(isFiniteNumber)
  );
}

const isValidDrawingPoints = (points: unknown[]): points is number[] =>
  isValidPointArray(points, 2);

const getRectBounds = (element: BoardElement): ElementBounds => {
  const hasValidMetrics =
    isFiniteNumber(element.position_x)
    && isFiniteNumber(element.position_y)
    && isFiniteNumber(element.width)
    && isFiniteNumber(element.height);
  if (!hasValidMetrics) {
    warnInvalidElementOnce(element, "invalid rect metrics");
  }
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  const width = coerceNumber(element.width, 0);
  const height = coerceNumber(element.height, 0);
  const rectX = Math.min(positionX, positionX + width);
  const rectY = Math.min(positionY, positionY + height);
  const rectWidth = Math.abs(width);
  const rectHeight = Math.abs(height);
  return { x: rectX, y: rectY, width: rectWidth, height: rectHeight };
};

const getDrawingBounds = (element: BoardElement): ElementBounds | null => {
  if (element.element_type !== "Drawing") return null;
  const points = element.properties.points;
  if (!Array.isArray(points) || !isValidDrawingPoints(points)) {
    warnInvalidElementOnce(element, "invalid drawing points");
    return null;
  }
  let minX = points[0];
  let maxX = points[0];
  let minY = points[1];
  let maxY = points[1];
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  return {
    x: positionX + minX,
    y: positionY + minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
};

const getElementBounds = (element: BoardElement): ElementBounds | null => {
  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "circle") {
      const radius = Math.hypot(element.width || 0, element.height || 0);
      const positionX = coerceNumber(element.position_x, 0);
      const positionY = coerceNumber(element.position_y, 0);
      return {
        x: positionX - radius,
        y: positionY - radius,
        width: radius * 2,
        height: radius * 2,
      };
    }
    return getRectBounds(element);
  }
  if (element.element_type === "Text") {
    const content = element.properties.content || "";
    const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
    const { width, height } = getTextMetrics(content, fontSize);
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    return {
      x: positionX,
      y: positionY,
      width,
      height,
    };
  }
  if (element.element_type === "Connector") {
    const points = resolveConnectorPoints(element);
    if (!points || points.length < 4) return null;
    let minX = points[0];
    let maxX = points[0];
    let minY = points[1];
    let maxY = points[1];
    for (let i = 2; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }
  if (element.element_type === "Drawing") {
    return getDrawingBounds(element);
  }
  return getRectBounds(element);
};

type SelectionOverlay = {
  key: string;
  element: BoardElement;
  color: string;
  label?: string;
  isEditing: boolean;
};

type ElementRendererProps = {
  element: BoardElement;
  isSelected: boolean;
  isLocked: boolean;
  isDragEnabled: boolean;
  selectionStrokeWidth: number;
  selectionDash: number[];
  selectionPadding: number;
  stageScale: number;
  registerElementRef: (id: string, node: Konva.Node | null) => void;
  onElementDragMove: (
    id: string,
    position: { x: number; y: number },
    modifiers?: { allowSnap?: boolean },
  ) => void;
  onElementDragEnd: (
    id: string,
    position: { x: number; y: number },
    modifiers?: { allowSnap?: boolean },
  ) => void;
  onElementTransform: (
    id: string,
    payload: {
      position_x: number;
      position_y: number;
      width: number;
      height: number;
      rotation: number;
      font_size?: number;
    },
  ) => void;
  onElementTransformEnd: (
    id: string,
    payload: {
      position_x: number;
      position_y: number;
      width: number;
      height: number;
      rotation: number;
      font_size?: number;
    },
  ) => void;
  onDrawingDragEnd: (
    id: string,
    position: { x: number; y: number },
    modifiers?: { allowSnap?: boolean },
  ) => void;
  onOpenTextEditor: (payload: TextEditorPayload) => void;
};

type SelectionOverlayLayerProps = {
  selectionPresence: SelectionPresence[];
  elements: BoardElement[];
  selectionStrokeWidth: number;
  selectionDash: number[];
  selectionPadding: number;
  stageScale: number;
};

function buildOrthogonalFallbackPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  if (start.x === end.x || start.y === end.y) {
    return [start.x, start.y, end.x, end.y];
  }
  const mid = { x: end.x, y: start.y };
  return [start.x, start.y, mid.x, mid.y, end.x, end.y];
}

function normalizeOrthogonalPoints(points?: number[]) {
  if (!points || points.length < 4) return points ?? [];
  const normalized: number[] = [points[0], points[1]];
  for (let i = 2; i < points.length; i += 2) {
    const lastX = normalized[normalized.length - 2];
    const lastY = normalized[normalized.length - 1];
    const nextX = points[i];
    const nextY = points[i + 1];
    if (lastX !== nextX && lastY !== nextY) {
      normalized.push(nextX, lastY);
    }
    normalized.push(nextX, nextY);
  }
  const reduced: number[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    const x = normalized[i];
    const y = normalized[i + 1];
    const len = reduced.length;
    if (len >= 4) {
      const prevX = reduced[len - 2];
      const prevY = reduced[len - 1];
      const prevPrevX = reduced[len - 4];
      const prevPrevY = reduced[len - 3];
      const collinear =
        (prevPrevX === prevX && prevX === x)
        || (prevPrevY === prevY && prevY === y);
      if (collinear) {
        reduced[len - 2] = x;
        reduced[len - 1] = y;
        continue;
      }
    }
    reduced.push(x, y);
  }
  return reduced;
}

const CONNECTOR_CORNER_RADIUS = 12;

const roundPoint = (value: number) => Math.round(value * 100) / 100;

function buildRoundedPath(points: number[], radius: number) {
  if (points.length < 4) return "";
  const coords = [];
  for (let i = 0; i < points.length; i += 2) {
    coords.push({ x: points[i], y: points[i + 1] });
  }
  if (coords.length < 2) return "";
  let path = `M ${roundPoint(coords[0].x)} ${roundPoint(coords[0].y)}`;
  for (let i = 1; i < coords.length - 1; i += 1) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const next = coords[i + 1];
    const collinear =
      (prev.x === curr.x && curr.x === next.x)
      || (prev.y === curr.y && curr.y === next.y);
    if (collinear) {
      path += ` L ${roundPoint(curr.x)} ${roundPoint(curr.y)}`;
      continue;
    }
    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 === 0 || len2 === 0) {
      path += ` L ${roundPoint(curr.x)} ${roundPoint(curr.y)}`;
      continue;
    }
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const p1 = {
      x: curr.x + (v1x / len1) * r,
      y: curr.y + (v1y / len1) * r,
    };
    const p2 = {
      x: curr.x + (v2x / len2) * r,
      y: curr.y + (v2y / len2) * r,
    };
    path +=
      ` L ${roundPoint(p1.x)} ${roundPoint(p1.y)}` +
      ` Q ${roundPoint(curr.x)} ${roundPoint(curr.y)} ${roundPoint(p2.x)} ${roundPoint(p2.y)}`;
  }
  const last = coords[coords.length - 1];
  path += ` L ${roundPoint(last.x)} ${roundPoint(last.y)}`;
  return path;
}

function resolveConnectorEndpoints(element: BoardElement) {
  if (element.element_type !== "Connector") return null;
  const start = element.properties?.start;
  const end = element.properties?.end;
  if (!start || !end) {
    warnInvalidElementOnce(element, "missing connector endpoints");
    return null;
  }
  if (
    !isFiniteNumber(start.x)
    || !isFiniteNumber(start.y)
    || !isFiniteNumber(end.x)
    || !isFiniteNumber(end.y)
  ) {
    warnInvalidElementOnce(element, "invalid connector endpoints");
    return null;
  }
  return { start, end };
}

function resolveConnectorPoints(element: BoardElement) {
  if (element.element_type !== "Connector") return null;
  const storedPoints = element.properties?.points;
  if (Array.isArray(storedPoints)) {
    if (!isValidPointArray(storedPoints)) {
      warnInvalidElementOnce(element, "invalid connector points");
      return null;
    }
    return normalizeOrthogonalPoints(storedPoints);
  }
  const endpoints = resolveConnectorEndpoints(element);
  if (!endpoints) return null;
  return buildOrthogonalFallbackPoints(endpoints.start, endpoints.end);
}

const resolveRectDragPosition = (element: BoardElement, x: number, y: number) => {
  const width = coerceNumber(element.width, 0);
  const height = coerceNumber(element.height, 0);
  return {
    x: width >= 0 ? x : x - width,
    y: height >= 0 ? y : y - height,
  };
};

const GHOST_OPACITY = 0.35;
const GHOST_DASH = [6, 6];

const GhostElementRenderer = memo(function GhostElementRenderer({
  element,
  stageScale,
}: {
  element: BoardElement;
  stageScale: number;
}) {
  const dash = GHOST_DASH.map((value) => value / stageScale);
  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "circle") {
      const radius = Math.hypot(element.width || 0, element.height || 0);
      const positionX = coerceNumber(element.position_x, 0);
      const positionY = coerceNumber(element.position_y, 0);
      return (
        <Circle
          x={positionX}
          y={positionY}
          radius={radius}
          stroke={element.style.stroke}
          strokeWidth={element.style.strokeWidth}
          fill={element.style.fill}
          dash={dash}
          opacity={GHOST_OPACITY}
          listening={false}
        />
      );
    }
    const rectBounds = getRectBounds(element);
    return (
      <Rect
        x={rectBounds.x}
        y={rectBounds.y}
        width={rectBounds.width}
        height={rectBounds.height}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
        fill={element.style.fill}
        dash={dash}
        opacity={GHOST_OPACITY}
        listening={false}
      />
    );
  }
  if (element.element_type === "Frame" || element.element_type === "StickyNote") {
    const rectBounds = getRectBounds(element);
    return (
      <Rect
        x={rectBounds.x}
        y={rectBounds.y}
        width={rectBounds.width}
        height={rectBounds.height}
        stroke={element.style.stroke}
        strokeWidth={element.style.strokeWidth}
        fill={element.style.fill}
        cornerRadius={element.style.cornerRadius ?? 0}
        dash={dash}
        opacity={GHOST_OPACITY}
        listening={false}
      />
    );
  }
  return null;
});

const ElementRenderer = memo(function ElementRenderer({
  element,
  isSelected,
  isLocked,
  isDragEnabled,
  selectionStrokeWidth,
  selectionDash,
  selectionPadding,
  stageScale,
  registerElementRef,
  onElementDragMove,
  onElementDragEnd,
  onElementTransform,
  onElementTransformEnd,
  onDrawingDragEnd,
  onOpenTextEditor,
}: ElementRendererProps) {
  const rectBounds = getRectBounds(element);
  const rectX = rectBounds.x;
  const rectY = rectBounds.y;
  const rectWidth = rectBounds.width;
  const rectHeight = rectBounds.height;
  const handleRef = useCallback(
    (node: Konva.Node | null) => {
      registerElementRef(element.id, node);
    },
    [element.id, registerElementRef],
  );

  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      return (
        <Group
          x={rectX}
          y={rectY}
          draggable={isDragEnabled && !isLocked}
          rotation={element.rotation ?? 0}
          ref={handleRef}
          onDragMove={(event) => {
            const node = event.target;
            const next = resolveRectDragPosition(element, node.x(), node.y());
            onElementDragMove(element.id, next, {
              allowSnap: !event.evt.altKey,
            });
          }}
          onDragEnd={(event) => {
            const node = event.target;
            const next = resolveRectDragPosition(element, node.x(), node.y());
            onElementDragEnd(element.id, next, {
              allowSnap: !event.evt.altKey,
            });
          }}
          onTransform={(event) => {
            const node = event.target;
            const scaleX = node.scaleX() || 1;
            const scaleY = node.scaleY() || 1;
            onElementTransform(element.id, {
              position_x: node.x(),
              position_y: node.y(),
              width: rectWidth * scaleX,
              height: rectHeight * scaleY,
              rotation: node.rotation(),
            });
          }}
          onTransformEnd={(event) => {
            const node = event.target;
            const scaleX = node.scaleX() || 1;
            const scaleY = node.scaleY() || 1;
            const nextWidth = rectWidth * scaleX;
            const nextHeight = rectHeight * scaleY;
            node.scaleX(1);
            node.scaleY(1);
            onElementTransformEnd(element.id, {
              position_x: node.x(),
              position_y: node.y(),
              width: nextWidth,
              height: nextHeight,
              rotation: node.rotation(),
            });
          }}
        >
          <Rect
            x={0}
            y={0}
            width={rectWidth}
            height={rectHeight}
            stroke={element.style.stroke}
            strokeWidth={element.style.strokeWidth}
            fill={element.style.fill}
          />
          {isSelected && (
            <Rect
              x={-selectionPadding}
              y={-selectionPadding}
              width={rectWidth + selectionPadding * 2}
              height={rectHeight + selectionPadding * 2}
              stroke={SELECTION_STROKE}
              strokeWidth={selectionStrokeWidth}
              dash={selectionDash}
              listening={false}
            />
          )}
        </Group>
      );
    }
    if (element.properties.shapeType === "circle") {
      const radius = Math.hypot(element.width || 0, element.height || 0);
      const positionX = coerceNumber(element.position_x, 0);
      const positionY = coerceNumber(element.position_y, 0);
      return (
        <Group
          x={positionX}
          y={positionY}
          draggable={isDragEnabled && !isLocked}
          rotation={element.rotation ?? 0}
          ref={handleRef}
          onDragMove={(event) => {
            const node = event.target;
            onElementDragMove(
              element.id,
              { x: node.x(), y: node.y() },
              {
                allowSnap: !event.evt.altKey,
              },
            );
          }}
          onDragEnd={(event) => {
            const node = event.target;
            onElementDragEnd(
              element.id,
              { x: node.x(), y: node.y() },
              {
                allowSnap: !event.evt.altKey,
              },
            );
          }}
          onTransform={(event) => {
            const node = event.target;
            const scaleX = node.scaleX() || 1;
            const scaleY = node.scaleY() || 1;
            onElementTransform(element.id, {
              position_x: node.x(),
              position_y: node.y(),
              width: (element.width || 1) * scaleX,
              height: (element.height || 1) * scaleY,
              rotation: node.rotation(),
            });
          }}
          onTransformEnd={(event) => {
            const node = event.target;
            const scaleX = node.scaleX() || 1;
            const scaleY = node.scaleY() || 1;
            const nextWidth = (element.width || 1) * scaleX;
            const nextHeight = (element.height || 1) * scaleY;
            node.scaleX(1);
            node.scaleY(1);
            onElementTransformEnd(element.id, {
              position_x: node.x(),
              position_y: node.y(),
              width: nextWidth,
              height: nextHeight,
              rotation: node.rotation(),
            });
          }}
        >
          <Circle
            x={0}
            y={0}
            radius={radius}
            stroke={element.style.stroke}
            strokeWidth={element.style.strokeWidth}
            fill={element.style.fill}
          />
          {isSelected && (
            <Circle
              x={0}
              y={0}
              radius={radius + selectionPadding}
              stroke={SELECTION_STROKE}
              strokeWidth={selectionStrokeWidth}
              dash={selectionDash}
              listening={false}
            />
          )}
        </Group>
      );
    }
  }

  if (element.element_type === "Drawing") {
    const points = element.properties.points;
    if (!Array.isArray(points) || !isValidDrawingPoints(points)) {
      warnInvalidElementOnce(element, "invalid drawing points");
      return null;
    }
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    return (
      <Group
        x={positionX}
        y={positionY}
        draggable={isDragEnabled && !isLocked}
        onDragMove={(event) => {
          const node = event.target;
          onElementDragMove(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
        onDragEnd={(event) => {
          const node = event.target;
          onDrawingDragEnd(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
      >
        <Line
          points={points}
          stroke={element.style.stroke}
          strokeWidth={element.style.strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
        {isSelected && (
          <Line
            points={points}
            stroke={SELECTION_STROKE}
            strokeWidth={(element.style.strokeWidth ?? 1) + selectionStrokeWidth}
            lineCap="round"
            lineJoin="round"
            dash={selectionDash}
            listening={false}
          />
        )}
      </Group>
    );
  }

  if (element.element_type === "Text") {
    const content = element.properties.content || "";
    const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
    const { width: textWidth, height: textHeight } = getTextMetrics(
      content,
      fontSize,
    );
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    return (
      <Group
        x={positionX}
        y={positionY}
        draggable={isDragEnabled && !isLocked}
        rotation={element.rotation ?? 0}
        ref={handleRef}
        onDragMove={(event) => {
          const node = event.target;
          onElementDragMove(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
        onDragEnd={(event) => {
          const node = event.target;
          onElementDragEnd(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
        onTransform={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          const scale = Math.max(scaleX, scaleY);
          const nextFontSize = Math.max(1, fontSize * scale);
          const metrics = getTextMetrics(content, nextFontSize);
          onElementTransform(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: metrics.width,
            height: metrics.height,
            rotation: node.rotation(),
            font_size: nextFontSize,
          });
        }}
        onTransformEnd={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          const scale = Math.max(scaleX, scaleY);
          const nextFontSize = Math.max(1, fontSize * scale);
          const metrics = getTextMetrics(content, nextFontSize);
          node.scaleX(1);
          node.scaleY(1);
          onElementTransformEnd(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: metrics.width,
            height: metrics.height,
            rotation: node.rotation(),
            font_size: nextFontSize,
          });
        }}
      >
        <KonvaText
          x={0}
          y={0}
          text={content}
          fontSize={fontSize}
          fill={element.style.fill}
          onDblClick={(event) => {
            event.cancelBubble = true;
            if (isLocked) return;
            onOpenTextEditor({
              x: positionX,
              y: positionY,
              value: content,
              elementId: element.id,
              fontSize,
              color: element.style.fill ?? DEFAULT_TEXT_STYLE.fill,
              elementType: "Text",
              backgroundColor: undefined,
            });
          }}
        />
        {isSelected && (
          <Rect
            x={-selectionPadding}
            y={-selectionPadding}
            width={textWidth + selectionPadding * 2}
            height={textHeight + selectionPadding * 2}
            stroke={SELECTION_STROKE}
            strokeWidth={selectionStrokeWidth}
            dash={selectionDash}
            listening={false}
          />
        )}
      </Group>
    );
  }

  if (element.element_type === "StickyNote") {
    const content = element.properties.content || "";
    const fontSize = element.style.fontSize ?? 16;
    const padding = 12;
    const editorWidth = Math.max(0, rectWidth - padding * 2);
    const editorHeight = Math.max(0, rectHeight - padding * 2);
    return (
      <Group
        x={rectX}
        y={rectY}
        draggable={isDragEnabled && !isLocked}
        rotation={element.rotation ?? 0}
        ref={handleRef}
        onDragMove={(event) => {
          const node = event.target;
          onElementDragMove(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
        onDblClick={(event) => {
          event.cancelBubble = true;
          if (isLocked) return;
          onOpenTextEditor({
            x: rectX + padding,
            y: rectY + padding,
            value: content,
            elementId: element.id,
            fontSize,
            color: element.style.textColor ?? "#1F2937",
            elementType: "StickyNote",
            backgroundColor: element.style.fill ?? "#FDE68A",
            editorWidth,
            editorHeight,
          });
        }}
        onDragEnd={(event) => {
          const node = event.target;
          onElementDragEnd(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
        onTransform={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          onElementTransform(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: rectWidth * scaleX,
            height: rectHeight * scaleY,
            rotation: node.rotation(),
          });
        }}
        onTransformEnd={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          const nextWidth = rectWidth * scaleX;
          const nextHeight = rectHeight * scaleY;
          node.scaleX(1);
          node.scaleY(1);
          onElementTransformEnd(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: nextWidth,
            height: nextHeight,
            rotation: node.rotation(),
          });
        }}
      >
        <Rect
          x={0}
          y={0}
          width={rectWidth}
          height={rectHeight}
          fill={element.style.fill}
          stroke={element.style.stroke}
          strokeWidth={element.style.strokeWidth}
          cornerRadius={element.style.cornerRadius ?? 12}
        />
        <KonvaText
          x={padding}
          y={padding}
          width={Math.max(0, rectWidth - padding * 2)}
          height={Math.max(0, rectHeight - padding * 2)}
          text={content}
          fontSize={fontSize}
          fill={element.style.textColor ?? "#1F2937"}
        />
        {isSelected && (
          <Rect
            x={-selectionPadding}
            y={-selectionPadding}
            width={rectWidth + selectionPadding * 2}
            height={rectHeight + selectionPadding * 2}
            stroke={SELECTION_STROKE}
            strokeWidth={selectionStrokeWidth}
            dash={selectionDash}
            listening={false}
          />
        )}
      </Group>
    );
  }

  if (element.element_type === "Connector") {
    const rawPoints = resolveConnectorPoints(element);
    if (!rawPoints || rawPoints.length < 4) return null;
    const baseX = rawPoints[0];
    const baseY = rawPoints[1];
    const points = rawPoints.map((value, index) =>
      value - (index % 2 === 0 ? baseX : baseY),
    );
    const roundedPath = buildRoundedPath(points, CONNECTOR_CORNER_RADIUS);

    return (
      <Group
        x={baseX}
        y={baseY}
        draggable={isDragEnabled && !isLocked}
        onDragMove={(event) => {
          const node = event.target;
          onElementDragMove(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
        onDragEnd={(event) => {
          const node = event.target;
          onElementDragEnd(
            element.id,
            { x: node.x(), y: node.y() },
            {
              allowSnap: !event.evt.altKey,
            },
          );
        }}
      >
        {roundedPath ? (
          <Path
            data={roundedPath}
            stroke={element.style.stroke}
            strokeWidth={element.style.strokeWidth}
            lineCap="round"
            lineJoin="round"
            fillEnabled={false}
          />
        ) : (
          <Line
            points={points}
            stroke={element.style.stroke}
            strokeWidth={element.style.strokeWidth}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {isSelected && (
          roundedPath ? (
            <Path
              data={roundedPath}
              stroke={SELECTION_STROKE}
              strokeWidth={(element.style.strokeWidth ?? 1) + selectionStrokeWidth}
              lineCap="round"
              lineJoin="round"
              dash={selectionDash}
              listening={false}
              fillEnabled={false}
            />
          ) : (
            <Line
              points={points}
              stroke={SELECTION_STROKE}
              strokeWidth={(element.style.strokeWidth ?? 1) + selectionStrokeWidth}
              lineCap="round"
              lineJoin="round"
              dash={selectionDash}
              listening={false}
            />
          )
        )}
      </Group>
    );
  }

  if (element.element_type === "Frame") {
    const title = element.properties.title ?? "Frame";
    return (
      <Group
        x={rectX}
        y={rectY}
        draggable={isDragEnabled && !isLocked}
        rotation={element.rotation ?? 0}
        ref={handleRef}
        onDragMove={(event) => {
          const node = event.target;
          const next = resolveRectDragPosition(element, node.x(), node.y());
          onElementDragMove(element.id, next, {
            allowSnap: !event.evt.altKey,
          });
        }}
        onDragEnd={(event) => {
          const node = event.target;
          const next = resolveRectDragPosition(element, node.x(), node.y());
          onElementDragEnd(element.id, next, {
            allowSnap: !event.evt.altKey,
          });
        }}
        onTransform={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          onElementTransform(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: rectWidth * scaleX,
            height: rectHeight * scaleY,
            rotation: node.rotation(),
          });
        }}
        onTransformEnd={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          const nextWidth = rectWidth * scaleX;
          const nextHeight = rectHeight * scaleY;
          node.scaleX(1);
          node.scaleY(1);
          onElementTransformEnd(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: nextWidth,
            height: nextHeight,
            rotation: node.rotation(),
          });
        }}
      >
        <Rect
          x={0}
          y={0}
          width={rectWidth}
          height={rectHeight}
          fill={element.style.fill}
          stroke={element.style.stroke}
          strokeWidth={element.style.strokeWidth}
          dash={[10 / stageScale, 6 / stageScale]}
        />
        <KonvaText
          x={12}
          y={10}
          text={title}
          fontSize={14}
          fill={element.style.stroke ?? "#FBBF24"}
        />
        {isSelected && (
          <Rect
            x={-selectionPadding}
            y={-selectionPadding}
            width={rectWidth + selectionPadding * 2}
            height={rectHeight + selectionPadding * 2}
            stroke={SELECTION_STROKE}
            strokeWidth={selectionStrokeWidth}
            dash={selectionDash}
            listening={false}
          />
        )}
      </Group>
    );
  }

  if (
    element.element_type === "Image" ||
    element.element_type === "Video" ||
    element.element_type === "Embed" ||
    element.element_type === "Document" ||
    element.element_type === "Component"
  ) {
    const label = MEDIA_LABELS[element.element_type] ?? element.element_type;
    return (
      <Group
        x={rectX}
        y={rectY}
        draggable={isDragEnabled && !isLocked}
        rotation={element.rotation ?? 0}
        ref={handleRef}
        onDragMove={(event) => {
          const node = event.target;
          const next = resolveRectDragPosition(element, node.x(), node.y());
          onElementDragMove(element.id, next, {
            allowSnap: !event.evt.altKey,
          });
        }}
        onDragEnd={(event) => {
          const node = event.target;
          const next = resolveRectDragPosition(element, node.x(), node.y());
          onElementDragEnd(element.id, next, {
            allowSnap: !event.evt.altKey,
          });
        }}
        onTransform={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          onElementTransform(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: rectWidth * scaleX,
            height: rectHeight * scaleY,
            rotation: node.rotation(),
          });
        }}
        onTransformEnd={(event) => {
          const node = event.target;
          const scaleX = node.scaleX() || 1;
          const scaleY = node.scaleY() || 1;
          const nextWidth = rectWidth * scaleX;
          const nextHeight = rectHeight * scaleY;
          node.scaleX(1);
          node.scaleY(1);
          onElementTransformEnd(element.id, {
            position_x: node.x(),
            position_y: node.y(),
            width: nextWidth,
            height: nextHeight,
            rotation: node.rotation(),
          });
        }}
      >
        <Rect
          x={0}
          y={0}
          width={rectWidth}
          height={rectHeight}
          fill={element.style.fill}
          stroke={element.style.stroke}
          strokeWidth={element.style.strokeWidth}
          cornerRadius={element.style.cornerRadius ?? 12}
        />
        <KonvaText
          x={0}
          y={0}
          width={rectWidth}
          height={rectHeight}
          text={label}
          fontSize={14}
          fill="#E2E8F0"
          align="center"
          verticalAlign="middle"
        />
        {isSelected && (
          <Rect
            x={-selectionPadding}
            y={-selectionPadding}
            width={rectWidth + selectionPadding * 2}
            height={rectHeight + selectionPadding * 2}
            stroke={SELECTION_STROKE}
            strokeWidth={selectionStrokeWidth}
            dash={selectionDash}
            listening={false}
          />
        )}
      </Group>
    );
  }

  return null;
});

const SelectionOverlayLayer = memo(function SelectionOverlayLayer({
  selectionPresence,
  elements,
  selectionStrokeWidth,
  selectionDash,
  selectionPadding,
  stageScale,
}: SelectionOverlayLayerProps) {
  const selectionOverlays = useMemo(() => {
    if (selectionPresence.length === 0) return [];
    const elementMap = new Map(elements.map((element) => [element.id, element]));
    const overlays: SelectionOverlay[] = [];
    selectionPresence.forEach((presence) => {
      let labelUsed = false;
      presence.element_ids.forEach((elementId) => {
        const element = elementMap.get(elementId);
        if (!element) return;
        const isEditing = presence.editing?.element_id === elementId;
        overlays.push({
          key: `${presence.user_id}:${elementId}`,
          element,
          color: presence.color,
          label: !labelUsed ? presence.user_name : undefined,
          isEditing,
        });
        if (!labelUsed) {
          labelUsed = true;
        }
      });
    });
    return overlays;
  }, [elements, selectionPresence]);

  return (
    <>
      {selectionOverlays.map((overlay) => {
        const element = overlay.element;
        const overlayStrokeWidth = overlay.isEditing
          ? selectionStrokeWidth * 1.6
          : selectionStrokeWidth;
        const overlayDash = overlay.isEditing ? undefined : selectionDash;
        const bounds = getElementBounds(element);
        const labelFontSize = 11 / stageScale;
        const labelOffset = 6 / stageScale;
        const label =
          overlay.label && bounds ? (
            <KonvaText
              x={bounds.x}
              y={bounds.y - labelFontSize - labelOffset}
              text={overlay.label}
              fontSize={labelFontSize}
              fill={overlay.color}
              listening={false}
            />
          ) : null;

        if (element.element_type === "Drawing") {
          const points = element.properties.points;
          if (!Array.isArray(points) || !isValidDrawingPoints(points)) {
            warnInvalidElementOnce(element, "invalid drawing points");
            return label ? <Fragment key={overlay.key}>{label}</Fragment> : null;
          }
          const positionX = coerceNumber(element.position_x, 0);
          const positionY = coerceNumber(element.position_y, 0);
          return (
            <Fragment key={overlay.key}>
              <Line
                x={positionX}
                y={positionY}
                points={points}
                stroke={overlay.color}
                strokeWidth={(element.style.strokeWidth ?? 1) + overlayStrokeWidth}
                lineCap="round"
                lineJoin="round"
                dash={overlayDash}
                listening={false}
              />
              {label}
            </Fragment>
          );
        }

        if (element.element_type === "Connector") {
          const points = resolveConnectorPoints(element);
          if (!points || points.length < 4) {
            return label ? <Fragment key={overlay.key}>{label}</Fragment> : null;
          }
          return (
            <Fragment key={overlay.key}>
              <Line
                points={points}
                stroke={overlay.color}
                strokeWidth={(element.style.strokeWidth ?? 1) + overlayStrokeWidth}
                lineCap="round"
                lineJoin="round"
                dash={overlayDash}
                listening={false}
              />
              {label}
            </Fragment>
          );
        }

        if (
          element.element_type === "Shape" &&
          element.properties.shapeType === "circle"
        ) {
          const radius = Math.hypot(element.width || 0, element.height || 0);
          const positionX = coerceNumber(element.position_x, 0);
          const positionY = coerceNumber(element.position_y, 0);
          return (
            <Fragment key={overlay.key}>
              <Circle
                x={positionX}
                y={positionY}
                radius={radius + selectionPadding}
                stroke={overlay.color}
                strokeWidth={overlayStrokeWidth}
                dash={overlayDash}
                listening={false}
              />
              {label}
            </Fragment>
          );
        }

        if (element.element_type === "Text") {
          const content = element.properties.content || "";
          const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
          const { width: textWidth, height: textHeight } = getTextMetrics(
            content,
            fontSize,
          );
          const positionX = coerceNumber(element.position_x, 0);
          const positionY = coerceNumber(element.position_y, 0);
          return (
            <Fragment key={overlay.key}>
              <Group
                x={positionX}
                y={positionY}
                rotation={element.rotation ?? 0}
                listening={false}
              >
                <Rect
                  x={-selectionPadding}
                  y={-selectionPadding}
                  width={textWidth + selectionPadding * 2}
                  height={textHeight + selectionPadding * 2}
                  stroke={overlay.color}
                  strokeWidth={overlayStrokeWidth}
                  dash={overlayDash}
                  listening={false}
                />
              </Group>
              {label}
            </Fragment>
          );
        }

        const rectBounds = getRectBounds(element);
        return (
          <Fragment key={overlay.key}>
            <Group
              x={rectBounds.x}
              y={rectBounds.y}
              rotation={element.rotation ?? 0}
              listening={false}
            >
              <Rect
                x={-selectionPadding}
                y={-selectionPadding}
                width={rectBounds.width + selectionPadding * 2}
                height={rectBounds.height + selectionPadding * 2}
                stroke={overlay.color}
                strokeWidth={overlayStrokeWidth}
                dash={overlayDash}
                listening={false}
              />
            </Group>
            {label}
          </Fragment>
        );
      })}
    </>
  );
});

export function BoardCanvasStage({
  stageRef,
  width,
  height,
  stageScale,
  stagePosition,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
  onWheel,
  worldRect,
  backgroundColor,
  gridSize,
  gridEnabled,
  snapGuides,
  elements,
  ghostElement,
  selectedElementIds,
  selectionPresence,
  cursorList,
  localOverrideIds,
  lockedElementIds,
  isDragEnabled,
  onElementDragMove,
  onElementDragEnd,
  onElementTransform,
  onElementTransformEnd,
  onDrawingDragEnd,
  onOpenTextEditor,
}: BoardCanvasStageProps) {
  const selectionStrokeWidth = 2 / stageScale;
  const selectionDash = useMemo(
    () => [6 / stageScale, 4 / stageScale],
    [stageScale],
  );
  const selectionPadding = 6 / stageScale;
  const [transformerModifiers, setTransformerModifiers] = useState({
    keepRatio: false,
    centeredScaling: false,
  });
  const elementRefs = useRef<Map<string, Konva.Node>>(new Map());
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const hydratedRef = useRef(false);
  const knownElementIdsRef = useRef<Set<string>>(new Set());
  const pendingSpawnIdsRef = useRef<Set<string>>(new Set());
  const selectedSet = useMemo(
    () => new Set(selectedElementIds),
    [selectedElementIds],
  );
  const primarySelectedId =
    selectedElementIds.length === 1 ? selectedElementIds[0] : null;
  const canTransform = primarySelectedId
    ? !lockedElementIds.has(primarySelectedId)
    : false;
  const primarySelectedElement = useMemo(() => {
    if (!primarySelectedId) return null;
    return elements.find((element) => element.id === primarySelectedId) ?? null;
  }, [elements, primarySelectedId]);
  const forceKeepRatio = useMemo(() => {
    if (!primarySelectedElement) return false;
    if (primarySelectedElement.element_type === "Text") {
      return true;
    }
    return (
      primarySelectedElement.element_type === "Shape" &&
      primarySelectedElement.properties.shapeType === "circle"
    );
  }, [primarySelectedElement]);
  const keepRatio = transformerModifiers.keepRatio || forceKeepRatio;
  const centeredScaling = transformerModifiers.centeredScaling;
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const animateSpawn = useCallback(
    (node: Konva.Node) => {
      if (prefersReducedMotion) return;
      node.opacity(0);
      node.scale({ x: 0.96, y: 0.96 });
      node.to({
        opacity: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 0.18,
      });
    },
    [prefersReducedMotion],
  );

  const registerElementRef = useCallback(
    (id: string, node: Konva.Node | null) => {
      if (!node) {
        elementRefs.current.delete(id);
        return;
      }
      elementRefs.current.set(id, node);
      if (pendingSpawnIdsRef.current.has(id)) {
        pendingSpawnIdsRef.current.delete(id);
        animateSpawn(node);
      }
    },
    [animateSpawn],
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = canTransform && primarySelectedId
      ? elementRefs.current.get(primarySelectedId) ?? null
      : null;
    if (node) {
      transformer.nodes([node]);
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [canTransform, primarySelectedId]);
  useEffect(() => {
    if (!hydratedRef.current) {
      knownElementIdsRef.current = new Set(elements.map((element) => element.id));
      hydratedRef.current = true;
      return;
    }
    const nextIds = new Set(elements.map((element) => element.id));
    nextIds.forEach((id) => {
      if (!knownElementIdsRef.current.has(id)) {
        pendingSpawnIdsRef.current.add(id);
        const node = elementRefs.current.get(id);
        if (node) {
          pendingSpawnIdsRef.current.delete(id);
          animateSpawn(node);
        }
      }
    });
    knownElementIdsRef.current = nextIds;
  }, [animateSpawn, elements]);
  useEffect(() => {
    const updateModifiers = (event: KeyboardEvent) => {
      setTransformerModifiers({
        keepRatio: event.shiftKey,
        centeredScaling: event.altKey,
      });
    };
    const resetModifiers = () => {
      setTransformerModifiers({ keepRatio: false, centeredScaling: false });
    };
    window.addEventListener("keydown", updateModifiers, { passive: true });
    window.addEventListener("keyup", updateModifiers, { passive: true });
    window.addEventListener("blur", resetModifiers);
    return () => {
      window.removeEventListener("keydown", updateModifiers);
      window.removeEventListener("keyup", updateModifiers);
      window.removeEventListener("blur", resetModifiers);
    };
  }, []);
  const renderElements = useMemo(() => {
    if (cursorList.length === 0) return elements;
    const elementMap = new Map(elements.map((element) => [element.id, element]));
    const overrides = new Map<string, BoardElement>();
    const EPSILON = 0.5; // Threshold for position changes to reduce flickering

    cursorList.forEach((cursor) => {
      const drag = cursor.dragging;
      if (!drag) return;
      const element = elementMap.get(drag.element_id);
      if (!element) return;
      if (localOverrideIds.has(drag.element_id)) return;

      // Check if changes are significant enough to warrant an update
      const hasSignificantChange =
        (typeof drag.position_x === "number" && Math.abs(element.position_x - drag.position_x) > EPSILON) ||
        (typeof drag.position_y === "number" && Math.abs(element.position_y - drag.position_y) > EPSILON) ||
        (typeof drag.width === "number" && Math.abs(element.width - drag.width) > EPSILON) ||
        (typeof drag.height === "number" && Math.abs(element.height - drag.height) > EPSILON) ||
        (typeof drag.rotation === "number" && Math.abs((element.rotation ?? 0) - drag.rotation) > EPSILON);

      if (!hasSignificantChange) return;

      const next = { ...element };
      if (typeof drag.position_x === "number") {
        next.position_x = drag.position_x;
      }
      if (typeof drag.position_y === "number") {
        next.position_y = drag.position_y;
      }
      if (typeof drag.width === "number") {
        next.width = drag.width;
      }
      if (typeof drag.height === "number") {
        next.height = drag.height;
      }
      if (typeof drag.rotation === "number") {
        next.rotation = drag.rotation;
      }
      overrides.set(drag.element_id, next);
    });
    if (overrides.size === 0) return elements;
    return elements.map((element) => overrides.get(element.id) ?? element);
  }, [cursorList, elements, localOverrideIds]);
  const visibleCursors = useMemo(
    () => cursorList.filter((cursor) => cursor.x !== null && cursor.y !== null),
    [cursorList],
  );

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      scaleX={stageScale}
      scaleY={stageScale}
      x={stagePosition.x}
      y={stagePosition.y}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onWheel={onWheel}
    >
      <Layer>
        <Rect
          x={worldRect.x}
          y={worldRect.y}
          width={worldRect.width}
          height={worldRect.height}
          fill={backgroundColor}
          listening={false}
        />
        <BoardGrid
          gridSize={gridSize}
          gridEnabled={gridEnabled}
          worldRect={worldRect}
          stageScale={stageScale}
        />

        {renderElements.map((element) => (
          <ElementRenderer
            key={element.id}
            element={element}
            isSelected={selectedSet.has(element.id)}
            isLocked={lockedElementIds.has(element.id)}
            isDragEnabled={isDragEnabled}
            selectionStrokeWidth={selectionStrokeWidth}
            selectionDash={selectionDash}
            selectionPadding={selectionPadding}
            stageScale={stageScale}
            registerElementRef={registerElementRef}
            onElementDragMove={onElementDragMove}
            onElementDragEnd={onElementDragEnd}
            onElementTransform={onElementTransform}
            onElementTransformEnd={onElementTransformEnd}
            onDrawingDragEnd={onDrawingDragEnd}
            onOpenTextEditor={onOpenTextEditor}
          />
        ))}

        {ghostElement && (
          <GhostElementRenderer
            element={ghostElement}
            stageScale={stageScale}
          />
        )}

        <SelectionOverlayLayer
          selectionPresence={selectionPresence}
          elements={renderElements}
          selectionStrokeWidth={selectionStrokeWidth}
          selectionDash={selectionDash}
          selectionPadding={selectionPadding}
          stageScale={stageScale}
        />

        {snapGuides.map((guide, index) => {
          const points =
            guide.orientation === "vertical"
              ? [guide.position, guide.start, guide.position, guide.end]
              : [guide.start, guide.position, guide.end, guide.position];
          return (
            <Line
              key={`snap-${index}`}
              points={points}
              stroke={
                guide.orientation === "vertical"
                  ? SNAP_GUIDE_COLORS.vertical
                  : SNAP_GUIDE_COLORS.horizontal
              }
              strokeWidth={1.5 / stageScale}
              listening={false}
            />
          );
        })}

        {visibleCursors.map((cursor) => (
          <CursorMarker key={cursor.client_id} cursor={cursor} />
        ))}

        {primarySelectedId && canTransform && (
          <Transformer
            ref={transformerRef}
            rotateEnabled
            keepRatio={keepRatio}
            centeredScaling={centeredScaling}
            enabledAnchors={[
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
            ]}
            boundBoxFunc={(oldBox, newBox) => {
              if (
                newBox.width < MIN_TRANSFORM_SIZE ||
                newBox.height < MIN_TRANSFORM_SIZE
              ) {
                return oldBox;
              }
              return newBox;
            }}
          />
        )}
      </Layer>
    </Stage>
  );
}
