export interface Board {
  id: string;
  created_by: string;
  organization_id?: string;
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

export type BoardRole = "owner" | "admin" | "editor" | "commenter" | "viewer";

export interface BoardMemberUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface BoardMember {
  id: string;
  user: BoardMemberUser;
  role: BoardRole;
  created_at: string;
  updated_at: string;
}

export interface BoardMembersResponse {
  data: BoardMember[];
}

export interface InviteBoardMembersRequest {
  email?: string | null;
  emails?: string[];
  role?: BoardRole;
}

export interface InviteBoardMembersResponse {
  invited: string[];
}

export interface UpdateBoardMemberRoleRequest {
  role: BoardRole;
}

export interface BoardActionMessage {
  message: string;
}

export interface CursorMove {
  user_id: string;
  user_name: string;
  position_x: number;
  position_y: number;
  color: string;
  status: string;
}

export interface CursorBroadcast {
  client_id: number;
  user_id: string;
  user_name: string;
  x: number | null;
  y: number | null;
  color: string;
  status?: string;
  avatar_url?: string | null;
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
