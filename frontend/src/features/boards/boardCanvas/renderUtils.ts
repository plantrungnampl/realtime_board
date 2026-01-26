import { Graphics as PixiGraphics } from "pixi.js";
import type { BoardElement } from "@/types/board";
import { normalizeOrthogonalPoints } from "./connectorRouting";

export { normalizeOrthogonalPoints };

export const SELECTION_STROKE = "#60A5FA";

export const coerceNumber = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value) ? (value as number) : fallback;

export const clampColor = (value: number, fallback: number) =>
  Number.isFinite(value) && value >= 0 && value <= 0xffffff ? value : fallback;

export const parseColor = (value?: string, fallback = 0x000000) => {
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
  const storedPoints = element.properties?.points;
  if (Array.isArray(storedPoints)) {
    if (!isValidPointArray(storedPoints)) return null;
    return normalizeOrthogonalPoints(storedPoints);
  }
  const endpoints = resolveConnectorEndpoints(element);
  if (!endpoints) return null;
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
