import { useEffect, useState } from "react";
import type { RefObject } from "react";
import type { KonvaEventObject } from "konva/lib/Node";

export type Point = { x: number; y: number };

const TEXT_CHAR_WIDTH = 0.6;
const TEXT_LINE_HEIGHT = 1.2;
const DEFAULT_PAGE_BACKGROUND = "#141414";

export const getPointerPosition = (
  event: KonvaEventObject<MouseEvent>,
): Point | null => {
  const stage = event.target.getStage();
  if (!stage) return null;
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  const scaleX = stage.scaleX() || 1;
  const scaleY = stage.scaleY() || 1;
  const position = stage.position();
  return {
    x: (pointer.x - position.x) / scaleX,
    y: (pointer.y - position.y) / scaleY,
  };
};

export const getTextMetrics = (content: string, fontSize: number) => {
  const lines = content.split("\n");
  const longestLine = lines.reduce(
    (max, line) => Math.max(max, line.length),
    0,
  );
  return {
    width: Math.max(1, longestLine) * fontSize * TEXT_CHAR_WIDTH,
    height: Math.max(1, lines.length) * fontSize * TEXT_LINE_HEIGHT,
  };
};

export const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
    (dx * dx + dy * dy);
  const clamped = Math.min(1, Math.max(0, t));
  const closest = { x: start.x + clamped * dx, y: start.y + clamped * dy };
  return Math.hypot(point.x - closest.x, point.y - closest.y);
};

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const resolveBackgroundColor = (element: HTMLElement | null) => {
  if (!element || typeof window === "undefined") {
    return DEFAULT_PAGE_BACKGROUND;
  }
  const color = window.getComputedStyle(element).backgroundColor;
  if (!color || color === "rgba(0, 0, 0, 0)") {
    return DEFAULT_PAGE_BACKGROUND;
  }
  return color;
};

export const usePageBackgroundColor = (
  targetRef: RefObject<HTMLElement | null>,
) => {
  const [color, setColor] = useState(DEFAULT_PAGE_BACKGROUND);

  useEffect(() => {
    const target = targetRef.current ?? document.body;
    if (!target) return;
    const update = () => {
      const next = resolveBackgroundColor(target);
      setColor((prev) => (prev === next ? prev : next));
    };
    update();

    const observer = new MutationObserver(update);
    observer.observe(target, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, [targetRef]);

  return color;
};
