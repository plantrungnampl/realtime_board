import type { BoardElement } from "@/types/board";
import { getElementBounds } from "@/features/boards/elementMove.utils";

const MIN_ELEMENT_SIZE = 12;

export const isRectLikeElement = (element: BoardElement) =>
  [
    "Shape",
    "StickyNote",
    "Image",
    "Video",
    "Frame",
    "Embed",
    "Document",
    "Component",
  ].includes(element.element_type);

export const shouldDiscardElement = (element: BoardElement) => {
  if (isRectLikeElement(element)) {
    return (
      Math.abs(element.width) < MIN_ELEMENT_SIZE ||
      Math.abs(element.height) < MIN_ELEMENT_SIZE
    );
  }
  if (element.element_type === "Connector") {
    const { start, end } = element.properties;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    return length < MIN_ELEMENT_SIZE;
  }
  if (element.element_type === "Drawing") {
    const points = element.properties.points || [];
    return points.length < 4;
  }
  return false;
};

export const normalizeRotation = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  let next = value % 360;
  if (next < 0) {
    next += 360;
  }
  return next >= 360 ? 0 : next;
};

export const normalizeRectElement = (element: BoardElement) => {
  const rectX = Math.min(element.position_x, element.position_x + element.width);
  const rectY = Math.min(element.position_y, element.position_y + element.height);
  return {
    ...element,
    position_x: rectX,
    position_y: rectY,
    width: Math.abs(element.width),
    height: Math.abs(element.height),
  };
};

export const normalizeConnectorBounds = (element: BoardElement) => {
  if (element.element_type !== "Connector") {
    return element;
  }
  const bounds = getElementBounds(element);
  return {
    ...element,
    position_x: bounds.left,
    position_y: bounds.top,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top),
  };
};

export const cloneBoardElement = <T extends BoardElement>(
  element: T,
  overrides: Partial<T>,
): T => ({ ...element, ...overrides });
