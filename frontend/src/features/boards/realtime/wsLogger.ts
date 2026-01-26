import { clientLogger } from "@/lib/logger";

const wsLogger = clientLogger.child({ module: "websocket" });

export const logWsConnect = (boardId: string, attempt: number) => {
  wsLogger.info("WebSocket connecting", {
    board_id: boardId,
    attempt,
  });
};

export const logWsConnected = (boardId: string) => {
  wsLogger.info("WebSocket connected", {
    board_id: boardId,
  });
};

export const logWsDisconnected = (boardId: string, code: number, reason: string) => {
  wsLogger.info("WebSocket disconnected", {
    board_id: boardId,
    close_code: code,
    reason,
  });
};

export const logWsError = (boardId: string) => {
  wsLogger.warn("WebSocket error", {
    board_id: boardId,
  });
};

export const logWsMessage = (boardId: string, messageType: string, sizeBytes: number) => {
  wsLogger.debug("WebSocket message", {
    board_id: boardId,
    message_type: messageType,
    size_bytes: sizeBytes,
  });
};

export const logWsSyncComplete = (boardId: string, durationMs: number | null) => {
  wsLogger.info("WebSocket sync completed", {
    board_id: boardId,
    duration_ms: durationMs ?? undefined,
  });
};
