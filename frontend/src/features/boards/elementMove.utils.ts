import type { BoardElement } from "@/features/boards/types";
import type { Point } from "@/features/boards/boardRoute.utils";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";

export type SnapGuide = {
  orientation: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
};

type ElementBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

type AxisSnap = {
  delta: number;
  distance: number;
  guide: SnapGuide;
};

export type SnapOptions = {
  gridSize: number;
  gridEnabled: boolean;
  snapToGrid: boolean;
  allowSnap: boolean;
  alignmentThreshold?: number;
  alignmentTieBreak?: number;
};

const RECT_LIKE_TYPES = new Set<BoardElement["element_type"]>([
  "Shape",
  "StickyNote",
  "Image",
  "Video",
  "Frame",
  "Embed",
  "Document",
  "Component",
]);

const DEFAULT_ALIGNMENT_THRESHOLD = 6;
const ALIGNMENT_TIE_EPS = 0.5;

const buildBounds = (left: number, top: number, right: number, bottom: number) => ({
  left,
  right,
  top,
  bottom,
  centerX: (left + right) / 2,
  centerY: (top + bottom) / 2,
});

export const getAnchorPosition = (element: BoardElement): Point => {
  if (element.element_type === "Connector") {
    const points = element.properties.points;
    if (points && points.length >= 2) {
      return { x: points[0], y: points[1] };
    }
    const start = element.properties.start;
    return { x: start.x, y: start.y };
  }
  return { x: element.position_x, y: element.position_y };
};

export const translateElement = (
  element: BoardElement,
  delta: Point,
): BoardElement => {
  if (element.element_type === "Connector") {
    const start = element.properties.start;
    const end = element.properties.end;
    const points = element.properties.points;
    const nextStart = { x: start.x + delta.x, y: start.y + delta.y };
    const nextEnd = { x: end.x + delta.x, y: end.y + delta.y };
    const nextPoints = points?.map((value, index) =>
      value + (index % 2 === 0 ? delta.x : delta.y),
    );
    const nextLeft = Math.min(nextStart.x, nextEnd.x);
    const nextTop = Math.min(nextStart.y, nextEnd.y);
    const nextWidth = Math.max(1, Math.abs(nextEnd.x - nextStart.x));
    const nextHeight = Math.max(1, Math.abs(nextEnd.y - nextStart.y));
    return {
      ...element,
      position_x: nextLeft,
      position_y: nextTop,
      width: nextWidth,
      height: nextHeight,
      properties: {
        ...element.properties,
        start: nextStart,
        end: nextEnd,
        ...(nextPoints ? { points: nextPoints } : {}),
      },
    };
  }

  return {
    ...element,
    position_x: element.position_x + delta.x,
    position_y: element.position_y + delta.y,
  };
};

export const applyAnchorPosition = (
  element: BoardElement,
  anchor: Point,
): BoardElement => {
  const current = getAnchorPosition(element);
  return translateElement(element, {
    x: anchor.x - current.x,
    y: anchor.y - current.y,
  });
};

export const getElementBounds = (element: BoardElement): ElementBounds => {
  if (element.element_type === "Connector") {
    const points = element.properties.points;
    if (points && points.length >= 2) {
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
      return buildBounds(minX, minY, maxX, maxY);
    }
    const { start, end } = element.properties;
    return buildBounds(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.max(start.x, end.x),
      Math.max(start.y, end.y),
    );
  }

  if (element.element_type === "Drawing") {
    const points = element.properties.points ?? [];
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    if (points.length >= 2) {
      minX = points[0];
      maxX = points[0];
      minY = points[1];
      maxY = points[1];
      for (let i = 2; i < points.length; i += 2) {
        minX = Math.min(minX, points[i]);
        maxX = Math.max(maxX, points[i]);
        minY = Math.min(minY, points[i + 1]);
        maxY = Math.max(maxY, points[i + 1]);
      }
    }
    return buildBounds(
      minX + element.position_x,
      minY + element.position_y,
      maxX + element.position_x,
      maxY + element.position_y,
    );
  }

  if (element.element_type === "Text") {
    const fontSize = element.style.fontSize ?? 16;
    const metrics = getTextMetrics(element.properties.content ?? "", fontSize);
    return buildBounds(
      element.position_x,
      element.position_y,
      element.position_x + metrics.width,
      element.position_y + metrics.height,
    );
  }

  if (element.element_type === "Shape" && element.properties.shapeType === "circle") {
    const radius = Math.max(1, Math.hypot(element.width || 0, element.height || 0));
    return buildBounds(
      element.position_x - radius,
      element.position_y - radius,
      element.position_x + radius,
      element.position_y + radius,
    );
  }

  if (RECT_LIKE_TYPES.has(element.element_type)) {
    const rectX = Math.min(element.position_x, element.position_x + element.width);
    const rectY = Math.min(element.position_y, element.position_y + element.height);
    const rectWidth = Math.abs(element.width);
    const rectHeight = Math.abs(element.height);
    return buildBounds(rectX, rectY, rectX + rectWidth, rectY + rectHeight);
  }

  const rectX = Math.min(element.position_x, element.position_x + element.width);
  const rectY = Math.min(element.position_y, element.position_y + element.height);
  const rectWidth = Math.abs(element.width);
  const rectHeight = Math.abs(element.height);
  return buildBounds(rectX, rectY, rectX + rectWidth, rectY + rectHeight);
};

const findAlignmentSnap = (
  movingBounds: ElementBounds,
  otherBounds: ElementBounds[],
  threshold: number,
) => {
  const movingX = [
    { label: "left", value: movingBounds.left },
    { label: "center", value: movingBounds.centerX },
    { label: "right", value: movingBounds.right },
  ];
  const movingY = [
    { label: "top", value: movingBounds.top },
    { label: "center", value: movingBounds.centerY },
    { label: "bottom", value: movingBounds.bottom },
  ];

  let bestX: AxisSnap | null = null;
  let bestY: AxisSnap | null = null;

  for (const other of otherBounds) {
    const otherX = [other.left, other.centerX, other.right];
    const otherY = [other.top, other.centerY, other.bottom];

    for (const moving of movingX) {
      for (const value of otherX) {
        const distance = Math.abs(moving.value - value);
        if (distance > threshold) continue;
        if (!bestX || distance < bestX.distance) {
          bestX = {
            distance,
            delta: value - moving.value,
            guide: {
              orientation: "vertical",
              position: value,
              start: Math.min(movingBounds.top, other.top),
              end: Math.max(movingBounds.bottom, other.bottom),
            },
          };
        }
      }
    }

    for (const moving of movingY) {
      for (const value of otherY) {
        const distance = Math.abs(moving.value - value);
        if (distance > threshold) continue;
        if (!bestY || distance < bestY.distance) {
          bestY = {
            distance,
            delta: value - moving.value,
            guide: {
              orientation: "horizontal",
              position: value,
              start: Math.min(movingBounds.left, other.left),
              end: Math.max(movingBounds.right, other.right),
            },
          };
        }
      }
    }
  }

  return { bestX, bestY };
};

const resolveAxisSnap = (
  alignment: AxisSnap | null,
  gridDelta: number | null,
  gridDistance: number | null,
  preferAlignment: boolean,
  tieEps: number,
) => {
  if (!alignment && gridDelta === null) {
    return { delta: 0, guide: null };
  }
  if (alignment && gridDelta === null) {
    return { delta: alignment.delta, guide: alignment.guide };
  }
  if (!alignment && gridDelta !== null) {
    return { delta: gridDelta, guide: null };
  }

  const alignmentDistance = alignment ? alignment.distance : Infinity;
  const gridDistanceValue = gridDistance ?? Infinity;
  if (alignmentDistance + tieEps < gridDistanceValue) {
    return { delta: alignment?.delta ?? 0, guide: alignment?.guide ?? null };
  }
  if (gridDistanceValue + tieEps < alignmentDistance) {
    return { delta: gridDelta ?? 0, guide: null };
  }
  if (preferAlignment) {
    return { delta: alignment?.delta ?? 0, guide: alignment?.guide ?? null };
  }
  return { delta: gridDelta ?? 0, guide: null };
};

export const resolveSnapPosition = (
  element: BoardElement,
  proposedAnchor: Point,
  otherElements: BoardElement[],
  options: SnapOptions,
) => {
  if (!options.allowSnap) {
    return { position: proposedAnchor, guides: [] as SnapGuide[] };
  }

  const alignmentThreshold =
    options.alignmentThreshold ?? DEFAULT_ALIGNMENT_THRESHOLD;
  const alignTieEps = options.alignmentTieBreak ?? ALIGNMENT_TIE_EPS;
  const movedElement = applyAnchorPosition(element, proposedAnchor);
  const movingBounds = getElementBounds(movedElement);
  const otherBounds = otherElements.map(getElementBounds);
  const { bestX, bestY } = alignmentThreshold > 0
    ? findAlignmentSnap(
        movingBounds,
        otherBounds,
        alignmentThreshold,
      )
    : { bestX: null, bestY: null };

  let gridDeltaX: number | null = null;
  let gridDeltaY: number | null = null;
  let gridDistanceX: number | null = null;
  let gridDistanceY: number | null = null;
  if (options.gridEnabled && options.snapToGrid) {
    const safeGrid = Math.max(1, options.gridSize);
    const snapX = Math.round(proposedAnchor.x / safeGrid) * safeGrid;
    const snapY = Math.round(proposedAnchor.y / safeGrid) * safeGrid;
    gridDeltaX = snapX - proposedAnchor.x;
    gridDeltaY = snapY - proposedAnchor.y;
    gridDistanceX = Math.abs(gridDeltaX);
    gridDistanceY = Math.abs(gridDeltaY);
  }

  const preferAlignment = true;
  const resolvedX = resolveAxisSnap(
    bestX,
    gridDeltaX,
    gridDistanceX,
    preferAlignment,
    alignTieEps,
  );
  const resolvedY = resolveAxisSnap(
    bestY,
    gridDeltaY,
    gridDistanceY,
    preferAlignment,
    alignTieEps,
  );

  const guides: SnapGuide[] = [];
  if (resolvedX.guide) guides.push(resolvedX.guide);
  if (resolvedY.guide) guides.push(resolvedY.guide);

  return {
    position: {
      x: proposedAnchor.x + resolvedX.delta,
      y: proposedAnchor.y + resolvedY.delta,
    },
    guides,
  };
};
