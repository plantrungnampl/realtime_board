import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { applyAwarenessUpdate } from "y-protocols/awareness";

export const WS_MESSAGE = {
  SyncStep1: 0,
  SyncStep2: 1,
  Update: 2,
  Awareness: 3,
} as const;

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

export function handleWsMessage(bytes: Uint8Array, doc: Y.Doc, awareness: Awareness) {
  if (bytes.length === 0) return;

  if (bytes[0] === WS_MESSAGE.Awareness) {
    const payload = bytes.subarray(1);
    if (payload.length === 0) return;
    try {
      applyAwarenessUpdate(awareness, payload, "remote");
    } catch (error) {
      console.warn("awareness update failed", error);
    }
    return;
  }

  if (bytes[0] === WS_MESSAGE.SyncStep1) {
    return;
  }

  if (bytes[0] === WS_MESSAGE.SyncStep2) {
    const payload = bytes.subarray(1);
    if (payload.length === 0) return;
    try {
      Y.applyUpdate(doc, payload, "remote");
    } catch (error) {
      console.error("applyUpdate failed", error, {
        len: bytes.length,
        head: Array.from(bytes.slice(0, 16)),
      });
    }
    return;
  }

  if (bytes[0] === WS_MESSAGE.Update) {
    const payload = bytes.subarray(1);
    if (payload.length === 0) return;
    try {
      Y.applyUpdate(doc, payload, "remote");
    } catch (error) {
      console.error("applyUpdate failed", error, {
        len: bytes.length,
        head: Array.from(bytes.slice(0, 16)),
      });
    }
    return;
  }

  console.warn("Unknown ws message type", bytes[0], bytes.length);
}

