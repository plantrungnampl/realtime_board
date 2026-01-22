import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { applyAwarenessUpdate } from "y-protocols/awareness";
import type { BoardPermissions, BoardRole } from "@/features/boards/types";

export const WS_MESSAGE = {
  SyncStep1: 0,
  SyncStep2: 1,
  Update: 2,
  Awareness: 3,
  RoleUpdate: 4,
} as const;

export type RoleUpdateEvent = {
  userId: string;
  role: BoardRole | null;
  permissions: BoardPermissions | null;
};

const parsePermissions = (value: unknown): BoardPermissions | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const keys = [
    "canView",
    "canEdit",
    "canComment",
    "canManageMembers",
    "canManageBoard",
  ] as const;
  const permissions: Partial<BoardPermissions> = {};
  for (const key of keys) {
    const field = record[key];
    if (typeof field !== "boolean") return null;
    permissions[key] = field;
  }
  return permissions as BoardPermissions;
};

const textDecoder = new TextDecoder();

export async function toUint8Array(
  data: Blob | ArrayBuffer | string,
): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return null;
}

export function createWsMessage(type: number, payload: Uint8Array) {
  const message = new Uint8Array(payload.length + 1);
  message[0] = type;
  message.set(payload, 1);
  return message;
}

export function handleWsMessage(
  bytes: Uint8Array,
  doc: Y.Doc,
  awareness: Awareness,
): RoleUpdateEvent | null {
  if (bytes.length === 0) return null;

  if (bytes[0] === WS_MESSAGE.Awareness) {
    const payload = bytes.subarray(1);
    if (payload.length === 0) return null;
    try {
      applyAwarenessUpdate(awareness, payload, "remote");
    } catch (error) {
      console.warn("awareness update failed", error);
    }
    return null;
  }

  if (bytes[0] === WS_MESSAGE.SyncStep1) {
    return null;
  }

  if (bytes[0] === WS_MESSAGE.SyncStep2) {
    const payload = bytes.subarray(1);
    if (payload.length === 0) return null;
    try {
      Y.applyUpdate(doc, payload, "remote");
    } catch (error) {
      console.error("applyUpdate failed", error, {
        len: bytes.length,
        head: Array.from(bytes.slice(0, 16)),
      });
    }
    return null;
  }

  if (bytes[0] === WS_MESSAGE.Update) {
    const payload = bytes.subarray(1);
    if (payload.length === 0) return null;
    try {
      Y.applyUpdate(doc, payload, "remote");
    } catch (error) {
      console.error("applyUpdate failed", error, {
        len: bytes.length,
        head: Array.from(bytes.slice(0, 16)),
      });
    }
    return null;
  }

  if (bytes[0] === WS_MESSAGE.RoleUpdate) {
    const payload = bytes.subarray(1);
    if (payload.length === 0) return null;
    try {
      const decoded = JSON.parse(textDecoder.decode(payload)) as {
        user_id?: string;
        role?: BoardRole | null;
        permissions?: unknown;
      };
      if (!decoded || typeof decoded.user_id !== "string") return null;
      const permissions = parsePermissions(decoded.permissions);
      return {
        userId: decoded.user_id,
        role: decoded.role ?? null,
        permissions,
      };
    } catch (error) {
      console.warn("role update decode failed", error);
    }
    return null;
  }

  console.warn("Unknown ws message type", bytes[0], bytes.length);
  return null;
}
