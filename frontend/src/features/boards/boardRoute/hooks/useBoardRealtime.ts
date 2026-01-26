import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BoardElement,
  CursorBroadcast,
  DragPresence,
  PresenceUser,
  SelectionEditMode,
  SelectionPresence,
} from "@/types/board";
import type { User } from "@/types/auth";
import { getToken } from "@/features/auth/storage";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  createWsMessage,
  handleWsMessage,
  toUint8Array,
  type RoleUpdateEvent,
  WS_MESSAGE,
} from "@/features/boards/realtime/protocol";
import {
  logWsConnect,
  logWsConnected,
  logWsDisconnected,
  logWsError,
  logWsMessage,
  logWsSyncComplete,
} from "@/features/boards/realtime/wsLogger";
import { useLogger } from "@/lib/logger/hooks";
import { sortElementsByZIndex } from "@/features/boards/boardRoute/elements";
import {
  applyElementPatch,
  createElementEntry,
  diffElementPatch,
  getElementsMap,
  isCompleteElement,
  materializeLegacyElement,
  materializeElement,
  materializeElements,
} from "@/features/boards/realtime/elementCrdt";
import {
  areSelectionsEqual,
  buildCursorMap,
  buildSelectionPresence,
  getCursorColor,
  normalizePresenceStatus,
  normalizeSelectionIds,
  parseBoardJoinedPayload,
  parsePresenceUser,
  parseServerEvent,
  type PresenceUserPayload,
} from "@/features/boards/boardRoute/presence";
import type { Point } from "@/features/boards/boardRoute.utils";
import type { UpdateElementFn } from "@/features/boards/boardRoute/types";

const CURSOR_IDLE_MS = 5_000;
const SELECTION_STALE_MS = 60_000;
const SELECTION_THROTTLE_MS = 100;
const PRESENCE_HEARTBEAT_MS = 15_000;
const PRESENCE_SWEEP_MS = 5_000;
const PRESENCE_SERVER_HEARTBEAT_MS = 30_000;
const PRESENCE_IDLE_MS = 60_000;
const PRESENCE_AWAY_MS = 180_000;
const SYNC_STATUS_THROTTLE_MS = 250;
const MAX_RECONNECT_ATTEMPTS = 8;
const MIN_CONNECT_INTERVAL_MS = 400;

const RECT_LIKE_TYPES = new Set<BoardElement["element_type"]>([
  "Shape",
  "StickyNote",
  "Image",
  "Video",
  "Frame",
  "Embed",
  "Document",
  "Component",
]);

const normalizeElementDimensions = (element: BoardElement): BoardElement => {
  let positionX = element.position_x;
  let positionY = element.position_y;
  let width = Number.isFinite(element.width) ? element.width : 1;
  let height = Number.isFinite(element.height) ? element.height : 1;

  if (RECT_LIKE_TYPES.has(element.element_type)) {
    if (width < 0) {
      positionX += width;
      width = Math.abs(width);
    }
    if (height < 0) {
      positionY += height;
      height = Math.abs(height);
    }
  } else {
    width = Math.abs(width);
    height = Math.abs(height);
  }

  width = Math.max(1, width);
  height = Math.max(1, height);

  if (
    positionX === element.position_x
    && positionY === element.position_y
    && width === element.width
    && height === element.height
  ) {
    return element;
  }

  return {
    ...element,
    position_x: positionX,
    position_y: positionY,
    width,
    height,
  };
};

type PresenceClientStatus = "active" | "idle" | "away";
type ConnectionStatus = "connecting" | "online" | "offline" | "reconnecting";

type SyncStatus = {
  connection: ConnectionStatus;
  pendingUpdates: boolean;
  localCacheReady: boolean;
  lastLocalChangeAt: number | null;
};

const initialSyncStatus: SyncStatus = {
  connection: "connecting",
  pendingUpdates: false,
  localCacheReady: false,
  lastLocalChangeAt: null,
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

const clearTimeoutRef = (ref: { current: number | null }) => {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
};

const clearRafRef = (ref: { current: number | null }) => {
  if (ref.current !== null) {
    window.cancelAnimationFrame(ref.current);
    ref.current = null;
  }
};

const isSyncStatusEqual = (a: SyncStatus, b: SyncStatus) =>
  a.connection === b.connection
  && a.pendingUpdates === b.pendingUpdates
  && a.localCacheReady === b.localCacheReady
  && a.lastLocalChangeAt === b.lastLocalChangeAt;

export function useBoardRealtime({
  boardId,
  user,
  canEdit = true,
  onRoleUpdate,
  enabled = true,
}: {
  boardId: string;
  user: User | null;
  canEdit?: boolean;
  onRoleUpdate?: (event: RoleUpdateEvent) => void;
  enabled?: boolean;
}) {
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorBroadcast>>({});
  const [selectionPresence, setSelectionPresence] = useState<SelectionPresence[]>(
    [],
  );
  const [presenceUsers, setPresenceUsers] = useState<
    Record<string, PresenceUser>
  >({});
  const [queueState, setQueueState] = useState<{ position: number } | null>(
    null,
  );
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(initialSyncStatus);
  const loggerContext = useMemo(() => ({ board_id: boardId }), [boardId]);
  useLogger("useBoardRealtime", loggerContext, { logMount: true });
  const docRef = useRef<Y.Doc | null>(null);
  const yElementsRef = useRef<Y.Map<Y.Map<unknown>> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const historyOriginRef = useRef({ source: "local" });
  const syncOriginRef = useRef({ source: "sync" });
  const awarenessRef = useRef<Awareness | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const latestCursorRef = useRef<Point | null>(null);
  const cursorIdleTimeoutRef = useRef<number | null>(null);
  const selectionUpdateTimeoutRef = useRef<number | null>(null);
  const selectionPendingRef = useRef<string[] | null>(null);
  const selectionSnapshotRef = useRef<string[]>([]);
  const dragRafRef = useRef<number | null>(null);
  const latestDragRef = useRef<DragPresence | null>(null);
  const latestEditModeRef = useRef<SelectionEditMode | null>(null);
  const userIdRef = useRef(user?.id ?? "");
  const userRef = useRef(user ?? null);
  const canEditRef = useRef(canEdit);
  const pendingUpdatesRef = useRef<Uint8Array[]>([]);
  const joinedRef = useRef(false);
  const presenceStatusRef = useRef<PresenceClientStatus>("active");
  const presenceIdleTimeoutRef = useRef<number | null>(null);
  const presenceAwayTimeoutRef = useRef<number | null>(null);
  const syncStatusRef = useRef<SyncStatus>(initialSyncStatus);
  const syncStatusTimerRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastConnectAtRef = useRef(0);
  const syncStartAtRef = useRef<number | null>(null);
  const onRoleUpdateRef = useRef<typeof onRoleUpdate | null>(onRoleUpdate ?? null);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    onRoleUpdateRef.current = onRoleUpdate ?? null;
  }, [onRoleUpdate]);

  const updateSyncStatus = useCallback(
    (patch: Partial<SyncStatus>, flush = false) => {
      const current = syncStatusRef.current;
      const next: SyncStatus = { ...current, ...patch };
      if (isSyncStatusEqual(current, next)) return;
      syncStatusRef.current = next;
      if (flush) {
        if (syncStatusTimerRef.current !== null) {
          window.clearTimeout(syncStatusTimerRef.current);
          syncStatusTimerRef.current = null;
        }
        setSyncStatus(next);
        return;
      }
      if (syncStatusTimerRef.current !== null) return;
      syncStatusTimerRef.current = window.setTimeout(() => {
        syncStatusTimerRef.current = null;
        setSyncStatus(syncStatusRef.current);
      }, SYNC_STATUS_THROTTLE_MS);
    },
    [],
  );

  const lockedElementIds = useMemo(() => {
    const ids = new Set<string>();
    selectionPresence.forEach((entry) => {
      if (entry.editing) {
        ids.add(entry.editing.element_id);
      }
    });
    return ids;
  }, [selectionPresence]);

  const refreshHistoryState = useCallback(() => {
    const manager = undoManagerRef.current;
    if (!manager) {
      setHistoryState((prev) =>
        prev.canUndo || prev.canRedo ? { canUndo: false, canRedo: false } : prev,
      );
      return;
    }
    setHistoryState((prev) => {
      const canUndo = manager.undoStack.length > 0;
      const canRedo = manager.redoStack.length > 0;
      if (prev.canUndo === canUndo && prev.canRedo === canRedo) return prev;
      return { canUndo, canRedo };
    });
  }, []);

  const coerceElementEntry = useCallback(
    (id: string, map: Y.Map<Y.Map<unknown>>) => {
      const entry = map.get(id);
      if (entry instanceof Y.Map) return entry as Y.Map<unknown>;
      if (entry && typeof entry === "object") {
        const legacy = materializeLegacyElement(
          entry as Record<string, unknown>,
        );
        if (!legacy) return null;
        return createElementEntry(map, id, legacy);
      }
      return null;
    },
    [],
  );

  const runWithHistory = useCallback((fn: () => void) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(fn, historyOriginRef.current);
  }, []);

  const upsertElement = useCallback(
    (element: BoardElement) => {
      const map = yElementsRef.current;
      if (!map) return;
      const now = new Date().toISOString();
      runWithHistory(() => {
        const existing = coerceElementEntry(element.id, map);
        const normalized = normalizeElementDimensions(element);
        const patch: Partial<BoardElement> = {
          ...normalized,
          created_at: element.created_at ?? now,
          updated_at: element.updated_at ?? now,
        };
        if (existing) {
          applyElementPatch(existing, {
            ...patch,
            deleted_at: null,
          });
        } else {
          createElementEntry(map, element.id, patch as BoardElement);
        }
      });
    },
    [coerceElementEntry, runWithHistory],
  );

  const updateElement = useCallback<UpdateElementFn>(
    (id, updater) => {
      const map = yElementsRef.current;
      if (!map) return;
      const entry = coerceElementEntry(id, map);
      if (!entry) return;
      const current = materializeElement(entry);
      if (!current) return;
      const next = updater(current);
      if (!next) return;
      const normalized = normalizeElementDimensions(next);
      const patch = diffElementPatch(current, normalized);
      if (!patch) return;
      const now = new Date().toISOString();
      runWithHistory(() => {
        applyElementPatch(entry, {
          ...patch,
          updated_at: now,
        });
      });
    },
    [coerceElementEntry, runWithHistory],
  );

  const removeElement = useCallback(
    (id: string) => {
      const map = yElementsRef.current;
      if (!map) return;
      const entry = coerceElementEntry(id, map);
      if (!entry) return;
      const now = new Date().toISOString();
      runWithHistory(() => {
        applyElementPatch(entry, {
          deleted_at: now,
          updated_at: now,
        });
      });
    },
    [coerceElementEntry, runWithHistory],
  );

  const applyRemotePatch = useCallback(
    (
      id: string,
      patch: Partial<BoardElement>,
      origin: "remote" | "sync" = "remote",
    ) => {
      const doc = docRef.current;
      const map = yElementsRef.current;
      if (!doc || !map) return;
      const txOrigin = origin === "sync" ? syncOriginRef.current : "remote";
      doc.transact(() => {
        const entry = coerceElementEntry(id, map);
        const isComplete = isCompleteElement(patch as Partial<BoardElement>);
        if (entry) {
          applyElementPatch(entry, {
            ...(patch as Partial<BoardElement>),
            ...(isComplete ? { deleted_at: null } : {}),
          });
          return;
        }
        if (isComplete) {
          createElementEntry(map, id, patch as BoardElement);
        }
      }, txOrigin);
    },
    [coerceElementEntry],
  );

  const getElementById = useCallback((id: string) => {
    const map = yElementsRef.current;
    if (!map) return null;
    const entry = coerceElementEntry(id, map);
    if (!entry) return null;
    return materializeElement(entry);
  }, [coerceElementEntry]);

  const startHistoryEntry = useCallback(() => {
    undoManagerRef.current?.stopCapturing();
  }, []);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  const clearCursorIdleTimeout = useCallback(() => {
    clearTimeoutRef(cursorIdleTimeoutRef);
  }, []);

  const clearSelectionUpdateTimeout = useCallback(() => {
    clearTimeoutRef(selectionUpdateTimeoutRef);
  }, []);

  const updateAwarenessState = useCallback(
    (patch: Partial<AwarenessState>, timestamp?: number) => {
      const awareness = awarenessRef.current;
      const current = awareness?.getLocalState();
      if (!awareness || current === null) return;
      const now = timestamp ?? Date.now();
      awareness.setLocalState({
        ...current,
        ...patch,
        updated_at: now,
      });
    },
    [],
  );

  const scheduleSelectionUpdate = useCallback(
    (ids: string[]) => {
      const normalized = normalizeSelectionIds(ids);
      if (areSelectionsEqual(selectionSnapshotRef.current, normalized)) return;
      selectionSnapshotRef.current = normalized;
      selectionPendingRef.current = normalized;
      if (selectionUpdateTimeoutRef.current !== null) return;
      selectionUpdateTimeoutRef.current = window.setTimeout(() => {
        selectionUpdateTimeoutRef.current = null;
        const pending = selectionPendingRef.current;
        selectionPendingRef.current = null;
        if (!pending) return;
        const now = Date.now();
        updateAwarenessState(
          { selection: pending, selection_updated_at: now },
          now,
        );
      }, SELECTION_THROTTLE_MS);
    },
    [updateAwarenessState],
  );

  const setEditingPresence = useCallback(
    (editing: { element_id: string; mode: SelectionEditMode } | null) => {
      const now = Date.now();
      updateAwarenessState({ editing, selection_updated_at: now }, now);
    },
    [updateAwarenessState],
  );

  const scheduleCursorIdleTimeout = useCallback(() => {
    clearCursorIdleTimeout();
    cursorIdleTimeoutRef.current = window.setTimeout(() => {
      const now = Date.now();
      updateAwarenessState({ cursor: null, cursor_updated_at: now }, now);
    }, CURSOR_IDLE_MS);
  }, [clearCursorIdleTimeout, updateAwarenessState]);

  const scheduleCursorUpdate = useCallback(
    (point: Point) => {
      latestCursorRef.current = point;
      if (cursorRafRef.current !== null) return;
      cursorRafRef.current = window.requestAnimationFrame(() => {
        cursorRafRef.current = null;
        const next = latestCursorRef.current;
        if (!next) return;
        const now = Date.now();
        updateAwarenessState({ cursor: next, cursor_updated_at: now }, now);
      });
      scheduleCursorIdleTimeout();
    },
    [scheduleCursorIdleTimeout, updateAwarenessState],
  );

  const clearCursor = useCallback(() => {
    latestCursorRef.current = null;
    clearRafRef(cursorRafRef);
    clearCursorIdleTimeout();
    const now = Date.now();
    updateAwarenessState({ cursor: null, cursor_updated_at: now }, now);
  }, [clearCursorIdleTimeout, updateAwarenessState]);

  const scheduleDragPresence = useCallback(
    (drag: DragPresence | null, mode: SelectionEditMode | null = null) => {
      latestDragRef.current = drag;
      latestEditModeRef.current = mode;
      if (dragRafRef.current !== null) return;
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
        const next = latestDragRef.current;
        const editMode = latestEditModeRef.current;
        const now = Date.now();
        updateAwarenessState(
          {
            drag: next ?? null,
            editing:
              next && editMode
                ? { element_id: next.element_id, mode: editMode }
                : null,
            cursor_updated_at: now,
            selection_updated_at: now,
          },
          now,
        );
      });
      scheduleCursorIdleTimeout();
    },
    [scheduleCursorIdleTimeout, updateAwarenessState],
  );

  const clearDragPresence = useCallback(() => {
    latestDragRef.current = null;
    latestEditModeRef.current = null;
    clearRafRef(dragRafRef);
    const now = Date.now();
    updateAwarenessState(
      {
        drag: null,
        editing: null,
        cursor_updated_at: now,
        selection_updated_at: now,
      },
      now,
    );
  }, [updateAwarenessState]);

  const resetRealtimeState = useCallback(() => {
    setElements([]);
    setCursors({});
    setSelectionPresence([]);
    setPresenceUsers({});
    setQueueState(null);
    setHistoryState({ canUndo: false, canRedo: false });
    if (syncStatusTimerRef.current !== null) {
      window.clearTimeout(syncStatusTimerRef.current);
      syncStatusTimerRef.current = null;
    }
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptRef.current = 0;
    syncStatusRef.current = initialSyncStatus;
    setSyncStatus(initialSyncStatus);
    clearRafRef(cursorRafRef);
    latestCursorRef.current = null;
    clearRafRef(dragRafRef);
    latestDragRef.current = null;
    latestEditModeRef.current = null;
    clearCursorIdleTimeout();
    clearSelectionUpdateTimeout();
    selectionPendingRef.current = null;
    selectionSnapshotRef.current = [];
    docRef.current = null;
    yElementsRef.current = null;
    undoManagerRef.current = null;
    awarenessRef.current = null;
    persistenceRef.current = null;
    wsRef.current = null;
    joinedRef.current = false;
    presenceStatusRef.current = "active";
  }, [clearCursorIdleTimeout, clearSelectionUpdateTimeout]);

  useEffect(() => {
    if (!enabled) {
      return () => undefined;
    }

    const token = getToken();
    let disposed = false;
    let awareness: Awareness | null = null;
    let yElements: Y.Map<Y.Map<unknown>> | null = null;
    let observer: (() => void) | null = null;
    let onUpdate: ((update: Uint8Array, origin: unknown) => void) | null = null;
    let heartbeatId: number | null = null;
    let presenceHeartbeatId: number | null = null;
    let sweepId: number | null = null;
    let activityHandler: (() => void) | null = null;
    let visibilityHandler: (() => void) | null = null;
    let onlineHandler: (() => void) | null = null;
    let offlineHandler: (() => void) | null = null;
    let handleAwarenessUpdate:
      | ((
          payload: { added: number[]; updated: number[]; removed: number[] },
          origin: string,
        ) => void)
      | null = null;
    let handleAwarenessChange:
      | ((payload: { added: number[]; updated: number[]; removed: number[] }) => void)
      | null = null;

    const initializeRealtime = () => {
      if (disposed) return;
      resetRealtimeState();
      if (!token || disposed) return;
      updateSyncStatus(
        {
          connection: navigator.onLine ? "connecting" : "offline",
          pendingUpdates: false,
          localCacheReady: false,
          lastLocalChangeAt: null,
        },
        true,
      );

      const doc = new Y.Doc();
      docRef.current = doc;
      awareness = new Awareness(doc);
      awarenessRef.current = awareness;

      awareness.setLocalState({
        user: {
          id: "",
          name: "Anonymous",
          avatar: null,
        },
        color: getCursorColor(String(doc.clientID)),
        status: "online",
        cursor: null,
        cursor_updated_at: Date.now(),
        selection: [],
        selection_updated_at: Date.now(),
        editing: null,
        drag: null,
        updated_at: Date.now(),
      });
      const currentUser = userRef.current;
      const userId = currentUser?.id ?? "";
      const displayName =
        currentUser?.display_name || currentUser?.username || "Anonymous";
      const currentState = awareness.getLocalState();
      if (currentState !== null) {
        const color =
          userId !== ""
            ? getCursorColor(userId)
            : typeof currentState.color === "string"
              ? currentState.color
              : getCursorColor(String(awareness.clientID));
        awareness.setLocalState({
          ...currentState,
          user: {
            id: userId,
            name: displayName,
            avatar: currentUser?.avatar_url || null,
          },
          color,
          status: "online",
          updated_at: Date.now(),
        });
      }

      try {
        const persistence = new IndexeddbPersistence(`board:${boardId}`, doc);
        persistenceRef.current = persistence;
        persistence.once("synced", () => {
          updateSyncStatus({ localCacheReady: true }, true);
        });
      } catch (error) {
        console.warn("indexeddb persistence unavailable", error);
        updateSyncStatus({ localCacheReady: true }, true);
      }

      yElements = getElementsMap(doc);
      yElementsRef.current = yElements;
      doc.transact(() => {
        if (!yElements) return;
        const migrations: Array<[string, BoardElement]> = [];
        yElements.forEach((value, key) => {
          if (value instanceof Y.Map) return;
          if (!value || typeof value !== "object") return;
          const legacy = materializeLegacyElement(
            value as Record<string, unknown>,
          );
          if (legacy) migrations.push([key, legacy]);
        });
        migrations.forEach(([key, element]) => {
          if (yElements) {
            createElementEntry(yElements, key, element);
          }
        });
      }, syncOriginRef.current);
      queueMicrotask(() => {
        if (disposed || !yElements) return;
        setElements(sortElementsByZIndex(materializeElements(yElements)));
      });

      const undoManager = new Y.UndoManager(yElements, {
        trackedOrigins: new Set([historyOriginRef.current]),
        captureTimeout: 5000,
      });
      undoManagerRef.current = undoManager;
      queueMicrotask(() => {
        refreshHistoryState();
      });

      observer = () => {
        if (!disposed && yElements) {
          setElements(sortElementsByZIndex(materializeElements(yElements)));
        }
      };
      yElements.observeDeep(observer);

      const wsUrl = `ws://localhost:3000/ws/boards/${boardId}?token=${encodeURIComponent(token)}`;

      const sendMessage = (type: number, payload: Uint8Array) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(createWsMessage(type, payload));
      };

      const sendTextEvent = (type: string, payload?: Record<string, unknown>) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(
          JSON.stringify({
            type,
            payload,
          }),
        );
      };

      const setPresenceStatus = (next: PresenceClientStatus) => {
        if (!joinedRef.current) return;
        if (presenceStatusRef.current === next) return;
        presenceStatusRef.current = next;
        sendTextEvent("presence:update", { board_id: boardId, status: next });
      };

      const clearPresenceTimers = () => {
        clearTimeoutRef(presenceIdleTimeoutRef);
        clearTimeoutRef(presenceAwayTimeoutRef);
      };

      const schedulePresenceTimers = () => {
        clearPresenceTimers();
        presenceIdleTimeoutRef.current = window.setTimeout(() => {
          setPresenceStatus("idle");
        }, PRESENCE_IDLE_MS);
        presenceAwayTimeoutRef.current = window.setTimeout(() => {
          setPresenceStatus("away");
        }, PRESENCE_AWAY_MS);
      };

      const markActive = () => {
        setPresenceStatus("active");
        schedulePresenceTimers();
      };

      activityHandler = () => markActive();
      visibilityHandler = () => {
        if (document.hidden) {
          setPresenceStatus("away");
        } else {
          markActive();
        }
      };
      window.addEventListener("pointermove", activityHandler, { passive: true });
      window.addEventListener("keydown", activityHandler);
      document.addEventListener("visibilitychange", visibilityHandler);

      onlineHandler = () => {
        updateSyncStatus({ connection: "reconnecting" }, true);
        if (reconnectTimeoutRef.current !== null) {
          window.clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
        connectWebSocket();
      };
      offlineHandler = () => {
        updateSyncStatus({ connection: "offline" }, true);
        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close(1000, "offline");
        }
      };
      window.addEventListener("online", onlineHandler);
      window.addEventListener("offline", offlineHandler);

      const flushPendingUpdates = () => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const pending = pendingUpdatesRef.current;
        if (pending.length === 0) return;
        pendingUpdatesRef.current = [];
        const merged = pending.length === 1 ? pending[0] : Y.mergeUpdates(pending);
        sendMessage(WS_MESSAGE.Update, merged);
        updateSyncStatus({ pendingUpdates: false }, true);
      };

      onUpdate = (update: Uint8Array, origin: unknown) => {
        if (disposed) return;
        refreshHistoryState();
        const isRemote =
          origin === "remote" || origin === syncOriginRef.current;
        if (!isRemote) {
          updateSyncStatus({ lastLocalChangeAt: Date.now() });
        }
        if (isRemote) return;
        if (!canEditRef.current) return;
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          pendingUpdatesRef.current.push(update);
          updateSyncStatus({ pendingUpdates: true });
          return;
        }
        sendMessage(WS_MESSAGE.Update, update);
      };
      doc.on("update", onUpdate);

      const syncAwarenessState = () => {
        if (disposed || !awareness) return;
        setCursors(buildCursorMap(awareness, CURSOR_IDLE_MS));
        setSelectionPresence(
          buildSelectionPresence(awareness, userIdRef.current, SELECTION_STALE_MS),
        );
      };

      handleAwarenessUpdate = (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: string,
      ) => {
        if (origin !== "local" || !awareness) return;
        const payload = encodeAwarenessUpdate(awareness, [
          ...added,
          ...updated,
          ...removed,
        ]);
        sendMessage(WS_MESSAGE.Awareness, payload);
      };

      handleAwarenessChange = ({
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => {
        if (!awareness) return;
        const changed = [...added, ...updated, ...removed];
        if (changed.length === 0) return;
        const hasRemoteChange = changed.some(
          (clientId) => clientId !== awareness?.clientID,
        );
        if (!hasRemoteChange) return;
        syncAwarenessState();
      };

      awareness.on("update", handleAwarenessUpdate);
      awareness.on("change", handleAwarenessChange);

      syncAwarenessState();
      sweepId = window.setInterval(() => {
        syncAwarenessState();
      }, PRESENCE_SWEEP_MS);

      const applyPresenceList = (users: PresenceUserPayload[] | undefined) => {
        if (!users) {
          setPresenceUsers({});
          return;
        }
        const next: Record<string, PresenceUser> = {};
        users.forEach((payload) => {
          const userEntry = parsePresenceUser(payload);
          if (!userEntry) return;
          next[userEntry.user_id] = userEntry;
        });
        setPresenceUsers(next);
      };

      const handlePresenceUpdate = (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const record = payload as Record<string, unknown>;
        const userId = record.user_id;
        if (typeof userId !== "string") return;
        const status = normalizePresenceStatus(record.status);
        setPresenceUsers((prev) => {
          const existing = prev[userId];
          if (!existing || existing.status === status) return prev;
          return { ...prev, [userId]: { ...existing, status } };
        });
      };

      const handleUserJoined = (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const record = payload as Record<string, unknown>;
        const userPayload =
          record.user && typeof record.user === "object"
            ? (record.user as PresenceUserPayload)
            : (record as PresenceUserPayload);
        const userEntry = parsePresenceUser(userPayload);
        if (!userEntry) return;
        setPresenceUsers((prev) => ({ ...prev, [userEntry.user_id]: userEntry }));
      };

      const handleUserLeft = (payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        const record = payload as Record<string, unknown>;
        const userId = record.user_id;
        if (typeof userId !== "string") return;
        setPresenceUsers((prev) => {
          if (!prev[userId]) return prev;
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      };

      const handleBoardQueued = (payload: unknown) => {
        if (!payload || typeof payload !== "object") {
          setQueueState({ position: 0 });
          setPresenceUsers({});
          return;
        }
        const record = payload as Record<string, unknown>;
        const position =
          typeof record.position === "number" ? record.position : 0;
        setQueueState({ position });
        setPresenceUsers({});
        joinedRef.current = false;
      };

      const handleBoardJoined = (payload: unknown) => {
        const parsed = parseBoardJoinedPayload(payload);
        if (!parsed) return;
        applyPresenceList(parsed.current_users);
        setQueueState(null);
        joinedRef.current = true;
        setPresenceStatus("active");
        schedulePresenceTimers();
        if (syncStartAtRef.current !== null) {
          const duration = Date.now() - syncStartAtRef.current;
          logWsSyncComplete(boardId, duration);
          syncStartAtRef.current = null;
        }
      };

      const handleTextMessage = (text: string) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return;
        }
        const event = parseServerEvent(parsed);
        if (!event) return;
        logWsMessage(boardId, event.type, text.length);
        switch (event.type) {
          case "board:joined":
            handleBoardJoined(event.payload);
            break;
          case "board:queued":
            handleBoardQueued(event.payload);
            break;
          case "user:joined":
            handleUserJoined(event.payload);
            break;
          case "presence:update":
            handlePresenceUpdate(event.payload);
            break;
          case "user:left":
            handleUserLeft(event.payload);
            break;
          default:
            break;
        }
      };

      function scheduleReconnect(delayOverride?: number) {
        if (disposed) return;
        if (reconnectTimeoutRef.current !== null) return;
        const attempt = reconnectAttemptRef.current + 1;
        if (attempt > MAX_RECONNECT_ATTEMPTS) {
          updateSyncStatus({ connection: "offline" }, true);
          return;
        }
        reconnectAttemptRef.current = attempt;
        const delay =
          delayOverride ?? Math.min(30_000, 1000 * 2 ** (attempt - 1));
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (disposed) return;
          connectWebSocket();
        }, delay);
      }

      function connectWebSocket() {
        if (!navigator.onLine) {
          updateSyncStatus({ connection: "offline" }, true);
          return;
        }
        if (!token || disposed) return;
        const now = Date.now();
        if (now - lastConnectAtRef.current < MIN_CONNECT_INTERVAL_MS) {
          scheduleReconnect(MIN_CONNECT_INTERVAL_MS);
          return;
        }
        lastConnectAtRef.current = now;
        const existing = wsRef.current;
        if (existing && existing.readyState === WebSocket.OPEN) return;
        if (existing && existing.readyState === WebSocket.CONNECTING) return;
        if (existing && existing.readyState !== WebSocket.CLOSED) {
          existing.close(1000, "reconnect");
        }
        updateSyncStatus({ connection: "connecting" }, true);
        const attempt = reconnectAttemptRef.current + 1;
        logWsConnect(boardId, attempt);
        syncStartAtRef.current = Date.now();
        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;
        socket.binaryType = "arraybuffer";

        socket.onmessage = async (event) => {
          if (disposed || wsRef.current !== socket) return;
          if (typeof event.data === "string") {
            handleTextMessage(event.data);
            return;
          }
          const bytes = await toUint8Array(event.data);
          if (!bytes || bytes.length === 0 || !awareness) return;
          logWsMessage(boardId, "binary", bytes.length);
          const roleUpdate = handleWsMessage(bytes, doc, awareness);
          if (roleUpdate) {
            onRoleUpdateRef.current?.(roleUpdate);
          }
        };

        socket.onopen = () => {
          if (disposed || wsRef.current !== socket || !awareness) {
            if (socket.readyState === WebSocket.OPEN) {
              socket.close(1000, "unmount");
            }
            return;
          }
          reconnectAttemptRef.current = 0;
          logWsConnected(boardId);
          updateSyncStatus({ connection: "online" }, true);
          const syncPayload = Y.encodeStateVector(doc);
          sendMessage(WS_MESSAGE.SyncStep1, syncPayload);
          flushPendingUpdates();
          const payload = encodeAwarenessUpdate(awareness, [awareness.clientID]);
          sendMessage(WS_MESSAGE.Awareness, payload);
        };

        socket.onerror = (event) => {
          if (disposed || wsRef.current !== socket) return;
          logWsError(boardId);
          updateSyncStatus(
            { connection: navigator.onLine ? "reconnecting" : "offline" },
            true,
          );
        };

        socket.onclose = (event) => {
          if (disposed || wsRef.current !== socket) return;
          wsRef.current = null;
          joinedRef.current = false;
          logWsDisconnected(boardId, event.code, event.reason);
          const nextConnection = navigator.onLine ? "reconnecting" : "offline";
          updateSyncStatus({ connection: nextConnection }, true);
          if (nextConnection === "reconnecting") {
            scheduleReconnect();
          }
        };
      }

      connectWebSocket();

      heartbeatId = window.setInterval(() => {
        if (disposed || !awareness) return;
        const current = awareness.getLocalState();
        if (current === null) return;
        awareness.setLocalState({
          ...current,
          updated_at: Date.now(),
        });
      }, PRESENCE_HEARTBEAT_MS);

      presenceHeartbeatId = window.setInterval(() => {
        const socket = wsRef.current;
        if (disposed || !socket || socket.readyState !== WebSocket.OPEN) return;
        if (!joinedRef.current) return;
        sendTextEvent("heartbeat");
      }, PRESENCE_SERVER_HEARTBEAT_MS);
    };

    queueMicrotask(initializeRealtime);

    return () => {
      disposed = true;
      clearRafRef(cursorRafRef);
      latestCursorRef.current = null;
      clearRafRef(dragRafRef);
      latestDragRef.current = null;
      if (awareness) {
        try {
          awareness.setLocalState(null);
        } catch (error) {
          console.warn("awareness cleanup failed", error);
        }
        if (handleAwarenessUpdate) {
          awareness.off("update", handleAwarenessUpdate);
        }
        if (handleAwarenessChange) {
          awareness.off("change", handleAwarenessChange);
        }
      }
      awarenessRef.current = null;
      if (heartbeatId !== null) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
      if (presenceHeartbeatId !== null) {
        clearInterval(presenceHeartbeatId);
        presenceHeartbeatId = null;
      }
      if (sweepId !== null) {
        clearInterval(sweepId);
        sweepId = null;
      }
      if (activityHandler) {
        window.removeEventListener("pointermove", activityHandler);
        window.removeEventListener("keydown", activityHandler);
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
      }
      if (onlineHandler) {
        window.removeEventListener("online", onlineHandler);
      }
      if (offlineHandler) {
        window.removeEventListener("offline", offlineHandler);
      }
      clearTimeoutRef(presenceIdleTimeoutRef);
      clearTimeoutRef(presenceAwayTimeoutRef);
      clearTimeoutRef(cursorIdleTimeoutRef);
      clearTimeoutRef(selectionUpdateTimeoutRef);
      selectionPendingRef.current = null;
      selectionSnapshotRef.current = [];
      if (yElements && observer) {
        try {
          yElements.unobserveDeep(observer);
        } catch (error) {
          console.warn("yElements unobserve failed", error);
        }
      }
      yElementsRef.current = null;
      undoManagerRef.current = null;
      if (docRef.current && onUpdate) {
        docRef.current.off("update", onUpdate);
      }
      const currentDoc = docRef.current;
      docRef.current = null;
      setHistoryState({ canUndo: false, canRedo: false });
      pendingUpdatesRef.current = [];
      if (syncStatusTimerRef.current !== null) {
        window.clearTimeout(syncStatusTimerRef.current);
        syncStatusTimerRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      const persistence = persistenceRef.current;
      persistenceRef.current = null;
      if (persistence) {
        persistence.destroy().catch((error) => {
          console.warn("indexeddb persistence cleanup failed", error);
        });
      }

      const socket = wsRef.current;
      wsRef.current = null;
      if (
        socket &&
        socket.readyState !== WebSocket.CLOSED &&
        socket.readyState !== WebSocket.CLOSING
      ) {
        socket.close(1000, "unmount");
      }
      currentDoc?.destroy();
    };
  }, [
    boardId,
    enabled,
    refreshHistoryState,
    resetRealtimeState,
    updateSyncStatus,
  ]);

  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness) return;
    userRef.current = user ?? null;
    const userId = user?.id ?? "";
    userIdRef.current = userId;
    const displayName = user?.display_name || user?.username || "Anonymous";
    const current = awareness.getLocalState();
    if (current === null) return;
    const color =
      userId !== ""
        ? getCursorColor(userId)
        : typeof current.color === "string"
          ? current.color
          : getCursorColor(String(awareness.clientID));

    awareness.setLocalState({
      ...current,
      user: {
        id: userId,
        name: displayName,
        avatar: user?.avatar_url || null,
      },
      color,
      status: "online",
      updated_at: Date.now(),
    });
  }, [user]);

  return {
    elements,
    cursors,
    selectionPresence,
    presenceUsers,
    queueState,
    syncStatus,
    upsertElement,
    updateElement,
    removeElement,
    applyRemotePatch,
    getElementById,
    scheduleCursorUpdate,
    clearCursor,
    scheduleDragPresence,
    clearDragPresence,
    scheduleSelectionUpdate,
    setEditingPresence,
    startHistoryEntry,
    undo,
    redo,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    lockedElementIds,
  };
}
