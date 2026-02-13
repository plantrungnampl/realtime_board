export interface Board {
  id: string;
  created_by: string;
  organization_id?: string;
  name: string;
  username: string;
  description?: string;
  thumbnail_url?: string;
  is_favorite?: boolean;
  last_accessed_at?: string | null;
  is_public?: boolean;
  is_template?: boolean;
  archived_at?: string | null;
  deleted_at?: string | null;
  canvas_settings?: CanvasSettings;
  created_at: string;
  updated_at: string;
}

export interface CanvasSettings {
  width: number;
  height: number;
  backgroundColor: string;
  gridSize: number;
  gridEnabled: boolean;
  snapToGrid: boolean;
  showRulers: boolean;
  defaultZoom: number;
}

export interface CreateBoardRequest {
  name: string;
  description?: string;
  organization_id?: string;
  is_public?: boolean;
  is_template?: boolean;
  template_board_id?: string;
  thumbnail_url?: string;
  canvas_settings?: CanvasSettings;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
  is_public?: boolean;
}

export interface TransferBoardOwnershipRequest {
  new_owner_id: string;
}

export type BoardRole = "owner" | "admin" | "editor" | "commenter" | "viewer";

export interface BoardPermissions {
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  canManageMembers: boolean;
  canManageBoard: boolean;
}

export type CommentStatus = "open" | "resolved" | "archived";

export interface CommentUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

export interface BoardComment {
  id: string;
  board_id: string;
  element_id?: string | null;
  parent_id?: string | null;
  created_by: string;
  author: CommentUser;
  position_x?: number | null;
  position_y?: number | null;
  content: string;
  content_html?: string | null;
  mentions: string[];
  status: CommentStatus;
  resolved_by?: string | null;
  resolved_at?: string | null;
  is_edited: boolean;
  edited_at?: string | null;
  reply_count: number;
  created_at: string;
  updated_at: string;
}

export interface CommentPagination {
  next_cursor?: string | null;
  has_more: boolean;
}

export interface CommentListResponse {
  data: BoardComment[];
  pagination: CommentPagination;
}

export interface CreateBoardCommentRequest {
  content: string;
  content_html?: string | null;
  element_id?: string | null;
  position_x?: number | null;
  position_y?: number | null;
  mentions?: string[];
}

export interface ListBoardCommentsQuery {
  element_id?: string;
  parent_id?: string;
  status?: CommentStatus;
  limit?: number;
  cursor?: string;
}

export interface BoardPermissionOverrides {
  canView?: boolean;
  canEdit?: boolean;
  canComment?: boolean;
  canManageMembers?: boolean;
  canManageBoard?: boolean;
}

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
  custom_permissions?: BoardPermissionOverrides | null;
  effective_permissions?: BoardPermissions;
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
  custom_permissions?: BoardPermissionOverrides | null;
}

export interface BoardActionMessage {
  message: string;
}

export interface BoardFavoriteResponse {
  is_favorite: boolean;
}

export interface CreateBoardElementRequest {
  id?: string;
  element_type: ElementType;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation?: number;
  layer_id?: string | null;
  parent_id?: string | null;
  style?: ElementStyle;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface BoardElementResponse {
  id: string;
  board_id: string;
  layer_id?: string | null;
  parent_id?: string | null;
  created_by?: string;
  element_type: ElementType;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  style: ElementStyle;
  properties: Record<string, unknown>;
  version: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateBoardElementRequest {
  expected_version: number;
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  style?: ElementStyle;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface BoardElementUpdateResponse {
  id: string;
  version: number;
  updated_at: string;
}

export interface DeleteBoardElementResponse {
  id: string;
  version: number;
  deleted_at: string;
  updated_at: string;
  already_deleted?: boolean | null;
}

export interface RestoreBoardElementResponse {
  id: string;
  version: number;
  deleted_at?: string | null;
  updated_at: string;
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
  dragging?: DragPresence | null;
}

export type SelectionEditMode = "drag" | "resize" | "text";

export type SelectionPresence = {
  user_id: string;
  user_name: string;
  avatar_url?: string | null;
  color: string;
  element_ids: string[];
  editing?: { element_id: string; mode: SelectionEditMode } | null;
};

export type PresenceStatus = "online" | "idle" | "away";

export interface PresenceUser {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  status: PresenceStatus;
  color?: string;
}

export interface DragPresence {
  element_id: string;
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  rotation?: number;
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
  textColor?: string;
}

interface BoardElementBase {
  id: string;
  board_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation?: number;
  z_index?: number;
  version?: number;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  style: ElementStyle;
}

export interface ShapeElement extends BoardElementBase {
  element_type: "Shape";
  properties: {
    shapeType: "rectangle" | "circle" | "triangle";
  };
}

export interface TextElement extends BoardElementBase {
  element_type: "Text";
  properties: {
    content: string;
  };
}

export interface StickyNoteElement extends BoardElementBase {
  element_type: "StickyNote";
  properties: {
    content: string;
  };
}

export interface ImageElement extends BoardElementBase {
  element_type: "Image";
  properties: {
    src?: string | null;
    alt?: string;
  };
}

export interface VideoElement extends BoardElementBase {
  element_type: "Video";
  properties: {
    src?: string | null;
    provider?: string;
  };
}

export interface FrameElement extends BoardElementBase {
  element_type: "Frame";
  properties: {
    title?: string;
    clipContent?: boolean;
  };
}

export interface ConnectorElement extends BoardElementBase {
  element_type: "Connector";
  properties: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    points?: number[];
    routing?: {
      mode: "straight" | "orthogonal";
      lock?: boolean;
    };
    bindings?: {
      start?: {
        elementId: string;
        side: "top" | "right" | "bottom" | "left" | "auto";
      };
      end?: {
        elementId: string;
        side: "top" | "right" | "bottom" | "left" | "auto";
      };
    };
  };
}

export interface DrawingElement extends BoardElementBase {
  element_type: "Drawing";
  properties: {
    points: number[];
  };
}

export interface EmbedElement extends BoardElementBase {
  element_type: "Embed";
  properties: {
    url?: string | null;
  };
}

export interface DocumentElement extends BoardElementBase {
  element_type: "Document";
  properties: {
    title?: string;
  };
}

export interface ComponentElement extends BoardElementBase {
  element_type: "Component";
  properties: {
    name?: string;
  };
}

export type BoardElement =
  | ShapeElement
  | TextElement
  | StickyNoteElement
  | ImageElement
  | VideoElement
  | FrameElement
  | ConnectorElement
  | DrawingElement
  | EmbedElement
  | DocumentElement
  | ComponentElement;

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

export type SelectionOverlay = {
  key: string;
  element: BoardElement;
  color: string;
  label?: string;
};
