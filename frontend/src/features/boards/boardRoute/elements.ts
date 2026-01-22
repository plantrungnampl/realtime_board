import type {
  BoardElement,
  ComponentElement,
  DocumentElement,
  EmbedElement,
  ImageElement,
  VideoElement,
} from "@/types/board";
import type { Point } from "@/features/boards/boardRoute.utils";
import type { ToolType } from "@/features/boards/boardRoute/tools";

export const DEFAULT_TEXT_STYLE = { fontSize: 20, fill: "#ffffff" };
export const DEFAULT_SHAPE_STYLE = {
  stroke: "#ffffff",
  strokeWidth: 2,
  fill: "transparent",
};
const DEFAULT_DRAWING_STYLE = { stroke: "#EAB308", strokeWidth: 3 };
export const DEFAULT_STICKY_STYLE = {
  fill: "#FDE68A",
  stroke: "#F59E0B",
  strokeWidth: 1,
  cornerRadius: 12,
  fontSize: 16,
  textColor: "#1F2937",
};
const DEFAULT_MEDIA_STYLE = {
  fill: "#0f172a",
  stroke: "#334155",
  strokeWidth: 1,
  cornerRadius: 12,
};
const DEFAULT_FRAME_STYLE = {
  fill: "transparent",
  stroke: "#FBBF24",
  strokeWidth: 1.5,
};
const DEFAULT_CONNECTOR_STYLE = { stroke: "#E5E7EB", strokeWidth: 2 };

type MediaElementMap = {
  Image: ImageElement;
  Video: VideoElement;
  Embed: EmbedElement;
  Document: DocumentElement;
  Component: ComponentElement;
};
type MediaElementType = keyof MediaElementMap;

const createShapeElement = (
  boardId: string,
  id: string,
  position: Point,
  shapeType: "rectangle" | "circle",
  zIndex: number,
): BoardElement => ({
  id,
  board_id: boardId,
  element_type: "Shape",
  position_x: position.x,
  position_y: position.y,
  width: 1,
  height: 1,
  rotation: 0,
  z_index: zIndex,
  style: { ...DEFAULT_SHAPE_STYLE },
  properties: { shapeType },
});

const createDrawingElement = (
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
): BoardElement => ({
  id,
  board_id: boardId,
  element_type: "Drawing",
  position_x: 0,
  position_y: 0,
  width: 1,
  height: 1,
  rotation: 0,
  z_index: zIndex,
  style: { ...DEFAULT_DRAWING_STYLE },
  properties: { points: [position.x, position.y] },
});

export const createTextElement = (
  boardId: string,
  position: Point,
  content: string,
  style: { fontSize: number; color: string },
  zIndex: number,
): BoardElement => ({
  id: crypto.randomUUID(),
  board_id: boardId,
  element_type: "Text",
  position_x: position.x,
  position_y: position.y,
  width: 1,
  height: 1,
  rotation: 0,
  z_index: zIndex,
  style: { fontSize: style.fontSize, fill: style.color },
  properties: { content },
});

const createStickyNoteElement = (
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
): BoardElement => ({
  id,
  board_id: boardId,
  element_type: "StickyNote",
  position_x: position.x,
  position_y: position.y,
  width: 1,
  height: 1,
  rotation: 0,
  z_index: zIndex,
  style: { ...DEFAULT_STICKY_STYLE },
  properties: { content: "" },
});

function createMediaElement(
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
  elementType: "Image",
): ImageElement;
function createMediaElement(
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
  elementType: "Video",
): VideoElement;
function createMediaElement(
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
  elementType: "Embed",
): EmbedElement;
function createMediaElement(
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
  elementType: "Document",
): DocumentElement;
function createMediaElement(
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
  elementType: "Component",
): ComponentElement;
function createMediaElement(
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
  elementType: MediaElementType,
): MediaElementMap[MediaElementType] {
  const base = {
    id,
    board_id: boardId,
    position_x: position.x,
    position_y: position.y,
    width: 1,
    height: 1,
    rotation: 0,
    z_index: zIndex,
    style: { ...DEFAULT_MEDIA_STYLE },
  };

  switch (elementType) {
    case "Image":
      return {
        ...base,
        element_type: "Image",
        properties: { src: null, alt: "" },
      };
    case "Video":
      return {
        ...base,
        element_type: "Video",
        properties: { src: null, provider: "" },
      };
    case "Embed":
      return {
        ...base,
        element_type: "Embed",
        properties: { url: null },
      };
    case "Document":
      return {
        ...base,
        element_type: "Document",
        properties: { title: "Document" },
      };
    case "Component":
      return {
        ...base,
        element_type: "Component",
        properties: { name: "Component" },
      };
    default: {
      const unreachable: never = elementType;
      throw new Error(`Unsupported media element type: ${unreachable}`);
    }
  }
}

const createFrameElement = (
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
): BoardElement => ({
  id,
  board_id: boardId,
  element_type: "Frame",
  position_x: position.x,
  position_y: position.y,
  width: 1,
  height: 1,
  rotation: 0,
  z_index: zIndex,
  style: { ...DEFAULT_FRAME_STYLE },
  properties: { title: "Frame", clipContent: true },
});

const createConnectorElement = (
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
): BoardElement => ({
  id,
  board_id: boardId,
  element_type: "Connector",
  position_x: position.x,
  position_y: position.y,
  width: 1,
  height: 1,
  rotation: 0,
  z_index: zIndex,
  style: { ...DEFAULT_CONNECTOR_STYLE },
  properties: {
    start: { x: position.x, y: position.y },
    end: { x: position.x, y: position.y },
  },
});

export const getNextZIndex = (elements: BoardElement[]) => {
  const maxZ = elements.reduce(
    (max, element) => Math.max(max, element.z_index ?? 0),
    0,
  );
  return maxZ + 1;
};

export const createElementForTool = (
  tool: ToolType,
  boardId: string,
  id: string,
  position: Point,
  zIndex: number,
): BoardElement | null => {
  switch (tool) {
    case "shape:rectangle":
      return createShapeElement(boardId, id, position, "rectangle", zIndex);
    case "shape:circle":
      return createShapeElement(boardId, id, position, "circle", zIndex);
    case "frame":
      return createFrameElement(boardId, id, position, zIndex);
    case "connector":
      return createConnectorElement(boardId, id, position, zIndex);
    case "drawing":
      return createDrawingElement(boardId, id, position, zIndex);
    case "sticky_note":
      return createStickyNoteElement(boardId, id, position, zIndex);
    case "image":
      return createMediaElement(boardId, id, position, zIndex, "Image");
    case "video":
      return createMediaElement(boardId, id, position, zIndex, "Video");
    case "embed":
      return createMediaElement(boardId, id, position, zIndex, "Embed");
    case "document":
      return createMediaElement(boardId, id, position, zIndex, "Document");
    case "component":
      return createMediaElement(boardId, id, position, zIndex, "Component");
    default:
      return null;
  }
};

export const sortElementsByZIndex = (items: BoardElement[]) => {
  const indexed = items.map((element, index) => ({ element, index }));
  indexed.sort((a, b) => {
    const zA = a.element.z_index ?? 0;
    const zB = b.element.z_index ?? 0;
    if (zA !== zB) {
      return zA - zB;
    }
    return a.index - b.index;
  });
  return indexed.map((item) => item.element);
};
