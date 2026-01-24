import { Fragment, memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { Application, extend, useApplication, useTick } from "@pixi/react";
import {
  Container as PixiContainer,
  FederatedPointerEvent,
  Graphics as PixiGraphics,
  Rectangle,
  Text as PixiText,
} from "pixi.js";
import type { BoardElement } from "@/types/board";
import type { CursorBroadcast, SelectionPresence } from "@/features/boards/types";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import type { SnapGuide } from "@/features/boards/elementMove.utils";
import { getElementBounds, getAnchorPosition } from "@/features/boards/elementMove.utils";
import { normalizeOrthogonalPoints } from "@/features/boards/boardCanvas/connectorRouting";
import type { CanvasPointerEvent, CanvasWheelEvent } from "@/features/boards/boardCanvas.hooks";

extend({
  Container: PixiContainer,
  Graphics: PixiGraphics,
  Text: PixiText,
});

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
  stageRef: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  stageScale: number;
  stagePosition: { x: number; y: number };
  onMouseDown: (event: CanvasPointerEvent) => void;
  onMouseMove: (event: CanvasPointerEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onWheel: (event: CanvasWheelEvent) => void;
  worldRect: { x: number; y: number; width: number; height: number };
  backgroundColor: string;
  gridLines: Array<{ points: number[]; major: boolean }>;
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

const CURSOR_SMOOTHING = 0.2;
const MIN_TRANSFORM_SIZE = 12;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const SELECTION_STROKE = "#60A5FA";
const SNAP_GUIDE_COLORS = {
  vertical: "#7DD3FC",
  horizontal: "#F472B6",
};

const coerceNumber = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value) ? (value as number) : fallback;

const clampColor = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 && value <= 0xffffff ? value : fallback;

const parseColor = (value?: string, fallback = 0x000000) => {
  if (!value) return fallback;
  if (value.startsWith("#")) {
    return clampColor(Number.parseInt(value.slice(1), 16), fallback);
  }
  if (value.startsWith("rgb")) {
    const parts = value.match(/\d+(\.\d+)?/g);
    if (!parts || parts.length < 3) return fallback;
    const [r, g, b] = parts.map((part) => Math.max(0, Math.min(255, Number(part))));
    return clampColor((r << 16) + (g << 8) + b, fallback);
  }
  const hex = Number.parseInt(value.replace(/[^0-9A-Fa-f]/g, ""), 16);
  return clampColor(Number.isFinite(hex) ? hex : fallback, fallback);
};

const isValidDrawingPoints = (points: number[]) =>
  points.length >= 4 && points.every((value) => Number.isFinite(value));

const isValidPointArray = (points: number[]) =>
  points.length >= 2 && points.every((value) => Number.isFinite(value));

const buildOrthogonalFallbackPoints = (start: { x: number; y: number }, end: { x: number; y: number }) =>
  [start.x, start.y, end.x, start.y, end.x, end.y];

const getRectBounds = (element: BoardElement) => {
  const width = coerceNumber(element.width, 0);
  const height = coerceNumber(element.height, 0);
  const x = coerceNumber(element.position_x, 0) + Math.min(0, width);
  const y = coerceNumber(element.position_y, 0) + Math.min(0, height);
  return {
    x,
    y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
};

const toRectBounds = (bounds: { left: number; right: number; top: number; bottom: number }) => ({
  x: bounds.left,
  y: bounds.top,
  width: bounds.right - bounds.left,
  height: bounds.bottom - bounds.top,
});

const resolveConnectorEndpoints = (element: BoardElement) => {
  if (element.element_type !== "Connector") return null;
  const start = element.properties?.start;
  const end = element.properties?.end;
  if (!start || !end) return null;
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) {
    return null;
  }
  return { start, end };
};

const resolveConnectorPoints = (element: BoardElement) => {
  if (element.element_type !== "Connector") return null;
  const storedPoints = element.properties?.points;
  if (Array.isArray(storedPoints)) {
    if (!isValidPointArray(storedPoints)) return null;
    return normalizeOrthogonalPoints(storedPoints);
  }
  const endpoints = resolveConnectorEndpoints(element);
  if (!endpoints) return null;
  return buildOrthogonalFallbackPoints(endpoints.start, endpoints.end);
};

const setStrokeStyle = (graphics: PixiGraphics, width: number, color: number, alpha = 1) => {
  graphics.setStrokeStyle({ width, color, alpha, alignment: 0.5 });
};

const setFillStyle = (graphics: PixiGraphics, color: number, alpha = 1) => {
  graphics.setFillStyle({ color, alpha });
};

const drawPolyline = (graphics: PixiGraphics, points: number[], strokeWidth: number, strokeColor: number) => {
  if (points.length < 4) return;
  setStrokeStyle(graphics, strokeWidth, strokeColor);
  graphics.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    graphics.lineTo(points[i], points[i + 1]);
  }
  graphics.stroke();
};

const CursorMarker = memo(function CursorMarker({ cursor }: { cursor: CursorBroadcast }) {
  const groupRef = useRef<PixiContainer | null>(null);
  const targetRef = useRef({ x: cursor.x ?? 0, y: cursor.y ?? 0 });
  useEffect(() => {
    targetRef.current = { x: cursor.x ?? 0, y: cursor.y ?? 0 };
  }, [cursor.x, cursor.y]);
  useTick(() => {
    const node = groupRef.current;
    if (!node) return;
    node.position.set(
      node.position.x + (targetRef.current.x - node.position.x) * CURSOR_SMOOTHING,
      node.position.y + (targetRef.current.y - node.position.y) * CURSOR_SMOOTHING,
    );
  });
  return (
    <pixiContainer ref={groupRef} x={cursor.x ?? 0} y={cursor.y ?? 0} eventMode="passive">
      <pixiGraphics
        draw={(graphics) => {
          graphics.clear();
          setFillStyle(graphics, parseColor(cursor.color, 0xffffff));
          setStrokeStyle(graphics, 1, 0x171717);
          graphics.circle(0, 0, 4);
          graphics.fill();
          graphics.stroke();
        }}
      />
      <pixiText
        text={cursor.user_name}
        x={-10}
        y={10}
        style={{
          fontSize: 11,
          fill: cursor.color,
        }}
      />
    </pixiContainer>
  );
});

const buildCanvasPointerEvent = (
  event: FederatedPointerEvent,
  viewportRef: React.MutableRefObject<PixiContainer | null>,
): CanvasPointerEvent => {
  const screen = { x: event.global.x, y: event.global.y };
  const viewport = viewportRef.current;
  const worldPoint = viewport ? viewport.toLocal(event.global) : event.global;
  return {
    screen,
    world: { x: worldPoint.x, y: worldPoint.y },
    button: event.button ?? 0,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    originalEvent: event.originalEvent as unknown as MouseEvent | PointerEvent,
  };
};

const rotatePoint = (point: { x: number; y: number }, angle: number) => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});

function PixiScene({
  stageScale,
  stagePosition,
  worldRect,
  backgroundColor,
  gridLines,
  snapGuides,
  elements,
  ghostElement,
  selectedElementIds,
  selectionPresence,
  cursorList,
  localOverrideIds,
  lockedElementIds,
  isDragEnabled,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onElementDragMove,
  onElementDragEnd,
  onElementTransform,
  onElementTransformEnd,
  onDrawingDragEnd,
  onOpenTextEditor,
}: Omit<BoardCanvasStageProps, "stageRef" | "onMouseLeave" | "onWheel">) {
  const { app } = useApplication();
  const viewportRef = useRef<PixiContainer | null>(null);
  const elementRefs = useRef<Map<string, PixiContainer>>(new Map());
  const transformStateRef = useRef<{
    id: string;
    pointerId: number;
    kind: "resize" | "rotate";
    handle?: "nw" | "ne" | "se" | "sw";
    origin: { x: number; y: number };
    width: number;
    height: number;
    rotation: number;
    startAngle?: number;
    center?: { x: number; y: number };
    fontSize?: number;
    element: BoardElement;
  } | null>(null);
  const dragStateRef = useRef<{
    id: string;
    pointerId: number;
    offset: { x: number; y: number };
  } | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  const selectedSet = useMemo(
    () => new Set(selectedElementIds),
    [selectedElementIds],
  );
  const primarySelectedId =
    selectedElementIds.length === 1 ? selectedElementIds[0] : null;
  const canTransform = primarySelectedId
    ? !lockedElementIds.has(primarySelectedId)
    : false;
  const elementMap = useMemo(
    () => new Map(elements.map((element) => [element.id, element])),
    [elements],
  );
  const primarySelectedElement = primarySelectedId ? elementMap.get(primarySelectedId) : null;

  const renderElements = useMemo(() => {
    if (cursorList.length === 0) return elements;
    const overrides = new Map<string, BoardElement>();
    const EPSILON = 0.5;
    cursorList.forEach((cursor) => {
      const drag = cursor.dragging;
      if (!drag) return;
      if (localOverrideIds.has(drag.element_id)) return;
      const element = elementMap.get(drag.element_id);
      if (!element) return;
      const hasSignificantChange =
        (typeof drag.position_x === "number"
          && Math.abs(element.position_x - drag.position_x) > EPSILON)
        || (typeof drag.position_y === "number"
          && Math.abs(element.position_y - drag.position_y) > EPSILON)
        || (typeof drag.width === "number"
          && Math.abs(element.width - drag.width) > EPSILON)
        || (typeof drag.height === "number"
          && Math.abs(element.height - drag.height) > EPSILON)
        || (typeof drag.rotation === "number"
          && Math.abs((element.rotation ?? 0) - drag.rotation) > EPSILON);
      if (!hasSignificantChange) return;
      const next = { ...element };
      if (typeof drag.position_x === "number") next.position_x = drag.position_x;
      if (typeof drag.position_y === "number") next.position_y = drag.position_y;
      if (typeof drag.width === "number") next.width = drag.width;
      if (typeof drag.height === "number") next.height = drag.height;
      if (typeof drag.rotation === "number") next.rotation = drag.rotation;
      overrides.set(drag.element_id, next);
    });
    if (overrides.size === 0) return elements;
    return elements.map((element) => overrides.get(element.id) ?? element);
  }, [cursorList, elementMap, elements, localOverrideIds]);

  const selectionStrokeWidth = 2 / stageScale;
  const selectionPadding = 6 / stageScale;
  const snapStrokeWidth = 1.5 / stageScale;
  const handleSize = 8 / stageScale;
  const rotateHandleOffset = 20 / stageScale;

  const registerElementRef = useCallback(
    (id: string, node: PixiContainer | null) => {
      if (!node) {
        elementRefs.current.delete(id);
        return;
      }
      elementRefs.current.set(id, node);
    },
    [],
  );

  useEffect(() => {
    if (!app || !viewportRef.current) return;
  }, [app]);

  const handlePointerMove = useCallback(
    (event: FederatedPointerEvent) => {
      const transformState = transformStateRef.current;
      if (transformState && transformState.pointerId === event.pointerId) {
        const canvasEvent = buildCanvasPointerEvent(event, viewportRef);
        const rotationRad = transformState.rotation * DEG_TO_RAD;
        if (transformState.kind === "rotate") {
          const center = transformState.center;
          if (!center || typeof transformState.startAngle !== "number") return;
          const angle = Math.atan2(
            canvasEvent.world.y - center.y,
            canvasEvent.world.x - center.x,
          );
          const nextRotation = transformState.rotation + (angle - transformState.startAngle) * RAD_TO_DEG;
          onElementTransform(transformState.id, {
            position_x: transformState.element.position_x,
            position_y: transformState.element.position_y,
            width: transformState.element.width,
            height: transformState.element.height,
            rotation: nextRotation,
          });
          return;
        }
        if (!transformState.handle) return;
        const local = rotatePoint(
          {
            x: canvasEvent.world.x - transformState.origin.x,
            y: canvasEvent.world.y - transformState.origin.y,
          },
          -rotationRad,
        );
        const opposite = (() => {
          switch (transformState.handle) {
            case "nw":
              return { x: transformState.width, y: transformState.height };
            case "ne":
              return { x: 0, y: transformState.height };
            case "sw":
              return { x: transformState.width, y: 0 };
            case "se":
            default:
              return { x: 0, y: 0 };
          }
        })();
        let minX = Math.min(local.x, opposite.x);
        let maxX = Math.max(local.x, opposite.x);
        let minY = Math.min(local.y, opposite.y);
        let maxY = Math.max(local.y, opposite.y);
        if (maxX - minX < MIN_TRANSFORM_SIZE) {
          if (local.x < opposite.x) {
            minX = maxX - MIN_TRANSFORM_SIZE;
          } else {
            maxX = minX + MIN_TRANSFORM_SIZE;
          }
        }
        if (maxY - minY < MIN_TRANSFORM_SIZE) {
          if (local.y < opposite.y) {
            minY = maxY - MIN_TRANSFORM_SIZE;
          } else {
            maxY = minY + MIN_TRANSFORM_SIZE;
          }
        }
        const nextOrigin = rotatePoint({ x: minX, y: minY }, rotationRad);
        const nextWidth = maxX - minX;
        const nextHeight = maxY - minY;
        const updatedOrigin = {
          x: transformState.origin.x + nextOrigin.x,
          y: transformState.origin.y + nextOrigin.y,
        };
        const element = transformState.element;
        if (element.element_type === "Shape" && element.properties.shapeType === "circle") {
          const startRadius = Math.max(1, Math.hypot(transformState.width, transformState.height) / 2);
          const nextRadius = Math.max(MIN_TRANSFORM_SIZE / 2, Math.max(nextWidth, nextHeight) / 2);
          const scale = nextRadius / startRadius;
          const nextCenter = rotatePoint(
            { x: minX + nextWidth / 2, y: minY + nextHeight / 2 },
            rotationRad,
          );
          onElementTransform(transformState.id, {
            position_x: transformState.origin.x + nextCenter.x,
            position_y: transformState.origin.y + nextCenter.y,
            width: element.width * scale,
            height: element.height * scale,
            rotation: transformState.rotation,
          });
          return;
        }
        const payload: {
          position_x: number;
          position_y: number;
          width: number;
          height: number;
          rotation: number;
          font_size?: number;
        } = {
          position_x: updatedOrigin.x,
          position_y: updatedOrigin.y,
          width: nextWidth,
          height: nextHeight,
          rotation: transformState.rotation,
        };
        if (element.element_type === "Text" || element.element_type === "StickyNote") {
          if (transformState.fontSize && transformState.height > 0) {
            payload.font_size = Math.max(6, (transformState.fontSize * nextHeight) / transformState.height);
          }
        }
        onElementTransform(transformState.id, payload);
        return;
      }
      const canvasEvent = buildCanvasPointerEvent(event, viewportRef);
      if (dragStateRef.current) {
        const dragState = dragStateRef.current;
        if (dragState.pointerId !== event.pointerId) return;
        const element = elementMap.get(dragState.id);
        if (!element) return;
        const next = {
          x: canvasEvent.world.x - dragState.offset.x,
          y: canvasEvent.world.y - dragState.offset.y,
        };
        onElementDragMove(dragState.id, next, { allowSnap: !canvasEvent.altKey });
        return;
      }
      onMouseMove(canvasEvent);
    },
    [elementMap, onElementDragMove, onElementTransform, onMouseMove],
  );

  const handlePointerUp = useCallback(
    (event: FederatedPointerEvent) => {
      const transformState = transformStateRef.current;
      if (transformState && transformState.pointerId === event.pointerId) {
        const canvasEvent = buildCanvasPointerEvent(event, viewportRef);
        const rotationRad = transformState.rotation * DEG_TO_RAD;
        if (transformState.kind === "rotate") {
          const center = transformState.center;
          if (!center || typeof transformState.startAngle !== "number") return;
          const angle = Math.atan2(
            canvasEvent.world.y - center.y,
            canvasEvent.world.x - center.x,
          );
          const nextRotation = transformState.rotation + (angle - transformState.startAngle) * RAD_TO_DEG;
          onElementTransformEnd(transformState.id, {
            position_x: transformState.element.position_x,
            position_y: transformState.element.position_y,
            width: transformState.element.width,
            height: transformState.element.height,
            rotation: nextRotation,
          });
          transformStateRef.current = null;
          onMouseUp();
          return;
        }
        if (!transformState.handle) return;
        const local = rotatePoint(
          {
            x: canvasEvent.world.x - transformState.origin.x,
            y: canvasEvent.world.y - transformState.origin.y,
          },
          -rotationRad,
        );
        const opposite = (() => {
          switch (transformState.handle) {
            case "nw":
              return { x: transformState.width, y: transformState.height };
            case "ne":
              return { x: 0, y: transformState.height };
            case "sw":
              return { x: transformState.width, y: 0 };
            case "se":
            default:
              return { x: 0, y: 0 };
          }
        })();
        let minX = Math.min(local.x, opposite.x);
        let maxX = Math.max(local.x, opposite.x);
        let minY = Math.min(local.y, opposite.y);
        let maxY = Math.max(local.y, opposite.y);
        if (maxX - minX < MIN_TRANSFORM_SIZE) {
          if (local.x < opposite.x) {
            minX = maxX - MIN_TRANSFORM_SIZE;
          } else {
            maxX = minX + MIN_TRANSFORM_SIZE;
          }
        }
        if (maxY - minY < MIN_TRANSFORM_SIZE) {
          if (local.y < opposite.y) {
            minY = maxY - MIN_TRANSFORM_SIZE;
          } else {
            maxY = minY + MIN_TRANSFORM_SIZE;
          }
        }
        const nextOrigin = rotatePoint({ x: minX, y: minY }, rotationRad);
        const nextWidth = maxX - minX;
        const nextHeight = maxY - minY;
        const updatedOrigin = {
          x: transformState.origin.x + nextOrigin.x,
          y: transformState.origin.y + nextOrigin.y,
        };
        const element = transformState.element;
        if (element.element_type === "Shape" && element.properties.shapeType === "circle") {
          const startRadius = Math.max(1, Math.hypot(transformState.width, transformState.height) / 2);
          const nextRadius = Math.max(MIN_TRANSFORM_SIZE / 2, Math.max(nextWidth, nextHeight) / 2);
          const scale = nextRadius / startRadius;
          const nextCenter = rotatePoint(
            { x: minX + nextWidth / 2, y: minY + nextHeight / 2 },
            rotationRad,
          );
          onElementTransformEnd(transformState.id, {
            position_x: transformState.origin.x + nextCenter.x,
            position_y: transformState.origin.y + nextCenter.y,
            width: element.width * scale,
            height: element.height * scale,
            rotation: transformState.rotation,
          });
          transformStateRef.current = null;
          onMouseUp();
          return;
        }
        const payload: {
          position_x: number;
          position_y: number;
          width: number;
          height: number;
          rotation: number;
          font_size?: number;
        } = {
          position_x: updatedOrigin.x,
          position_y: updatedOrigin.y,
          width: nextWidth,
          height: nextHeight,
          rotation: transformState.rotation,
        };
        if (element.element_type === "Text" || element.element_type === "StickyNote") {
          if (transformState.fontSize && transformState.height > 0) {
            payload.font_size = Math.max(6, (transformState.fontSize * nextHeight) / transformState.height);
          }
        }
        onElementTransformEnd(transformState.id, payload);
        transformStateRef.current = null;
        onMouseUp();
        return;
      }
      const canvasEvent = buildCanvasPointerEvent(event, viewportRef);
      const dragState = dragStateRef.current;
      if (dragState && dragState.pointerId === event.pointerId) {
        const element = elementMap.get(dragState.id);
        if (element) {
          const next = {
            x: canvasEvent.world.x - dragState.offset.x,
            y: canvasEvent.world.y - dragState.offset.y,
          };
          if (element.element_type === "Drawing") {
            onDrawingDragEnd(dragState.id, next, { allowSnap: !canvasEvent.altKey });
          } else {
            onElementDragEnd(dragState.id, next, { allowSnap: !canvasEvent.altKey });
          }
        }
        dragStateRef.current = null;
      }
      onMouseUp();
    },
    [
      elementMap,
      onDrawingDragEnd,
      onElementDragEnd,
      onElementTransformEnd,
      onMouseUp,
    ],
  );

  const handlePointerDown = useCallback(
    (event: FederatedPointerEvent) => {
      const canvasEvent = buildCanvasPointerEvent(event, viewportRef);
      onMouseDown(canvasEvent);
    },
    [onMouseDown],
  );

  const handleElementPointerDown = useCallback(
    (event: FederatedPointerEvent, element: BoardElement) => {
      const canvasEvent = buildCanvasPointerEvent(event, viewportRef);
      onMouseDown(canvasEvent);
      if (!isDragEnabled || lockedElementIds.has(element.id)) return;
      const anchor = getAnchorPosition(element);
      dragStateRef.current = {
        id: element.id,
        pointerId: event.pointerId,
        offset: {
          x: canvasEvent.world.x - anchor.x,
          y: canvasEvent.world.y - anchor.y,
        },
      };
    },
    [isDragEnabled, lockedElementIds, onMouseDown],
  );

  const beginResize = useCallback(
    (event: FederatedPointerEvent, element: BoardElement, handle: "nw" | "ne" | "se" | "sw") => {
      event.stopPropagation();
      const bounds = getElementBounds(element);
      const origin = { x: bounds.left, y: bounds.top };
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;
      transformStateRef.current = {
        id: element.id,
        pointerId: event.pointerId,
        kind: "resize",
        handle,
        origin,
        width,
        height,
        rotation: element.rotation ?? 0,
        fontSize: element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16,
        element,
      };
      dragStateRef.current = null;
    },
    [],
  );

  const beginRotate = useCallback(
    (event: FederatedPointerEvent, element: BoardElement) => {
      event.stopPropagation();
      const bounds = getElementBounds(element);
      const origin = { x: bounds.left, y: bounds.top };
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;
      const rotation = element.rotation ?? 0;
      const rotationRad = rotation * DEG_TO_RAD;
      const centerOffset = rotatePoint({ x: width / 2, y: height / 2 }, rotationRad);
      const center = { x: origin.x + centerOffset.x, y: origin.y + centerOffset.y };
      const angle = Math.atan2(event.global.y - center.y, event.global.x - center.x);
      transformStateRef.current = {
        id: element.id,
        pointerId: event.pointerId,
        kind: "rotate",
        origin,
        width,
        height,
        rotation,
        startAngle: angle,
        center,
        element,
      };
      dragStateRef.current = null;
    },
    [],
  );

  const isDoubleTap = useCallback((id: string, event: FederatedPointerEvent) => {
    const now = event.originalEvent.timeStamp ?? performance.now();
    const last = lastTapRef.current;
    lastTapRef.current = { id, time: now };
    if (!last) return false;
    return last.id === id && now - last.time < 350;
  }, []);

  const selectionOverlays = useMemo(() => {
    if (selectionPresence.length === 0) return [];
    const overlays: Array<{ key: string; element: BoardElement; color: string; label?: string }> = [];
    selectionPresence.forEach((presence) => {
      let labelUsed = false;
      presence.element_ids.forEach((elementId) => {
        const element = elementMap.get(elementId);
        if (!element) return;
        overlays.push({
          key: `${presence.user_id}:${elementId}`,
          element,
          color: presence.color,
          label: !labelUsed ? presence.user_name : undefined,
        });
        if (!labelUsed) labelUsed = true;
      });
    });
    return overlays;
  }, [elementMap, selectionPresence]);

  const transformHandles = useMemo(() => {
    if (!primarySelectedElement || !canTransform) return null;
    if (primarySelectedElement.element_type === "Drawing" || primarySelectedElement.element_type === "Connector") {
      return null;
    }
    const bounds = getElementBounds(primarySelectedElement);
    const rotation = (primarySelectedElement.rotation ?? 0) * DEG_TO_RAD;
    const origin = { x: bounds.left, y: bounds.top };
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const corners = [
      { key: "nw", local: { x: 0, y: 0 } },
      { key: "ne", local: { x: width, y: 0 } },
      { key: "se", local: { x: width, y: height } },
      { key: "sw", local: { x: 0, y: height } },
    ];
    const handles = corners.map((corner) => {
      const rotated = rotatePoint(corner.local, rotation);
      return {
        key: corner.key as "nw" | "ne" | "se" | "sw",
        x: origin.x + rotated.x,
        y: origin.y + rotated.y,
      };
    });
    const topCenter = rotatePoint({ x: width / 2, y: 0 }, rotation);
    const rotateOffset = rotatePoint({ x: 0, y: -rotateHandleOffset }, rotation);
    const rotateHandle = {
      x: origin.x + topCenter.x + rotateOffset.x,
      y: origin.y + topCenter.y + rotateOffset.y,
    };
    const rotateLineStart = {
      x: origin.x + topCenter.x,
      y: origin.y + topCenter.y,
    };
    return {
      element: primarySelectedElement,
      handles,
      rotateHandle,
      rotateLineStart,
    };
  }, [canTransform, primarySelectedElement, rotateHandleOffset]);

  return (
    <pixiContainer
      ref={viewportRef}
      x={stagePosition.x}
      y={stagePosition.y}
      scale={stageScale}
      eventMode="static"
      hitArea={new Rectangle(worldRect.x, worldRect.y, worldRect.width, worldRect.height)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
    >
      <pixiGraphics
        draw={(graphics) => {
          graphics.clear();
          setFillStyle(graphics, parseColor(backgroundColor, 0x141414));
          graphics.rect(worldRect.x, worldRect.y, worldRect.width, worldRect.height);
          graphics.fill();
        }}
      />

      <pixiGraphics
        draw={(graphics) => {
          graphics.clear();
          gridLines.forEach((line) => {
            const color = line.major ? 0x2f2f2f : 0x222222;
            setStrokeStyle(graphics, (line.major ? 1.2 : 1) / stageScale, color);
            graphics.moveTo(line.points[0], line.points[1]);
            graphics.lineTo(line.points[2], line.points[3]);
            graphics.stroke();
          });
        }}
      />

      {renderElements.map((element) => {
        const isSelected = selectedSet.has(element.id);
        const isLocked = lockedElementIds.has(element.id);
        const isInteractive = isDragEnabled && !isLocked;
        if (element.element_type === "Shape") {
          if (element.properties.shapeType === "rectangle") {
            const rect = getRectBounds(element);
            return (
              <pixiContainer
                key={element.id}
                ref={(node) => registerElementRef(element.id, node)}
                x={rect.x}
                y={rect.y}
                rotation={(element.rotation ?? 0) * DEG_TO_RAD}
                eventMode={isInteractive ? "static" : "passive"}
                onPointerDown={(event: FederatedPointerEvent) => handleElementPointerDown(event, element)}
              >
                <pixiGraphics
                  draw={(graphics) => {
                  graphics.clear();
                  const stroke = parseColor(element.style.stroke, 0xffffff);
                  const fill = parseColor(element.style.fill, 0x000000);
                  const strokeWidth = element.style.strokeWidth ?? 1;
                  setStrokeStyle(graphics, strokeWidth, stroke);
                  setFillStyle(graphics, fill);
                  graphics.rect(0, 0, rect.width, rect.height);
                  graphics.fill();
                  graphics.stroke();
                }}
              />
              {isSelected && (
                <pixiGraphics
                  draw={(graphics) => {
                    graphics.clear();
                    setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
                    graphics.rect(
                      -selectionPadding,
                      -selectionPadding,
                      rect.width + selectionPadding * 2,
                      rect.height + selectionPadding * 2,
                    );
                    graphics.stroke();
                  }}
                />
              )}
            </pixiContainer>
            );
          }
          if (element.properties.shapeType === "circle") {
            const radius = Math.hypot(element.width || 0, element.height || 0);
            const positionX = coerceNumber(element.position_x, 0);
            const positionY = coerceNumber(element.position_y, 0);
            return (
              <pixiContainer
                key={element.id}
                ref={(node) => registerElementRef(element.id, node)}
                x={positionX}
                y={positionY}
                rotation={(element.rotation ?? 0) * DEG_TO_RAD}
                eventMode={isInteractive ? "static" : "passive"}
                onPointerDown={(event: FederatedPointerEvent) => handleElementPointerDown(event, element)}
              >
                <pixiGraphics
                  draw={(graphics) => {
                  graphics.clear();
                  const stroke = parseColor(element.style.stroke, 0xffffff);
                  const fill = parseColor(element.style.fill, 0x000000);
                  const strokeWidth = element.style.strokeWidth ?? 1;
                  setStrokeStyle(graphics, strokeWidth, stroke);
                  setFillStyle(graphics, fill);
                  graphics.circle(0, 0, radius);
                  graphics.fill();
                  graphics.stroke();
                }}
              />
              {isSelected && (
                <pixiGraphics
                  draw={(graphics) => {
                    graphics.clear();
                    setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
                    graphics.circle(0, 0, radius + selectionPadding);
                    graphics.stroke();
                  }}
                />
              )}
            </pixiContainer>
            );
          }
        }

        if (element.element_type === "Drawing") {
          const points = element.properties.points;
          if (!Array.isArray(points) || !isValidDrawingPoints(points)) return null;
          const positionX = coerceNumber(element.position_x, 0);
          const positionY = coerceNumber(element.position_y, 0);
          return (
            <pixiContainer
              key={element.id}
              ref={(node) => registerElementRef(element.id, node)}
              x={positionX}
              y={positionY}
              rotation={(element.rotation ?? 0) * DEG_TO_RAD}
              eventMode={isInteractive ? "static" : "passive"}
              onPointerDown={(event: FederatedPointerEvent) => handleElementPointerDown(event, element)}
            >
              <pixiGraphics
                draw={(graphics) => {
                  graphics.clear();
                  drawPolyline(
                    graphics,
                    points,
                    element.style.strokeWidth ?? 2,
                    parseColor(element.style.stroke, 0xffffff),
                  );
                }}
              />
            </pixiContainer>
          );
        }

        if (element.element_type === "Text") {
          const positionX = coerceNumber(element.position_x, 0);
          const positionY = coerceNumber(element.position_y, 0);
          const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
          const content = element.properties?.content ?? "";
          const metrics = getTextMetrics(content, fontSize);
          return (
            <pixiContainer
              key={element.id}
              ref={(node) => registerElementRef(element.id, node)}
              x={positionX}
              y={positionY}
              rotation={(element.rotation ?? 0) * DEG_TO_RAD}
              eventMode={isInteractive ? "static" : "passive"}
              onPointerDown={(event: FederatedPointerEvent) => handleElementPointerDown(event, element)}
              onPointerTap={(event: FederatedPointerEvent) => {
                if (!isDoubleTap(element.id, event)) return;
                onOpenTextEditor({
                  x: positionX,
                  y: positionY,
                  value: content,
                  elementId: element.id,
                  fontSize,
                  color: element.style.textColor ?? DEFAULT_TEXT_STYLE.fill ?? "#1F2937",
                  elementType: "Text",
                });
              }}
            >
              <pixiText
                text={content}
                style={{
                  fontSize,
                  fill: element.style.textColor ?? DEFAULT_TEXT_STYLE.fill ?? "#1F2937",
                }}
              />
              {isSelected && (
                <pixiGraphics
                  draw={(graphics) => {
                    graphics.clear();
                    setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
                    graphics.rect(
                      -selectionPadding,
                      -selectionPadding,
                      metrics.width + selectionPadding * 2,
                      metrics.height + selectionPadding * 2,
                    );
                    graphics.stroke();
                  }}
                />
              )}
            </pixiContainer>
          );
        }

        if (element.element_type === "StickyNote") {
          const rect = getRectBounds(element);
          const fontSize = element.style.fontSize ?? 16;
          const content = element.properties?.content ?? "";
          const padding = 12;
          return (
            <pixiContainer
              key={element.id}
              ref={(node) => registerElementRef(element.id, node)}
              x={rect.x}
              y={rect.y}
              rotation={(element.rotation ?? 0) * DEG_TO_RAD}
              eventMode={isInteractive ? "static" : "passive"}
              onPointerDown={(event: FederatedPointerEvent) => handleElementPointerDown(event, element)}
              onPointerTap={(event: FederatedPointerEvent) => {
                if (!isDoubleTap(element.id, event)) return;
                onOpenTextEditor({
                  x: rect.x + padding,
                  y: rect.y + padding,
                  value: content,
                  elementId: element.id,
                  fontSize,
                  color: element.style.textColor ?? "#1F2937",
                  elementType: "StickyNote",
                  backgroundColor: element.style.fill,
                  editorWidth: Math.max(0, rect.width - padding * 2),
                  editorHeight: Math.max(0, rect.height - padding * 2),
                });
              }}
            >
              <pixiGraphics
                draw={(graphics) => {
                  graphics.clear();
                  const stroke = parseColor(element.style.stroke, 0xffffff);
                  const fill = parseColor(element.style.fill, 0xfff9c2);
                  const strokeWidth = element.style.strokeWidth ?? 1;
                  setStrokeStyle(graphics, strokeWidth, stroke);
                  setFillStyle(graphics, fill);
                  graphics.roundRect(0, 0, rect.width, rect.height, element.style.cornerRadius ?? 12);
                  graphics.fill();
                  graphics.stroke();
                }}
              />
              <pixiText
                text={content}
                x={padding}
                y={padding}
                style={{
                  fontSize,
                  fill: element.style.textColor ?? "#1F2937",
                  wordWrap: true,
                  wordWrapWidth: Math.max(0, rect.width - padding * 2),
                }}
              />
              {isSelected && (
                <pixiGraphics
                  draw={(graphics) => {
                    graphics.clear();
                    setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
                    graphics.rect(
                      -selectionPadding,
                      -selectionPadding,
                      rect.width + selectionPadding * 2,
                      rect.height + selectionPadding * 2,
                    );
                    graphics.stroke();
                  }}
                />
              )}
            </pixiContainer>
          );
        }

        if (element.element_type === "Connector") {
          const points = resolveConnectorPoints(element);
          if (!points || points.length < 4) return null;
          return (
            <pixiContainer
              key={element.id}
              ref={(node) => registerElementRef(element.id, node)}
              eventMode={isInteractive ? "static" : "passive"}
              onPointerDown={(event: FederatedPointerEvent) => handleElementPointerDown(event, element)}
            >
              <pixiGraphics
                draw={(graphics) => {
                  graphics.clear();
                  drawPolyline(
                    graphics,
                    normalizeOrthogonalPoints(points),
                    element.style.strokeWidth ?? 2,
                    parseColor(element.style.stroke, 0xffffff),
                  );
                }}
              />
            </pixiContainer>
          );
        }

        return null;
      })}

      {ghostElement && (
        <pixiGraphics
          draw={(graphics) => {
            graphics.clear();
            if (ghostElement.element_type === "Shape" && ghostElement.properties.shapeType === "rectangle") {
              const rect = getRectBounds(ghostElement);
              setStrokeStyle(
                graphics,
                (ghostElement.style.strokeWidth ?? 2) / stageScale,
                parseColor(ghostElement.style.stroke),
              );
              setFillStyle(graphics, parseColor(ghostElement.style.fill), 0.25);
              graphics.rect(rect.x, rect.y, rect.width, rect.height);
              graphics.fill();
              graphics.stroke();
            }
          }}
        />
      )}

      {snapGuides.map((guide, index) => {
        const points = guide.orientation === "vertical"
          ? [guide.position, worldRect.y, guide.position, worldRect.y + worldRect.height]
          : [worldRect.x, guide.position, worldRect.x + worldRect.width, guide.position];
        return (
          <pixiGraphics
            key={`snap-${index}`}
            draw={(graphics) => {
              graphics.clear();
              setStrokeStyle(
                graphics,
                snapStrokeWidth,
                parseColor(guide.orientation === "vertical" ? SNAP_GUIDE_COLORS.vertical : SNAP_GUIDE_COLORS.horizontal),
              );
              graphics.moveTo(points[0], points[1]);
              graphics.lineTo(points[2], points[3]);
              graphics.stroke();
            }}
          />
        );
      })}

      {selectionOverlays.map((overlay) => {
        const rawBounds = getElementBounds(overlay.element);
        if (!rawBounds) return null;
        const bounds = toRectBounds(rawBounds);
        const labelFontSize = 11 / stageScale;
        const labelOffset = 6 / stageScale;
        return (
          <Fragment key={overlay.key}>
            <pixiGraphics
              draw={(graphics) => {
                graphics.clear();
                setStrokeStyle(graphics, selectionStrokeWidth, parseColor(overlay.color));
                graphics.rect(
                  bounds.x - selectionPadding,
                  bounds.y - selectionPadding,
                  bounds.width + selectionPadding * 2,
                  bounds.height + selectionPadding * 2,
                );
                graphics.stroke();
              }}
            />
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
          </Fragment>
        );
      })}

      {cursorList
        .filter((cursor) => cursor.x !== null && cursor.y !== null)
        .map((cursor) => (
          <CursorMarker key={cursor.client_id} cursor={cursor} />
        ))}

      {transformHandles && (
        <pixiContainer eventMode="static">
          <pixiGraphics
            draw={(graphics) => {
              graphics.clear();
              setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
              graphics.moveTo(transformHandles.rotateLineStart.x, transformHandles.rotateLineStart.y);
              graphics.lineTo(transformHandles.rotateHandle.x, transformHandles.rotateHandle.y);
              graphics.stroke();
            }}
          />
          <pixiGraphics
            x={transformHandles.rotateHandle.x}
            y={transformHandles.rotateHandle.y}
            eventMode="static"
            onPointerDown={(event: FederatedPointerEvent) =>
              beginRotate(event, transformHandles.element)
            }
            draw={(graphics) => {
              graphics.clear();
              setFillStyle(graphics, parseColor(SELECTION_STROKE));
              graphics.circle(0, 0, handleSize / 2);
              graphics.fill();
            }}
          />
          {transformHandles.handles.map((handle) => (
            <pixiGraphics
              key={handle.key}
              x={handle.x}
              y={handle.y}
              eventMode="static"
              onPointerDown={(event: FederatedPointerEvent) =>
                beginResize(event, transformHandles.element, handle.key)
              }
              draw={(graphics) => {
                graphics.clear();
                setFillStyle(graphics, 0xffffff);
                setStrokeStyle(graphics, 1 / stageScale, parseColor(SELECTION_STROKE));
                graphics.rect(-handleSize / 2, -handleSize / 2, handleSize, handleSize);
                graphics.fill();
                graphics.stroke();
              }}
            />
          ))}
        </pixiContainer>
      )}
    </pixiContainer>
  );
}

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
  gridLines,
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
  useEffect(() => {
    const container = stageRef.current;
    if (!container) return;
    const handleWheelEvent = (event: WheelEvent) => {
      const rect = container.getBoundingClientRect();
      onWheel({
        screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        originalEvent: event,
      });
    };
    container.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheelEvent);
    };
  }, [onWheel, stageRef]);

  return (
    <div
      ref={stageRef}
      className="w-full h-full"
      onPointerLeave={onMouseLeave}
    >
      <Application
        width={width}
        height={height}
        antialias
        backgroundAlpha={0}
      >
        <PixiScene
          width={width}
          height={height}
          stageScale={stageScale}
          stagePosition={stagePosition}
          worldRect={worldRect}
          backgroundColor={backgroundColor}
          gridLines={gridLines}
          snapGuides={snapGuides}
          elements={elements}
          ghostElement={ghostElement}
          selectedElementIds={selectedElementIds}
          selectionPresence={selectionPresence}
          cursorList={cursorList}
          localOverrideIds={localOverrideIds}
          lockedElementIds={lockedElementIds}
          isDragEnabled={isDragEnabled}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onElementDragMove={onElementDragMove}
          onElementDragEnd={onElementDragEnd}
          onElementTransform={onElementTransform}
          onElementTransformEnd={onElementTransformEnd}
          onDrawingDragEnd={onDrawingDragEnd}
          onOpenTextEditor={onOpenTextEditor}
        />
      </Application>
    </div>
  );
}
