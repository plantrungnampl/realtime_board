import type { BoardElement, ConnectorElement } from "@/types/board";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import { routeOrthogonalPath } from "@/features/boards/routing/orthogonalRouter";
import { isRectLikeElement } from "@/features/boards/boardCanvas/elementUtils";

const ROUTE_PADDING = 12;
const ROUTE_MARGIN = 320;
const ROUTE_BEND_PENALTY = 20;
const CONNECTOR_ANCHOR_GAP = 0.5;
const CONNECTOR_ANCHOR_STROKE_FACTOR = 0.25;
const CONNECTOR_ANCHOR_MIN_GAP = 1;
const CONNECTOR_STROKE_FALLBACK = 2;
const ANCHOR_HYSTERESIS = 24;
const CONNECTOR_STUB = 12;
const BOUND_ROUTE_PADDING = 4;
const SIDE_SWITCH_RATIO = 1.4;

type AnchorSide = "top" | "right" | "bottom" | "left";

type RectBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Point = {
  x: number;
  y: number;
};

type AutoAnchorCache = {
  start?: AnchorSide;
  end?: AnchorSide;
};

const autoAnchorCache = new Map<string, AutoAnchorCache>();

const getStubPoint = (point: Point, side?: AnchorSide): Point => {
  if (!side) return point;
  if (side === "left") return { x: point.x - CONNECTOR_STUB, y: point.y };
  if (side === "right") return { x: point.x + CONNECTOR_STUB, y: point.y };
  if (side === "top") return { x: point.x, y: point.y - CONNECTOR_STUB };
  return { x: point.x, y: point.y + CONNECTOR_STUB };
};

const buildPointsBounds = (points: number[]): RectBounds => {
  if (points.length < 2) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  let left = points[0];
  let right = points[0];
  let top = points[1];
  let bottom = points[1];
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { left, right, top, bottom };
};

const shrinkRect = (rect: RectBounds, delta: number): RectBounds => {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const maxDx = Math.max(0, width / 2 - 0.5);
  const maxDy = Math.max(0, height / 2 - 0.5);
  const dx = Math.min(delta, maxDx);
  const dy = Math.min(delta, maxDy);
  return {
    left: rect.left + dx,
    right: rect.right - dx,
    top: rect.top + dy,
    bottom: rect.bottom - dy,
  };
};

export const arePointsEqual = (
  left?: number[],
  right?: number[],
  epsilon = 0.5,
) => {
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (Math.abs(left[i] - right[i]) > epsilon) return false;
  }
  return true;
};

export const normalizeOrthogonalPoints = (points?: number[]) => {
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
  const simplified: number[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    const x = normalized[i];
    const y = normalized[i + 1];
    const prevX = simplified[simplified.length - 2];
    const prevY = simplified[simplified.length - 1];
    if (prevX === x && prevY === y) continue;
    simplified.push(x, y);
  }
  const reduced: number[] = [];
  for (let i = 0; i < simplified.length; i += 2) {
    const x = simplified[i];
    const y = simplified[i + 1];
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
};

export const isNonOrthogonalPoints = (points?: number[]) => {
  if (!points || points.length < 4) return false;
  for (let i = 0; i < points.length - 2; i += 2) {
    const x1 = points[i];
    const y1 = points[i + 1];
    const x2 = points[i + 2];
    const y2 = points[i + 3];
    if (x1 !== x2 && y1 !== y2) return true;
  }
  return false;
};

const toRectBounds = (bounds: {
  left: number;
  right: number;
  top: number;
  bottom: number;
}): RectBounds => ({
  left: bounds.left,
  right: bounds.right,
  top: bounds.top,
  bottom: bounds.bottom,
});

const isObstacleElement = (element: BoardElement) => {
  if (element.element_type === "Text") return true;
  return isRectLikeElement(element);
};

const resolveAnchorPoint = (
  element: BoardElement,
  side: AnchorSide,
  connectorStrokeWidth = 0,
) => {
  const bounds = getElementBounds(element);
  const strokeWidth = element.style.strokeWidth ?? 0;
  const strokeGap =
    (strokeWidth + connectorStrokeWidth) * CONNECTOR_ANCHOR_STROKE_FACTOR;
  const gap = Math.max(
    CONNECTOR_ANCHOR_MIN_GAP,
    CONNECTOR_ANCHOR_GAP + strokeGap,
  );
  if (side === "top") {
    return { x: bounds.centerX, y: bounds.top - gap };
  }
  if (side === "bottom") {
    return { x: bounds.centerX, y: bounds.bottom + gap };
  }
  if (side === "left") {
    return { x: bounds.left - gap, y: bounds.centerY };
  }
  return { x: bounds.right + gap, y: bounds.centerY };
};

const resolveDynamicSide = (
  element: BoardElement,
  target: { x: number; y: number },
  previousSide?: AnchorSide,
) => {
  const bounds = getElementBounds(element);
  const dx = target.x - bounds.centerX;
  const dy = target.y - bounds.centerY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (previousSide) {
    const isHorizontal = previousSide === "left" || previousSide === "right";
    const switchToVertical =
      absDy > absDx * SIDE_SWITCH_RATIO + ANCHOR_HYSTERESIS;
    const switchToHorizontal =
      absDx > absDy * SIDE_SWITCH_RATIO + ANCHOR_HYSTERESIS;
    if (isHorizontal && !switchToVertical) return previousSide;
    if (!isHorizontal && !switchToHorizontal) return previousSide;
  }
  if (absDx >= absDy) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
};

const resolveConnectorEndpoints = (
  connector: ConnectorElement,
  elementIndex: Map<string, BoardElement>,
  lockAutoSide: boolean,
) => {
  let start = connector.properties.start;
  let end = connector.properties.end;
  const bindings = connector.properties.bindings;
  const startBinding = bindings?.start;
  const endBinding = bindings?.end;
  const connectorStrokeWidth =
    connector.style.strokeWidth ?? CONNECTOR_STROKE_FALLBACK;
  const cachedSides = autoAnchorCache.get(connector.id);
  let startSide = cachedSides?.start;
  let endSide = cachedSides?.end;
  let shouldUpdateCache = false;
  if (startBinding) {
    const boundElement = elementIndex.get(startBinding.elementId);
    if (boundElement) {
      const side =
        startBinding.side === "auto"
          ? lockAutoSide && startSide
            ? startSide
            : resolveDynamicSide(boundElement, end, startSide)
          : startBinding.side;
      if (startBinding.side === "auto") {
        startSide = side;
        shouldUpdateCache = true;
      }
      start = resolveAnchorPoint(boundElement, side, connectorStrokeWidth);
    }
  }
  if (endBinding) {
    const boundElement = elementIndex.get(endBinding.elementId);
    if (boundElement) {
      const side =
        endBinding.side === "auto"
          ? lockAutoSide && endSide
            ? endSide
            : resolveDynamicSide(boundElement, start, endSide)
          : endBinding.side;
      if (endBinding.side === "auto") {
        endSide = side;
        shouldUpdateCache = true;
      }
      end = resolveAnchorPoint(boundElement, side, connectorStrokeWidth);
    }
  }
  if (startBinding?.side === "auto" || endBinding?.side === "auto") {
    if (shouldUpdateCache) {
      autoAnchorCache.set(connector.id, {
        start: startBinding?.side === "auto" ? startSide : undefined,
        end: endBinding?.side === "auto" ? endSide : undefined,
      });
    }
  } else {
    autoAnchorCache.delete(connector.id);
  }
  return { start, end, startSide, endSide };
};

const buildObstacleRects = (
  snapshot: BoardElement[],
  boundIds: Set<string>,
) =>
  snapshot
    .filter((element) => isObstacleElement(element))
    .map((element) => {
      const rect = toRectBounds(getElementBounds(element));
      if (boundIds.has(element.id)) {
        const shrink = Math.max(0, ROUTE_PADDING - BOUND_ROUTE_PADDING);
        return shrink > 0 ? shrinkRect(rect, shrink) : rect;
      }
      return rect;
    });

export const applyConnectorRouting = (
  connector: BoardElement,
  snapshot: BoardElement[],
  elementIndex: Map<string, BoardElement>,
  options?: { avoidObstacles?: boolean; lockAutoSide?: boolean },
) => {
  if (connector.element_type !== "Connector") return connector;
  const connectorElement = connector as ConnectorElement;
  const { start, end, startSide, endSide } = resolveConnectorEndpoints(
    connectorElement,
    elementIndex,
    options?.lockAutoSide === true,
  );
  const routingMode = connectorElement.properties.routing?.mode;
  const normalizedMode =
    routingMode === "straight" ? "orthogonal" : (routingMode ?? "orthogonal");
  const shouldRouteOrthogonal =
    normalizedMode === "orthogonal" && !connectorElement.properties.routing?.lock;
  const nextRouting = {
    ...(connectorElement.properties.routing ?? {}),
    mode: normalizedMode,
  };
  const base: BoardElement = {
    ...connectorElement,
    properties: {
      ...connectorElement.properties,
      start,
      end,
      routing: nextRouting,
    },
  };
  if (!shouldRouteOrthogonal) {
    const bounds = getElementBounds(base);
    return {
      ...base,
      position_x: bounds.left,
      position_y: bounds.top,
      width: Math.max(1, bounds.right - bounds.left),
      height: Math.max(1, bounds.bottom - bounds.top),
      properties: {
        ...base.properties,
        points: undefined,
      },
    };
  }
  const bindings = connectorElement.properties.bindings;
  const boundIds = new Set<string>([
    bindings?.start?.elementId ?? "",
    bindings?.end?.elementId ?? "",
  ]);
  const shouldAvoidObstacles = options?.avoidObstacles !== false;
  const obstacles = shouldAvoidObstacles
    ? buildObstacleRects(
        snapshot.filter((element) => element.id !== connector.id),
        boundIds,
      )
    : [];
  const routeStart = getStubPoint(start, startSide);
  const routeEnd = getStubPoint(end, endSide);
  const routed = routeOrthogonalPath(routeStart, routeEnd, obstacles, {
    padding: ROUTE_PADDING,
    margin: ROUTE_MARGIN,
    bendPenalty: ROUTE_BEND_PENALTY,
  });
  let rawPoints = routed.points;
  if (startSide) {
    rawPoints = [start.x, start.y, ...rawPoints];
  }
  if (endSide) {
    rawPoints = [...rawPoints, end.x, end.y];
  }
  const normalizedPoints = normalizeOrthogonalPoints(rawPoints);
  const bounds = buildPointsBounds(normalizedPoints);
  return {
    ...base,
    position_x: bounds.left,
    position_y: bounds.top,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top),
    properties: {
      ...base.properties,
      points: normalizedPoints,
    },
  };
};
