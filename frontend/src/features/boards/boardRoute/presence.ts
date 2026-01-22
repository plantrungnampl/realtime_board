import type {
  CursorBroadcast,
  DragPresence,
  PresenceUser,
  SelectionEditMode,
  SelectionPresence,
} from "@/types/board";
import type { Awareness } from "y-protocols/awareness";

export type PresenceUserPayload = {
  user_id?: string;
  display_name?: string;
  avatar_url?: string | null;
  status?: string;
};

export type BoardJoinedPayload = {
  board_id?: string;
  session_id?: string;
  current_users?: PresenceUserPayload[];
};

export type ServerEvent = {
  type: string;
  payload?: unknown;
};

type AwarenessState = {
  user?: {
    id?: string;
    name?: string;
    avatar?: string | null;
  };
  cursor?: { x: number; y: number } | null;
  cursor_updated_at?: number;
  selection?: string[];
  selection_updated_at?: number;
  editing?: { element_id: string; mode: SelectionEditMode } | null;
  drag?: DragPresence | null;
  color?: string;
  status?: string;
  updated_at?: number;
};

const CURSOR_COLORS = [
  "#EAB308",
  "#38BDF8",
  "#F472B6",
  "#34D399",
  "#F97316",
  "#A78BFA",
  "#F43F5E",
  "#22D3EE",
  "#A3E635",
];
const FALLBACK_CURSOR_COLOR = "#EAB308";

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const resolvePresenceName = (value: unknown) =>
  typeof value === "string" ? value : "Anonymous";

const resolvePresenceAvatar = (value: unknown) =>
  typeof value === "string" ? value : null;

const resolvePresenceColor = (value: unknown) =>
  typeof value === "string" ? value : FALLBACK_CURSOR_COLOR;

export const getCursorColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
};

export const normalizePresenceStatus = (
  value: unknown,
): PresenceUser["status"] => {
  if (value === "idle" || value === "away" || value === "online") return value;
  return "online";
};

export const parseServerEvent = (value: unknown): ServerEvent | null => {
  const record = asRecord(value);
  if (!record) return null;
  const type = record.type;
  if (typeof type !== "string") return null;
  return { type, payload: record.payload };
};

export const parsePresenceUser = (
  payload: PresenceUserPayload,
): PresenceUser | null => {
  if (!payload || typeof payload !== "object") return null;
  const userId = payload.user_id;
  const displayName = payload.display_name;
  if (typeof userId !== "string" || typeof displayName !== "string") return null;
  const avatarUrl =
    typeof payload.avatar_url === "string" || payload.avatar_url === null
      ? payload.avatar_url
      : undefined;
  return {
    user_id: userId,
    display_name: displayName,
    avatar_url: avatarUrl,
    status: normalizePresenceStatus(payload.status),
    color: getCursorColor(userId),
  };
};

export const parseBoardJoinedPayload = (
  payload: unknown,
): BoardJoinedPayload | null => {
  const record = asRecord(payload);
  if (!record) return null;
  const currentUsers = Array.isArray(record.current_users)
    ? (record.current_users as PresenceUserPayload[])
    : undefined;
  return {
    board_id: typeof record.board_id === "string" ? record.board_id : undefined,
    session_id: typeof record.session_id === "string" ? record.session_id : undefined,
    current_users: currentUsers,
  };
};

export const buildCursorMap = (
  awareness: Awareness,
  cursorIdleMs: number,
): Record<string, CursorBroadcast> => {
  const selected: Record<string, CursorBroadcast & { last_seen: number }> = {};
  const now = Date.now();
  awareness.getStates().forEach((state, clientId) => {
    if (!state || clientId === awareness.clientID) return;
    const typedState = state as AwarenessState;
    const cursor = typedState.cursor;
    const drag = normalizeDragPresence(typedState.drag);
    const hasCursor =
      typeof cursor?.x === "number" && typeof cursor?.y === "number";
    const hasDrag = drag !== null;
    if (!hasCursor && !hasDrag) return;
    const userState = typedState.user;
    const lastSeen =
      typeof typedState.cursor_updated_at === "number"
        ? typedState.cursor_updated_at
        : 0;
    if (lastSeen === 0 || now - lastSeen > cursorIdleMs) {
      return;
    }
    const userId = typeof userState?.id === "string" ? userState.id : "";
    const key = userId ? `user:${userId}` : `client:${clientId}`;
    const existing = selected[key];
    if (existing && existing.last_seen >= lastSeen) {
      return;
    }

    selected[key] = {
      client_id: clientId,
      user_id: userId,
      user_name: resolvePresenceName(userState?.name),
      avatar_url: resolvePresenceAvatar(userState?.avatar),
      x: typeof cursor?.x === "number" ? cursor.x : null,
      y: typeof cursor?.y === "number" ? cursor.y : null,
      color: resolvePresenceColor(typedState.color),
      status:
        typeof typedState.status === "string" ? typedState.status : undefined,
      dragging: drag,
      last_seen: lastSeen,
    };
  });
  const next: Record<string, CursorBroadcast> = {};
  Object.entries(selected).forEach(([key, value]) => {
    next[key] = {
      client_id: value.client_id,
      user_id: value.user_id,
      user_name: value.user_name,
      avatar_url: value.avatar_url,
      x: value.x,
      y: value.y,
      color: value.color,
      status: value.status,
      dragging: value.dragging ?? null,
    };
  });
  return next;
};

export const normalizeSelectionIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry === "string" && entry.trim() !== "") {
      unique.add(entry);
    }
  });
  return Array.from(unique).sort();
};

export const areSelectionsEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

const normalizeEditingPresence = (value: unknown) => {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.element_id !== "string") return null;
  if (record.mode !== "drag" && record.mode !== "resize" && record.mode !== "text") {
    return null;
  }
  return {
    element_id: record.element_id,
    mode: record.mode,
  } as { element_id: string; mode: SelectionEditMode };
};

export const buildSelectionPresence = (
  awareness: Awareness,
  localUserId: string,
  selectionStaleMs: number,
): SelectionPresence[] => {
  const entries: Array<SelectionPresence & { last_seen: number }> = [];
  const now = Date.now();
  awareness.getStates().forEach((state, clientId) => {
    if (!state || clientId === awareness.clientID) return;
    const typedState = state as AwarenessState;
    const lastSeen =
      typeof typedState.selection_updated_at === "number"
        ? typedState.selection_updated_at
        : 0;
    if (lastSeen === 0 || now - lastSeen > selectionStaleMs) {
      return;
    }
    const userState = typedState.user;
    const userId = typeof userState?.id === "string" ? userState.id : "";
    if (userId && userId === localUserId) return;
    const editing = normalizeEditingPresence(typedState.editing);
    let selection = normalizeSelectionIds(typedState.selection);
    if (editing && !selection.includes(editing.element_id)) {
      selection = [...selection, editing.element_id];
    }
    if (selection.length === 0 && !editing) return;
    entries.push({
      user_id: userId,
      user_name: resolvePresenceName(userState?.name),
      avatar_url: resolvePresenceAvatar(userState?.avatar),
      color: resolvePresenceColor(typedState.color),
      element_ids: selection,
      editing,
      last_seen: lastSeen,
    });
  });
  entries.sort((a, b) => b.last_seen - a.last_seen);
  return entries.map((entry) => {
    const sanitized = { ...entry };
    delete (sanitized as { last_seen?: number }).last_seen;
    return sanitized;
  });
};

const normalizeDragPresence = (value: unknown): DragPresence | null => {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.element_id !== "string") return null;
  if (typeof record.position_x !== "number") return null;
  if (typeof record.position_y !== "number") return null;
  const drag: DragPresence = {
    element_id: record.element_id,
    position_x: record.position_x,
    position_y: record.position_y,
  };
  if (typeof record.width === "number") {
    drag.width = record.width;
  }
  if (typeof record.height === "number") {
    drag.height = record.height;
  }
  if (typeof record.rotation === "number") {
    drag.rotation = record.rotation;
  }
  return drag;
};
