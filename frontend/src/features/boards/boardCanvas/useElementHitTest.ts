import { useCallback } from "react";

import type { BoardElement } from "@/types/board";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import {
  distanceToSegment,
  getTextMetrics,
  type Point,
} from "@/features/boards/boardRoute.utils";
import { isRectLikeElement } from "@/features/boards/boardCanvas/elementUtils";

type UseElementHitTestOptions = {
  renderElements: BoardElement[];
  stageScale: number;
};

export const useElementHitTest = ({
  renderElements,
  stageScale,
}: UseElementHitTestOptions) =>
  useCallback(
    (point: Point): BoardElement | null => {
      const threshold = 6 / stageScale;
      for (let index = renderElements.length - 1; index >= 0; index -= 1) {
        const el = renderElements[index];
        if (el.element_type === "Shape") {
          if (el.properties.shapeType === "rectangle") {
            const x2 = el.position_x + el.width;
            const y2 = el.position_y + el.height;
            const minX = Math.min(el.position_x, x2);
            const maxX = Math.max(el.position_x, x2);
            const minY = Math.min(el.position_y, y2);
            const maxY = Math.max(el.position_y, y2);
            if (
              point.x >= minX &&
              point.x <= maxX &&
              point.y >= minY &&
              point.y <= maxY
            ) {
              return el;
            }
          }

          if (el.properties.shapeType === "circle") {
            const radius = Math.hypot(el.width || 0, el.height || 0);
            const dx = point.x - el.position_x;
            const dy = point.y - el.position_y;
            if (dx * dx + dy * dy <= radius * radius) {
              return el;
            }
          }
        }

        if (isRectLikeElement(el) && el.element_type !== "Shape") {
          const x2 = el.position_x + el.width;
          const y2 = el.position_y + el.height;
          const minX = Math.min(el.position_x, x2);
          const maxX = Math.max(el.position_x, x2);
          const minY = Math.min(el.position_y, y2);
          const maxY = Math.max(el.position_y, y2);
          if (
            point.x >= minX &&
            point.x <= maxX &&
            point.y >= minY &&
            point.y <= maxY
          ) {
            return el;
          }
        }

        if (el.element_type === "Text") {
          const content = el.properties.content || "";
          const fontSize = el.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
          const { width, height } = getTextMetrics(content, fontSize);
          const padding = 4 / stageScale;
          if (
            point.x >= el.position_x - padding &&
            point.x <= el.position_x + width + padding &&
            point.y >= el.position_y - padding &&
            point.y <= el.position_y + height + padding
          ) {
            return el;
          }
        }

        if (el.element_type === "Connector") {
          const points = el.properties.points;
          if (points && points.length >= 4) {
            for (let i = 0; i < points.length - 2; i += 2) {
              const start = { x: points[i], y: points[i + 1] };
              const end = { x: points[i + 2], y: points[i + 3] };
              if (distanceToSegment(point, start, end) <= threshold) {
                return el;
              }
            }
          } else {
            const start = el.properties.start;
            const end = el.properties.end;
            if (distanceToSegment(point, start, end) <= threshold) {
              return el;
            }
          }
        }

        if (el.element_type === "Drawing") {
          const points = el.properties.points || [];
          const offsetX = el.position_x;
          const offsetY = el.position_y;
          for (let i = 0; i < points.length - 2; i += 2) {
            const start = {
              x: points[i] + offsetX,
              y: points[i + 1] + offsetY,
            };
            const end = {
              x: points[i + 2] + offsetX,
              y: points[i + 3] + offsetY,
            };
            if (distanceToSegment(point, start, end) <= threshold) {
              return el;
            }
          }
        }
      }
      return null;
    },
    [renderElements, stageScale],
  );
