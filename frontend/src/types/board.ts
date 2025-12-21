export interface Board {
  id: string; // UUID
  created_by: string; // UUID
  organization_id?: string; // UUID
  name: string;
  username: string;
  description?: string;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBoardRequest {
  name: string;
  description?: string;
  organization_id?: string;
}

export interface CursorMove {
  x: number;
  y: number;
}

export interface CursorBroadcast {
  user_id: string; // UUID
  x: number;
  y: number;
}

export interface ElementStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  cornerRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: string;
}

// Discriminated Unions for BoardElement
interface BaseElement {
  id: string;
  board_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation?: number;
  style: ElementStyle;
}

export interface ShapeElement extends BaseElement {
  element_type: "Shape";
  properties: {
    shapeType: "rectangle" | "circle" | "triangle";
  };
}

export interface TextElement extends BaseElement {
  element_type: "Text";
  properties: {
    content: string;
  };
}

export interface DrawingElement extends BaseElement {
  element_type: "Drawing";
  properties: {
    points: number[];
  };
}

export type BoardElement = ShapeElement | TextElement | DrawingElement;

export type ElementType = BoardElement["element_type"];

export type WsActionType =
  | "ELEMENT_CREATE"
  | "ELEMENT_UPDATE"
  | "ELEMENT_FINISH"
  | "CURSOR_MOVE";

export interface WsBoardElementAction {
  action: WsActionType;
  payload: BoardElement | CursorMove;
}
