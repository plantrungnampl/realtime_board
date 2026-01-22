import type { BoardElement } from "@/types/board";

export const SUPPORTS_FILL = new Set<BoardElement["element_type"]>([
  "Shape",
  "StickyNote",
  "Frame",
  "Image",
  "Video",
  "Embed",
  "Document",
  "Component",
]);

export const SUPPORTS_STROKE = new Set<BoardElement["element_type"]>([
  "Shape",
  "StickyNote",
  "Frame",
  "Image",
  "Video",
  "Embed",
  "Document",
  "Component",
  "Connector",
  "Drawing",
]);

export const SUPPORTS_QUICK_CREATE = new Set<BoardElement["element_type"]>([
  "Shape",
  "StickyNote",
  "Frame",
]);

export const ROUTE_OBSTACLES = new Set<BoardElement["element_type"]>([
  "Shape",
  "StickyNote",
  "Frame",
  "Image",
  "Video",
  "Embed",
  "Document",
  "Component",
  "Text",
]);
