import { Graphics as PixiGraphics } from "pixi.js";
import type { BoardElement } from "@/types/board";
import { normalizeOrthogonalPoints } from "@/features/boards/boardCanvas/connectorRouting";

export const DOUBLE_TAP_THRESHOLD = 350;

export const coerceNumber = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value) ? (value as number) : fallback;

export const clampColor = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 && value <= 0xffffff ? value : fallback;

const COLOR_CACHE_MAX_SIZE = 500;
const colorCache = new Map<string, number>();

export const parseColor = (value?: string, fallback = 0x000000) => {
  if (!value) return fallback;
  if (value === "transparent") return fallback;

  const cacheKey = `${value}_${fallback}`;
  const cached = colorCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result = fallback;
  if (value.startsWith("#")) {
    result = clampColor(Number.parseInt(value.slice(1), 16), fallback);
  } else if (value.startsWith("rgb")) {
    const parts = value.match(/\d+(\.\d+)?/g);
    if (parts && parts.length >= 3) {
      const [r, g, b] = parts.map((part) => Math.max(0, Math.min(255, Number(part))));
      result = clampColor((r << 16) + (g << 8) + b, fallback);
    }
  } else {
    const hex = Number.parseInt(value.replace(/[^0-9A-Fa-f]/g, ""), 16);
    result = clampColor(Number.isFinite(hex) ? hex : fallback, fallback);
  }

  if (colorCache.size >= COLOR_CACHE_MAX_SIZE) {
    const firstKey = colorCache.keys().next().value;
    if (firstKey !== undefined) colorCache.delete(firstKey);
  }
  colorCache.set(cacheKey, result);

  return result;
};

const fillStyleCache = new Map<string, { color: number; alpha: number }>();

export const resolveFillStyle = (value?: string, fallback = 0x000000) => {
  if (!value || value === "transparent") {
    return { color: fallback, alpha: 0 };
  }

  const cacheKey = `${value}_${fallback}`;
  const cached = fillStyleCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result;
  if (value.startsWith("rgba")) {
    const parts = value.match(/\d+(\.\d+)?/g);
    if (!parts || parts.length < 4) {
      result = { color: fallback, alpha: 0 };
    } else {
      const [r, g, b, a] = parts.map((part) => Number(part));
      const color = clampColor(
        (Math.max(0, Math.min(255, r)) << 16)
          + (Math.max(0, Math.min(255, g)) << 8)
          + Math.max(0, Math.min(255, b)),
        fallback,
      );
      const alpha = Math.max(0, Math.min(1, a));
      result = { color, alpha };
    }
  } else {
    result = { color: parseColor(value, fallback), alpha: 1 };
  }

  if (fillStyleCache.size >= COLOR_CACHE_MAX_SIZE) {
    const firstKey = fillStyleCache.keys().next().value;
    if (firstKey !== undefined) fillStyleCache.delete(firstKey);
  }
  fillStyleCache.set(cacheKey, result);

  return result;
};

export const isValidDrawingPoints = (points: number[]) =>
  points.length >= 4 && points.every((value) => Number.isFinite(value));

export const isValidPointArray = (points: number[]) =>
  points.length >= 2 && points.every((value) => Number.isFinite(value));

export const buildOrthogonalFallbackPoints = (start: { x: number; y: number }, end: { x: number; y: number }) =>
  [start.x, start.y, end.x, start.y, end.x, end.y];

export const getRectBounds = (element: BoardElement) => {
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

export const toRectBounds = (bounds: { left: number; right: number; top: number; bottom: number }) => ({
  x: bounds.left,
  y: bounds.top,
  width: bounds.right - bounds.left,
  height: bounds.bottom - bounds.top,
});

export const resolveConnectorEndpoints = (element: BoardElement) => {
  if (element.element_type !== "Connector") return null;
  const start = element.properties?.start;
  const end = element.properties?.end;
  if (!start || !end) return null;
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) {
    return null;
  }
  return { start, end };
};

export const resolveConnectorPoints = (element: BoardElement) => {
  if (element.element_type !== "Connector") return null;
  const routingMode = element.properties?.routing?.mode;
  const storedPoints = element.properties?.points;
  if (Array.isArray(storedPoints)) {
    if (!isValidPointArray(storedPoints)) return null;
    if (routingMode === "straight") {
      return storedPoints;
    }
    return normalizeOrthogonalPoints(storedPoints);
  }
  const endpoints = resolveConnectorEndpoints(element);
  if (!endpoints) return null;
  if (routingMode === "straight") {
    return [
      endpoints.start.x,
      endpoints.start.y,
      endpoints.end.x,
      endpoints.end.y,
    ];
  }
  return buildOrthogonalFallbackPoints(endpoints.start, endpoints.end);
};

export const setStrokeStyle = (graphics: PixiGraphics, width: number, color: number, alpha = 1) => {
  graphics.setStrokeStyle({ width, color, alpha, alignment: 0.5 });
};

export const setFillStyle = (graphics: PixiGraphics, color: number, alpha = 1) => {
  graphics.setFillStyle({ color, alpha });
};

export const drawPolyline = (graphics: PixiGraphics, points: number[], strokeWidth: number, strokeColor: number) => {
  if (points.length < 4) return;
  setStrokeStyle(graphics, strokeWidth, strokeColor);
  graphics.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    graphics.lineTo(points[i], points[i + 1]);
  }
  graphics.stroke();
};

export const applyStrokeAndFill = (
  graphics: PixiGraphics,
  element: BoardElement,
  defaultFill: number,
) => {
  const stroke = parseColor(element.style.stroke, 0xffffff);
  const fill = resolveFillStyle(element.style.fill, defaultFill);
  const strokeWidth = element.style.strokeWidth ?? 1;
  setStrokeStyle(graphics, strokeWidth, stroke);
  setFillStyle(graphics, fill.color, fill.alpha);
};

export const drawRectShape = (
  graphics: PixiGraphics,
  element: BoardElement,
  rect: { width: number; height: number },
  defaultFill: number = 0x000000,
) => {
  graphics.clear();
  applyStrokeAndFill(graphics, element, defaultFill);
  graphics.rect(0, 0, rect.width, rect.height);
  graphics.fill();
  graphics.stroke();
};

export const drawCircleShape = (
  graphics: PixiGraphics,
  element: BoardElement,
  radius: number,
  defaultFill: number = 0x000000,
) => {
  graphics.clear();
  applyStrokeAndFill(graphics, element, defaultFill);
  graphics.circle(0, 0, radius);
  graphics.fill();
  graphics.stroke();
};

export const drawRoundedRectShape = (
  graphics: PixiGraphics,
  element: BoardElement,
  rect: { width: number; height: number },
  defaultFill: number = 0xfff9c2,
) => {
  graphics.clear();
  applyStrokeAndFill(graphics, element, defaultFill);
  graphics.roundRect(0, 0, rect.width, rect.height, element.style.cornerRadius ?? 12);
  graphics.fill();
  graphics.stroke();
};
