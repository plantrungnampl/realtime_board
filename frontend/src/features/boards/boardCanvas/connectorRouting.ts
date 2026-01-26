import type { BoardElement, ConnectorElement } from "@/types/board";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import { routeOrthogonalPath, type RouteResult } from "@/features/boards/routing/orthogonalRouter";
import { SpatialIndex, type SpatialBounds } from "@/features/boards/routing/spatialIndex";
import { isRectLikeElement } from "@/features/boards/boardCanvas/elementUtils";

const ROUTE_PADDING = 12;
const ROUTE_MARGIN = 320;
const ROUTE_BEND_PENALTY = 20;
const ROUTE_SHORT_MARGIN = 120;
const ROUTE_SHORT_DISTANCE = 800;
const CONNECTOR_ANCHOR_GAP = 0.5;
const CONNECTOR_ANCHOR_STROKE_FACTOR = 0.25;
const CONNECTOR_ANCHOR_MIN_GAP = 1;
const CONNECTOR_STROKE_FALLBACK = 2;
const ANCHOR_HYSTERESIS = 24;
const CONNECTOR_STUB = 12;
const BOUND_ROUTE_PADDING = 4;
const SIDE_SWITCH_RATIO = 1.4;
const ROUTE_EPS = 0.0001;
const OBSTACLE_INDEX_PADDING = 32;
const OBSTACLE_INDEX_CAPACITY = 32;
const OBSTACLE_INDEX_MAX_DEPTH = 6;

type AnchorSide = "top" | "right" | "bottom" | "left";

export type ConnectorRouteOptions = {
  padding: number;
  margin: number;
  bendPenalty: number;
};

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

export const pruneAutoAnchorCache = (elements: BoardElement[]) => {
  const active = new Set<string>();
  elements.forEach((element) => {
    if (element.element_type === "Connector") {
      active.add(element.id);
    }
  });
  for (const key of autoAnchorCache.keys()) {
    if (!active.has(key)) {
      autoAnchorCache.delete(key);
    }
  }
};

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

const buildSearchBounds = (
  start: Point,
  end: Point,
  margin: number,
  padding: number,
): RectBounds => ({
  left: Math.min(start.x, end.x) - margin - padding,
  right: Math.max(start.x, end.x) + margin + padding,
  top: Math.min(start.y, end.y) - margin - padding,
  bottom: Math.max(start.y, end.y) + margin + padding,
});

const expandRect = (rect: RectBounds, padding: number): RectBounds => ({
  left: rect.left - padding,
  right: rect.right + padding,
  top: rect.top - padding,
  bottom: rect.bottom + padding,
});

const isPointInsideRect = (point: Point, rect: RectBounds) =>
  point.x > rect.left - ROUTE_EPS
  && point.x < rect.right + ROUTE_EPS
  && point.y > rect.top - ROUTE_EPS
  && point.y < rect.bottom + ROUTE_EPS;

const orientation = (a: Point, b: Point, c: Point) =>
  (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

const onSegment = (a: Point, b: Point, c: Point) =>
  Math.min(a.x, c.x) - ROUTE_EPS <= b.x
  && b.x <= Math.max(a.x, c.x) + ROUTE_EPS
  && Math.min(a.y, c.y) - ROUTE_EPS <= b.y
  && b.y <= Math.max(a.y, c.y) + ROUTE_EPS;

const segmentsIntersect = (p1: Point, q1: Point, p2: Point, q2: Point) => {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) <= ROUTE_EPS && onSegment(p1, p2, q1)) return true;
  if (Math.abs(o2) <= ROUTE_EPS && onSegment(p1, q2, q1)) return true;
  if (Math.abs(o3) <= ROUTE_EPS && onSegment(p2, p1, q2)) return true;
  if (Math.abs(o4) <= ROUTE_EPS && onSegment(p2, q1, q2)) return true;
  return false;
};

const segmentIntersectsRect = (
  start: Point,
  end: Point,
  rect: RectBounds,
) => {
  if (isPointInsideRect(start, rect) || isPointInsideRect(end, rect)) {
    return true;
  }
  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomLeft = { x: rect.left, y: rect.bottom };
  const bottomRight = { x: rect.right, y: rect.bottom };

  return (
    segmentsIntersect(start, end, topLeft, topRight)
    || segmentsIntersect(start, end, topRight, bottomRight)
    || segmentsIntersect(start, end, bottomRight, bottomLeft)
    || segmentsIntersect(start, end, bottomLeft, topLeft)
  );
};

const segmentIntersectsObstacles = (
  start: Point,
  end: Point,
  obstacles: RectBounds[],
) => obstacles.some((rect) => segmentIntersectsRect(start, end, rect));

const pathIntersectsObstacles = (points: number[] | undefined, obstacles: RectBounds[]) => {
  if (!points || points.length < 4) return false;
  for (let i = 0; i < points.length - 2; i += 2) {
    const start = { x: points[i], y: points[i + 1] };
    const end = { x: points[i + 2], y: points[i + 3] };
    if (segmentIntersectsObstacles(start, end, obstacles)) {
      return true;
    }
  }
  return false;
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
  elements: BoardElement[],
  boundIds: Set<string>,
  options?: { shrinkBound?: boolean },
) =>
  elements
    .map((element) => {
      const rect = toRectBounds(getElementBounds(element));
      if (boundIds.has(element.id)) {
        if (options?.shrinkBound === false) {
          return rect;
        }
        const shrink = Math.max(0, ROUTE_PADDING - BOUND_ROUTE_PADDING);
        return shrink > 0 ? shrinkRect(rect, shrink) : rect;
      }
      return rect;
    });

export const buildObstacleIndex = (snapshot: BoardElement[]) => {
  const obstacles = snapshot.filter((element) => isObstacleElement(element));
  if (obstacles.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  obstacles.forEach((element) => {
    const rect = toRectBounds(getElementBounds(element));
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  });
  const bounds: SpatialBounds = {
    left: left - OBSTACLE_INDEX_PADDING,
    right: right + OBSTACLE_INDEX_PADDING,
    top: top - OBSTACLE_INDEX_PADDING,
    bottom: bottom + OBSTACLE_INDEX_PADDING,
  };
  const index = new SpatialIndex<BoardElement>(bounds, {
    capacity: OBSTACLE_INDEX_CAPACITY,
    maxDepth: OBSTACLE_INDEX_MAX_DEPTH,
  });
  obstacles.forEach((element) => {
    index.insert(toRectBounds(getElementBounds(element)), element);
  });
  return index;
};

export type ConnectorRouteContext = {
  base: ConnectorElement;
  normalizedMode: "orthogonal" | "straight";
  shouldRouteOrthogonal: boolean;
  requiresRoute: boolean;
  start: Point;
  end: Point;
  startSide?: AnchorSide;
  endSide?: AnchorSide;
  routeStart: Point;
  routeEnd: Point;
  obstacles: RectBounds[];
  routeOptions: ConnectorRouteOptions;
};

export const buildConnectorRouteContext = (
  connector: BoardElement,
  snapshot: BoardElement[],
  elementIndex: Map<string, BoardElement>,
  options?: {
    avoidObstacles?: boolean;
    lockAutoSide?: boolean;
    obstacleIndex?: SpatialIndex<BoardElement> | null;
  },
): ConnectorRouteContext | null => {
  if (connector.element_type !== "Connector") return null;
  const connectorElement = connector as ConnectorElement;
  const { start, end, startSide, endSide } = resolveConnectorEndpoints(
    connectorElement,
    elementIndex,
    options?.lockAutoSide === true,
  );
  const routingMode = connectorElement.properties.routing?.mode;
  const normalizedMode = (routingMode ?? "orthogonal") as "orthogonal" | "straight";
  const shouldRouteOrthogonal =
    normalizedMode === "orthogonal" && !connectorElement.properties.routing?.lock;
  const nextRouting = {
    ...(connectorElement.properties.routing ?? {}),
    mode: normalizedMode,
  };
  const base: ConnectorElement = {
    ...connectorElement,
    properties: {
      ...connectorElement.properties,
      start,
      end,
      routing: nextRouting,
    },
  };
  const bindings = connectorElement.properties.bindings;
  const boundIds = new Set<string>([
    bindings?.start?.elementId ?? "",
    bindings?.end?.elementId ?? "",
  ]);
  const shouldAvoidObstacles = options?.avoidObstacles !== false;
  const routeOptions = {
    padding: ROUTE_PADDING,
    margin: ROUTE_MARGIN,
    bendPenalty: ROUTE_BEND_PENALTY,
  };
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (distance <= ROUTE_SHORT_DISTANCE) {
    routeOptions.margin = ROUTE_SHORT_MARGIN;
  }
  const obstacleIndex = options?.obstacleIndex ?? null;
  const candidateSearch = buildSearchBounds(start, end, routeOptions.margin, routeOptions.padding);
  const candidates = obstacleIndex
    ? obstacleIndex.query(candidateSearch)
    : snapshot.filter((element) => isObstacleElement(element));
  const boundElements: BoardElement[] = [];
  boundIds.forEach((id) => {
    const bound = elementIndex.get(id);
    if (bound && isObstacleElement(bound)) {
      boundElements.push(bound);
    }
  });
  const candidateMap = new Map<string, BoardElement>();
  candidates.forEach((element) => {
    candidateMap.set(element.id, element);
  });
  boundElements.forEach((element) => {
    candidateMap.set(element.id, element);
  });
  const obstacleElements = Array.from(candidateMap.values());
  let requiresRoute = shouldRouteOrthogonal;
  if (!requiresRoute && normalizedMode === "straight" && shouldAvoidObstacles) {
    const straightObstacles = buildObstacleRects(
      obstacleElements.filter((element) => element.id !== connector.id),
      boundIds,
      { shrinkBound: false },
    );
    const paddedObstacles = straightObstacles.map((rect) =>
      expandRect(rect, ROUTE_PADDING),
    );
    if (segmentIntersectsObstacles(start, end, paddedObstacles)) {
      requiresRoute = true;
    }
  }
  const obstacleRects = shouldAvoidObstacles
    ? buildObstacleRects(
        obstacleElements.filter((element) => element.id !== connector.id),
        boundIds,
      )
    : [];
  if (
    !requiresRoute
    && normalizedMode === "orthogonal"
    && connectorElement.properties.routing?.lock
    && obstacleRects.length > 0
  ) {
    const existingPoints = connectorElement.properties.points;
    if (existingPoints && pathIntersectsObstacles(existingPoints, obstacleRects)) {
      requiresRoute = true;
    }
  }
  return {
    base,
    normalizedMode,
    shouldRouteOrthogonal,
    requiresRoute,
    start,
    end,
    startSide,
    endSide,
    routeStart: getStubPoint(start, startSide),
    routeEnd: getStubPoint(end, endSide),
    obstacles: obstacleRects,
    routeOptions,
  };
};

export const applyConnectorRouteResult = (
  context: ConnectorRouteContext,
  routeResult?: RouteResult,
): ConnectorElement => {
  const base = context.base;
  if (!context.requiresRoute || !routeResult) {
    if (context.normalizedMode === "straight") {
      const points = [context.start.x, context.start.y, context.end.x, context.end.y];
      const pointBounds = buildPointsBounds(points);
      return {
        ...base,
        position_x: pointBounds.left,
        position_y: pointBounds.top,
        width: Math.max(1, pointBounds.right - pointBounds.left),
        height: Math.max(1, pointBounds.bottom - pointBounds.top),
        properties: {
          ...base.properties,
          points,
        },
      };
    }
    if (!context.shouldRouteOrthogonal) {
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
    const existingPoints = base.properties.points;
    if (existingPoints && existingPoints.length >= 4) {
      const adjusted = [...existingPoints];
      adjusted[0] = context.start.x;
      adjusted[1] = context.start.y;
      adjusted[adjusted.length - 2] = context.end.x;
      adjusted[adjusted.length - 1] = context.end.y;
      const bounds = buildPointsBounds(adjusted);
      return {
        ...base,
        position_x: bounds.left,
        position_y: bounds.top,
        width: Math.max(1, bounds.right - bounds.left),
        height: Math.max(1, bounds.bottom - bounds.top),
        properties: {
          ...base.properties,
          points: adjusted,
        },
      };
    }
    return base;
  }
  let rawPoints = routeResult.points;
  if (context.startSide) {
    rawPoints = [context.start.x, context.start.y, ...rawPoints];
  }
  if (context.endSide) {
    rawPoints = [...rawPoints, context.end.x, context.end.y];
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

export const applyConnectorRouting = (
  connector: BoardElement,
  snapshot: BoardElement[],
  elementIndex: Map<string, BoardElement>,
  options?: {
    avoidObstacles?: boolean;
    lockAutoSide?: boolean;
    obstacleIndex?: SpatialIndex<BoardElement> | null;
  },
) => {
  const context = buildConnectorRouteContext(
    connector,
    snapshot,
    elementIndex,
    options,
  );
  if (!context) return connector;
  if (context.requiresRoute) {
    const routed = routeOrthogonalPath(
      context.routeStart,
      context.routeEnd,
      context.obstacles,
      context.routeOptions,
    );
    return applyConnectorRouteResult(context, routed);
  }
  return applyConnectorRouteResult(context);
};
