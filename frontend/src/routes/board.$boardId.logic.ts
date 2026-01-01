import { useCallback, useEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CursorBroadcast, BoardElement } from "@/types/board";
import type { User } from "@/types/auth";
import { getBoardsList } from "@/lib/api";
import {
  MousePointer2,
  Square,
  Circle as CircleIcon,
  Pencil,
  Type,
} from "lucide-react";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";

export const TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "shape:rectangle", icon: Square, label: "Rectangle" },
  { id: "shape:circle", icon: CircleIcon, label: "Circle" },
  { id: "drawing", icon: Pencil, label: "Draw" },
  { id: "text", icon: Type, label: "Text" },
] as const;

export type ToolType = (typeof TOOLS)[number]["id"];

type NavigateFn = (options: { to: string }) => void;

type AwarenessState = {
  user?: {
    id?: string;
    name?: string;
    avatar?: string | null;
  };
  cursor?: { x: number; y: number } | null;
  color?: string;
  status?: string;
};

type TextEditorState = {
  isOpen: boolean;
  x: number;
  y: number;
  value: string;
  elementId: string | null;
  fontSize: number;
  color: string;
};

type Point = { x: number; y: number };

type UpdateElementFn = (
  id: string,
  updater: (current: BoardElement) => BoardElement | null,
) => void;

export const DEFAULT_TEXT_STYLE = { fontSize: 20, fill: "#ffffff" };
const DEFAULT_SHAPE_STYLE = {
  stroke: "#ffffff",
  strokeWidth: 2,
  fill: "transparent",
};
const DEFAULT_DRAWING_STYLE = { stroke: "#EAB308", strokeWidth: 3 };

const createDefaultTextEditor = (): TextEditorState => ({
  isOpen: false,
  x: 0,
  y: 0,
  value: "",
  elementId: null,
  fontSize: DEFAULT_TEXT_STYLE.fontSize,
  color: DEFAULT_TEXT_STYLE.fill,
});

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

const getCursorColor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
};

const WS_MESSAGE = {
  Sync: 0,
  Update: 2,
  Awareness: 3,
} as const;

const WS_SYNC_STEP = {
  Step1: 1,
  Step2: 2,
} as const;

const normalizeTextValue = (value: string) => value.replace(/\r\n/g, "\n");

const toUint8Array = async (
  data: Blob | ArrayBuffer | string,
): Promise<Uint8Array | null> => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return null;
};

const buildCursorMap = (awareness: Awareness): Record<string, CursorBroadcast> => {
  const next: Record<string, CursorBroadcast> = {};
  awareness.getStates().forEach((state, clientId) => {
    if (!state || clientId === awareness.clientID) return;
    const typedState = state as AwarenessState;
    const cursor = typedState.cursor;
    const userState = typedState.user;

    next[String(clientId)] = {
      client_id: clientId,
      user_id: typeof userState?.id === "string" ? userState.id : "",
      user_name:
        typeof userState?.name === "string" ? userState.name : "Anonymous",
      avatar_url:
        typeof userState?.avatar === "string" ? userState.avatar : null,
      x: typeof cursor?.x === "number" ? cursor.x : null,
      y: typeof cursor?.y === "number" ? cursor.y : null,
      color:
        typeof typedState.color === "string"
          ? typedState.color
          : FALLBACK_CURSOR_COLOR,
      status:
        typeof typedState.status === "string" ? typedState.status : undefined,
    };
  });
  return next;
};

const createWsMessage = (type: number, payload: Uint8Array) => {
  const message = new Uint8Array(payload.length + 1);
  message[0] = type;
  message.set(payload, 1);
  return message;
};

const handleWsMessage = (
  bytes: Uint8Array,
  doc: Y.Doc,
  awareness: Awareness,
) => {
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

  if (bytes[0] === WS_MESSAGE.Sync) {
    const step = bytes[1];

    if (step === WS_SYNC_STEP.Step1) return;

    if (step === WS_SYNC_STEP.Step2) {
      const payload = bytes.subarray(2);
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

    console.warn("Unknown sync step", step, bytes.length);
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
  }
};

export const getPointerPosition = (
  event: KonvaEventObject<MouseEvent>,
): Point | null => {
  const stage = event.target.getStage();
  if (!stage) return null;
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  const scaleX = stage.scaleX() || 1;
  const scaleY = stage.scaleY() || 1;
  const position = stage.position();
  return {
    x: (pointer.x - position.x) / scaleX,
    y: (pointer.y - position.y) / scaleY,
  };
};

const createShapeElement = (
  boardId: string,
  id: string,
  position: Point,
  shapeType: "rectangle" | "circle",
): BoardElement => ({
  id,
  board_id: boardId,
  element_type: "Shape",
  position_x: position.x,
  position_y: position.y,
  width: 1,
  height: 1,
  style: { ...DEFAULT_SHAPE_STYLE },
  properties: { shapeType },
});

const createDrawingElement = (
  boardId: string,
  id: string,
  position: Point,
): BoardElement => ({
  id,
  board_id: boardId,
  element_type: "Drawing",
  position_x: 0,
  position_y: 0,
  width: 1,
  height: 1,
  style: { ...DEFAULT_DRAWING_STYLE },
  properties: { points: [position.x, position.y] },
});

const createTextElement = (
  boardId: string,
  position: Point,
  content: string,
  style: { fontSize: number; color: string },
): BoardElement => ({
  id: crypto.randomUUID(),
  board_id: boardId,
  element_type: "Text",
  position_x: position.x,
  position_y: position.y,
  width: 1,
  height: 1,
  style: { fontSize: style.fontSize, fill: style.color },
  properties: { content },
});

export const createElementForTool = (
  tool: ToolType,
  boardId: string,
  id: string,
  position: Point,
): BoardElement | null => {
  switch (tool) {
    case "shape:rectangle":
      return createShapeElement(boardId, id, position, "rectangle");
    case "shape:circle":
      return createShapeElement(boardId, id, position, "circle");
    case "drawing":
      return createDrawingElement(boardId, id, position);
    default:
      return null;
  }
};

export function useBoardMetadata(
  boardId: string,
  isAuthenticated: boolean,
  navigate: NavigateFn,
) {
  const [boardTitle, setBoardTitle] = useState("Untitled Board");

  useEffect(() => {
    if (!isAuthenticated) {
      if (!localStorage.getItem("token")) {
        navigate({ to: "/login" });
        return;
      }
    }

    getBoardsList()
      .then((boards) => {
        const currentBoard = boards.find((b) => b.id.toString() === boardId);
        if (currentBoard) {
          setBoardTitle(currentBoard.name);
        }
      })
      .catch(console.error);
  }, [isAuthenticated, navigate, boardId]);

  return boardTitle;
}

export function useCanvasDimensions() {
  const [dimensions, setDimensions] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return dimensions;
}

export function useBoardRealtime({
  boardId,
  user,
}: {
  boardId: string;
  user: User | null;
}) {
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorBroadcast>>({});
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const docRef = useRef<Y.Doc | null>(null);
  const yElementsRef = useRef<Y.Map<BoardElement> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const historyOriginRef = useRef({ source: "local" });
  const awarenessRef = useRef<Awareness | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const latestCursorRef = useRef<Point | null>(null);

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

  const runWithHistory = useCallback((fn: () => void) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.transact(fn, historyOriginRef.current);
  }, []);

  const upsertElement = useCallback(
    (element: BoardElement) => {
      const map = yElementsRef.current;
      if (!map) return;
      runWithHistory(() => {
        map.set(element.id, element);
      });
    },
    [runWithHistory],
  );

  const updateElement = useCallback<UpdateElementFn>(
    (id, updater) => {
      const map = yElementsRef.current;
      if (!map) return;
      const current = map.get(id);
      if (!current) return;
      const next = updater(current);
      if (!next) return;
      runWithHistory(() => {
        map.set(id, next);
      });
    },
    [runWithHistory],
  );

  const startHistoryEntry = useCallback(() => {
    undoManagerRef.current?.stopCapturing();
  }, []);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  const scheduleCursorUpdate = useCallback((point: Point) => {
    latestCursorRef.current = point;
    if (cursorRafRef.current !== null) return;
    cursorRafRef.current = window.requestAnimationFrame(() => {
      cursorRafRef.current = null;
      const next = latestCursorRef.current;
      if (!next) return;
      awarenessRef.current?.setLocalStateField("cursor", next);
    });
  }, []);

  const clearCursor = useCallback(() => {
    latestCursorRef.current = null;
    if (cursorRafRef.current !== null) {
      cancelAnimationFrame(cursorRafRef.current);
      cursorRafRef.current = null;
    }
    awarenessRef.current?.setLocalStateField("cursor", null);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setElements([]);
      setCursors({});
      setHistoryState({ canUndo: false, canRedo: false });
      docRef.current = null;
      yElementsRef.current = null;
      undoManagerRef.current = null;
      awarenessRef.current = null;
      return;
    }

    let disposed = false;
    setElements([]);
    setCursors({});
    setHistoryState({ canUndo: false, canRedo: false });

    const doc = new Y.Doc();
    docRef.current = doc;
    const awareness = new Awareness(doc);
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
    });

    const yElements = doc.getMap<BoardElement>("elements");
    yElementsRef.current = yElements;
    setElements(Array.from(yElements.values()));

    const undoManager = new Y.UndoManager(yElements, {
      trackedOrigins: new Set([historyOriginRef.current]),
      captureTimeout: 5000,
    });
    undoManagerRef.current = undoManager;
    refreshHistoryState();

    const observer = () => {
      if (!disposed) setElements(Array.from(yElements.values()));
    };
    yElements.observe(observer);

    const wsUrl = `ws://localhost:3000/ws/boards/${boardId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    const sendMessage = (type: number, payload: Uint8Array) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(createWsMessage(type, payload));
    };

    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (disposed) return;
      refreshHistoryState();
      if (origin === "remote") return;
      sendMessage(WS_MESSAGE.Update, update);
    };
    doc.on("update", onUpdate);

    const syncCursors = () => {
      if (disposed) return;
      setCursors(buildCursorMap(awareness));
    };

    const handleAwarenessUpdate = (
      {
        added,
        updated,
        removed,
      }: { added: number[]; updated: number[]; removed: number[] },
      origin: string,
    ) => {
      if (origin !== "local") return;
      const payload = encodeAwarenessUpdate(awareness, [
        ...added,
        ...updated,
        ...removed,
      ]);
      sendMessage(WS_MESSAGE.Awareness, payload);
    };

    const handleAwarenessChange = ({
      added,
      updated,
      removed,
    }: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      const hasRemoteChange = changed.some(
        (clientId) => clientId !== awareness.clientID,
      );
      if (!hasRemoteChange) return;
      syncCursors();
    };

    awareness.on("update", handleAwarenessUpdate);
    awareness.on("change", handleAwarenessChange);

    ws.onmessage = async (event) => {
      const bytes = await toUint8Array(event.data);
      if (!bytes || bytes.length === 0) return;
      handleWsMessage(bytes, doc, awareness);
    };
    ws.onopen = () => {
      if (disposed) return;
      const payload = encodeAwarenessUpdate(awareness, [awareness.clientID]);
      sendMessage(WS_MESSAGE.Awareness, payload);
    };
    ws.onerror = (event) => !disposed && console.warn("ws error", event);
    ws.onclose = (event) =>
      !disposed && console.log("ws close", event.code, event.reason);

    return () => {
      disposed = true;
      if (cursorRafRef.current !== null) {
        cancelAnimationFrame(cursorRafRef.current);
        cursorRafRef.current = null;
      }
      latestCursorRef.current = null;
      try {
        awareness.setLocalState(null);
      } catch {}
      awareness.off("update", handleAwarenessUpdate);
      awareness.off("change", handleAwarenessChange);
      awarenessRef.current = null;
      try {
        yElements.unobserve(observer);
      } catch {}
      yElementsRef.current = null;
      undoManagerRef.current = null;
      doc.off("update", onUpdate);
      docRef.current = null;
      setHistoryState({ canUndo: false, canRedo: false });

      if (ws.readyState === WebSocket.OPEN) ws.close(1000, "unmount");
      doc.destroy();
    };
  }, [boardId, refreshHistoryState]);

  useEffect(() => {
    const awareness = awarenessRef.current;
    if (!awareness) return;
    const displayName = user?.display_name || user?.username || "Anonymous";
    const userId = user?.id || "";
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
    });
  }, [user]);

  return {
    elements,
    cursors,
    upsertElement,
    updateElement,
    scheduleCursorUpdate,
    clearCursor,
    startHistoryEntry,
    undo,
    redo,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
  };
}

export function useTextEditor({
  boardId,
  upsertElement,
  updateElement,
  startHistoryEntry,
}: {
  boardId: string;
  upsertElement: (element: BoardElement) => void;
  updateElement: UpdateElementFn;
  startHistoryEntry: () => void;
}) {
  const [textEditor, setTextEditor] = useState(createDefaultTextEditor);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressNextPointerRef = useRef(false);

  useEffect(() => {
    if (!textEditor.isOpen) return;
    const raf = requestAnimationFrame(() => {
      textAreaRef.current?.focus();
      textAreaRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [textEditor.isOpen]);

  useEffect(() => {
    suppressNextPointerRef.current = false;
    setTextEditor(createDefaultTextEditor());
  }, [boardId]);

  const openTextEditor = useCallback(
    (next: Omit<TextEditorState, "isOpen">) => {
      setTextEditor({ ...next, isOpen: true });
    },
    [],
  );

  const closeTextEditor = useCallback((suppressNextPointer = false) => {
    if (suppressNextPointer) {
      suppressNextPointerRef.current = true;
    }
    setTextEditor(createDefaultTextEditor());
  }, []);

  const commitTextEditor = useCallback(
    (suppressNextPointer = false) => {
      const content = normalizeTextValue(textEditor.value);

      if (textEditor.elementId) {
        startHistoryEntry();
        updateElement(textEditor.elementId, (existing) => {
          if (existing.element_type !== "Text") return null;
          return {
            ...existing,
            style: {
              ...existing.style,
              fontSize: textEditor.fontSize,
              fill: textEditor.color,
            },
            properties: {
              ...existing.properties,
              content,
            },
          };
        });
        closeTextEditor(suppressNextPointer);
        return;
      }

      if (content.trim() === "") {
        closeTextEditor(suppressNextPointer);
        return;
      }

      startHistoryEntry();
      const element = createTextElement(
        boardId,
        { x: textEditor.x, y: textEditor.y },
        content,
        {
          fontSize: textEditor.fontSize,
          color: textEditor.color,
        },
      );
      upsertElement(element);
      closeTextEditor(suppressNextPointer);
    },
    [
      boardId,
      closeTextEditor,
      startHistoryEntry,
      textEditor,
      updateElement,
      upsertElement,
    ],
  );

  return {
    textEditor,
    setTextEditor,
    openTextEditor,
    closeTextEditor,
    commitTextEditor,
    textAreaRef,
    suppressNextPointerRef,
  };
}
