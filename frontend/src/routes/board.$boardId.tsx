import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Stage,
  Layer,
  Circle,
  Rect,
  Line,
  Text as KonvaText,
  Group,
} from "react-konva";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { KonvaEventObject } from "konva/lib/Node";
import { useAppStore } from "@/store/useAppStore";
import { Undo2, Redo2, RotateCcw, ChevronLeft } from "lucide-react";
import type { BoardElement } from "@/types/board";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { BoardShareDialog } from "@/features/boards/components/BoardShareDialog";
import { listBoardMembers } from "@/features/boards/api";
import type { BoardRole } from "@/features/boards/types";
import {
  TOOLS,
  type ToolType,
  DEFAULT_TEXT_STYLE,
  createElementForTool,
  getPointerPosition,
  useBoardMetadata,
  useBoardRealtime,
  useCanvasDimensions,
  useTextEditor,
} from "@/features/boards/boardRoute.logic";

export const Route = createFileRoute("/board/$boardId")({
  component: BoardComponent,
});

const HEADER_HEIGHT = 56;
const GRID_SIZE = 40;
const GRID_MAJOR_EVERY = 5;
const SCALE_BY = 1.06;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const TEXT_CHAR_WIDTH = 0.6;
const TEXT_LINE_HEIGHT = 1.2;
const SELECTION_STROKE = "#FBBF24";

type Point = { x: number; y: number };

const getTextMetrics = (content: string, fontSize: number) => {
  const lines = content.split("\n");
  const longestLine = lines.reduce(
    (max, line) => Math.max(max, line.length),
    0,
  );
  return {
    width: Math.max(1, longestLine) * fontSize * TEXT_CHAR_WIDTH,
    height: Math.max(1, lines.length) * fontSize * TEXT_LINE_HEIGHT,
  };
};

const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) /
    (dx * dx + dy * dy);
  const clamped = Math.min(1, Math.max(0, t));
  const closest = { x: start.x + clamped * dx, y: start.y + clamped * dy };
  return Math.hypot(point.x - closest.x, point.y - closest.y);
};

function BoardComponent() {
  const { boardId } = Route.useParams();
  const { user, isAuthenticated } = useAppStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [tool, setTool] = useState<ToolType>("select");

  const roleKey = `${boardId}:${user?.id ?? ""}`;
  const [boardRoleState, setBoardRoleState] = useState<{
    key: string;
    role: BoardRole | null;
  }>({
    key: roleKey,
    role: null,
  });
  const boardRole =
    boardRoleState.key === roleKey ? boardRoleState.role : null;
  const isRoleLoading = boardRole === null && Boolean(user?.id);

  const boardTitle = useBoardMetadata(boardId, isAuthenticated, navigate);
  const dimensions = useCanvasDimensions();
  const canEdit = boardRole
    ? ["owner", "admin", "editor"].includes(boardRole)
    : false;
  const activeTool = canEdit ? tool : "select";
  const {
    elements,
    cursors,
    upsertElement,
    updateElement,
    scheduleCursorUpdate,
    clearCursor,
    startHistoryEntry,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useBoardRealtime({ boardId, user, canEdit });

  useEffect(() => {
    let isMounted = true;
    if (!user?.id) return () => undefined;
    const currentKey = roleKey;
    listBoardMembers(boardId)
      .then((members) => {
        if (!isMounted) return;
        const current = members.find((member) => member.user.id === user.id);
        setBoardRoleState({
          key: currentKey,
          role: current?.role ?? "viewer",
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setBoardRoleState({
          key: currentKey,
          role: "viewer",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [boardId, roleKey, user?.id]);

  const guardedUpsertElement = useCallback(
    (element: BoardElement) => {
      if (!canEdit) return;
      upsertElement(element);
    },
    [canEdit, upsertElement],
  );

  const guardedUpdateElement = useCallback(
    (id: string, updater: (current: BoardElement) => BoardElement | null) => {
      if (!canEdit) return;
      updateElement(id, updater);
    },
    [canEdit, updateElement],
  );

  const guardedStartHistoryEntry = useCallback(() => {
    if (!canEdit) return;
    startHistoryEntry();
  }, [canEdit, startHistoryEntry]);

  const guardedUndo = useCallback(() => {
    if (!canEdit) return;
    undo();
  }, [canEdit, undo]);

  const guardedRedo = useCallback(() => {
    if (!canEdit) return;
    redo();
  }, [canEdit, redo]);

  const {
    textEditor,
    setTextEditor,
    openTextEditor,
    closeTextEditor,
    commitTextEditor,
    textAreaRef,
    suppressNextPointerRef,
  } = useTextEditor({
    boardId,
    upsertElement: guardedUpsertElement,
    updateElement: guardedUpdateElement,
    startHistoryEntry: guardedStartHistoryEntry,
  });

  const [action, setAction] = useState<"none" | "drawing" | "moving">("none");
  const currentShapeId = useRef<string | null>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const findElementAtPoint = useCallback(
    (point: Point): BoardElement | null => {
      const threshold = 6 / stageScale;
      for (let index = elements.length - 1; index >= 0; index -= 1) {
        const el = elements[index];
        if (el.element_type === "Shape") {
          if (el.properties.shapeType === "rectangle") {
            const x2 = el.position_x + el.width;
            const y2 = el.position_y + el.height;
            const minX = Math.min(el.position_x, x2);
            const maxX = Math.max(el.position_x, x2);
            const minY = Math.min(el.position_y, y2);
            const maxY = Math.max(el.position_y, y2);
            if (
              point.x >= minX &&
              point.x <= maxX &&
              point.y >= minY &&
              point.y <= maxY
            ) {
              return el;
            }
          }

          if (el.properties.shapeType === "circle") {
            const radius = Math.hypot(el.width || 0, el.height || 0);
            const dx = point.x - el.position_x;
            const dy = point.y - el.position_y;
            if (dx * dx + dy * dy <= radius * radius) {
              return el;
            }
          }
        }

        if (el.element_type === "Text") {
          const content = el.properties.content || "";
          const fontSize = el.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
          const { width, height } = getTextMetrics(content, fontSize);
          const padding = 4 / stageScale;
          if (
            point.x >= el.position_x - padding &&
            point.x <= el.position_x + width + padding &&
            point.y >= el.position_y - padding &&
            point.y <= el.position_y + height + padding
          ) {
            return el;
          }
        }

        if (el.element_type === "Drawing") {
          const points = el.properties.points || [];
          for (let i = 0; i < points.length - 2; i += 2) {
            const start = { x: points[i], y: points[i + 1] };
            const end = { x: points[i + 2], y: points[i + 3] };
            if (distanceToSegment(point, start, end) <= threshold) {
              return el;
            }
          }
        }
      }
      return null;
    },
    [elements, stageScale],
  );

  const handleMouseDown = (event: KonvaEventObject<MouseEvent>) => {
    if (textEditor.isOpen) return;
    if (suppressNextPointerRef.current) {
      suppressNextPointerRef.current = false;
      return;
    }
    if (action === "drawing") return;

    const position = getPointerPosition(event);
    if (!position) return;

    if (activeTool === "select") {
      const hit = findElementAtPoint(position);
      setSelectedElementId(hit?.id ?? null);
      setAction("none");
      return;
    }

    if (activeTool === "text") {
      if (!canEdit) return;
      openTextEditor({
        x: position.x,
        y: position.y,
        value: "",
        elementId: null,
        fontSize: DEFAULT_TEXT_STYLE.fontSize,
        color: DEFAULT_TEXT_STYLE.fill,
      });
      setAction("none");
      return;
    }

    if (!canEdit) return;
    guardedStartHistoryEntry();
    const id = crypto.randomUUID();
    currentShapeId.current = id;
    setAction("drawing");

    const newElement = createElementForTool(activeTool, boardId, id, position);
    if (newElement) {
      guardedUpsertElement(newElement);
    }
  };

  const handleMouseMove = useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (textEditor.isOpen) return;

      const position = getPointerPosition(event);
      if (!position) return;

      scheduleCursorUpdate(position);

      if (action !== "drawing" || !currentShapeId.current) return;

      guardedUpdateElement(currentShapeId.current, (currentElement) => {
        if (currentElement.element_type === "Shape") {
          return {
            ...currentElement,
            width: position.x - currentElement.position_x,
            height: position.y - currentElement.position_y,
          };
        }

        if (currentElement.element_type === "Drawing") {
          const newPoints = [
            ...(currentElement.properties.points || []),
            position.x,
            position.y,
          ];
          return {
            ...currentElement,
            properties: {
              ...currentElement.properties,
              points: newPoints,
            },
          };
        }

        return null;
      });
    },
    [action, guardedUpdateElement, scheduleCursorUpdate, textEditor.isOpen],
  );

  const handleMouseUp = useCallback(() => {
    setAction("none");
    currentShapeId.current = null;
  }, []);

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      setTextEditor((prev) => ({
        ...prev,
        value,
      }));
    },
    [setTextEditor],
  );

  const handleTextKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        commitTextEditor();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeTextEditor();
      }
    },
    [closeTextEditor, commitTextEditor],
  );

  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();
      if (!event.evt.ctrlKey && !event.evt.metaKey) {
        setStagePosition((prev) => ({
          x: prev.x - event.evt.deltaX,
          y: prev.y - event.evt.deltaY,
        }));
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const oldScale = stage.scaleX() || 1;
      const oldPosition = stage.position();
      const scaleDirection = event.evt.deltaY > 0 ? -1 : 1;
      const scaleFactor = scaleDirection > 0 ? SCALE_BY : 1 / SCALE_BY;
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, oldScale * scaleFactor),
      );

      const mousePointTo = {
        x: (pointer.x - oldPosition.x) / oldScale,
        y: (pointer.y - oldPosition.y) / oldScale,
      };

      const nextPosition = {
        x: pointer.x - mousePointTo.x * nextScale,
        y: pointer.y - mousePointTo.y * nextScale,
      };

      setStageScale(nextScale);
      setStagePosition(nextPosition);
    },
    [],
  );

  const resetZoom = useCallback(() => {
    setStageScale(1);
    setStagePosition({ x: 0, y: 0 });
  }, []);

  const handleGlobalKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (textEditor.isOpen) return;
      if (event.defaultPrevented) return;
      if (!canEdit) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName;
        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          guardedRedo();
        } else {
          guardedUndo();
        }
        return;
      }

      if (key === "y") {
        event.preventDefault();
        guardedRedo();
      }
    },
    [canEdit, guardedRedo, guardedUndo, textEditor.isOpen],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  const ensureSelectionExists = useCallback(() => {
    if (!selectedElementId) return;
    const exists = elements.some((el) => el.id === selectedElementId);
    if (!exists) setSelectedElementId(null);
  }, [elements, selectedElementId]);

  useEffect(() => {
    queueMicrotask(() => {
      ensureSelectionExists();
    });
  }, [ensureSelectionExists]);

  const cursorList = Object.values(cursors);
  const visibleCursors = cursorList.slice(0, 3);
  const extraCursorCount = Math.max(0, cursorList.length - 3);
  const stageHeight = dimensions.height - HEADER_HEIGHT;
  const worldLeft = (-stagePosition.x) / stageScale;
  const worldTop = (-stagePosition.y) / stageScale;
  const worldRight = (dimensions.width - stagePosition.x) / stageScale;
  const worldBottom = (stageHeight - stagePosition.y) / stageScale;
  const selectionStrokeWidth = 2 / stageScale;
  const selectionDash = [6 / stageScale, 4 / stageScale];
  const selectionPadding = 6 / stageScale;
  const gridLines = useMemo(() => {
    const lines: Array<{ points: number[]; major: boolean }> = [];
    const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
    const endX = Math.ceil(worldRight / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;
    const endY = Math.ceil(worldBottom / GRID_SIZE) * GRID_SIZE;

    for (let x = startX; x <= endX; x += GRID_SIZE) {
      const index = Math.round(x / GRID_SIZE);
      lines.push({
        points: [x, worldTop, x, worldBottom],
        major: index % GRID_MAJOR_EVERY === 0,
      });
    }
    for (let y = startY; y <= endY; y += GRID_SIZE) {
      const index = Math.round(y / GRID_SIZE);
      lines.push({
        points: [worldLeft, y, worldRight, y],
        major: index % GRID_MAJOR_EVERY === 0,
      });
    }
    return lines;
  }, [worldBottom, worldLeft, worldRight, worldTop]);
  const textEditorScreenPosition = {
    x: textEditor.x * stageScale + stagePosition.x,
    y: textEditor.y * stageScale + stagePosition.y,
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-neutral-900 flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm px-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate({ to: "/" })}
            className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-neutral-200 flex items-center gap-2">
              <span>{boardTitle}</span>
              {!canEdit && !isRoleLoading && (
                <span className="inline-flex items-center rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
                  {t("board.readOnly")}
                </span>
              )}
            </h1>
            <p className="text-xs text-neutral-500">Last saved just now</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {visibleCursors.map((cursor) => (
              <div
                key={cursor.client_id}
                className="w-8 h-8 rounded-full border-2 border-neutral-900 flex items-center justify-center text-xs text-neutral-900"
                style={{ backgroundColor: cursor.color }}
              >
                {cursor.user_name.slice(0, 2).toUpperCase()}
              </div>
            ))}
            {extraCursorCount > 0 && (
              <div className="w-8 h-8 rounded-full bg-neutral-800 border-2 border-neutral-900 flex items-center justify-center text-xs text-neutral-400">
                +{extraCursorCount}
              </div>
            )}
          </div>
          <BoardShareDialog boardId={boardId} />
          <Avatar className="w-9 h-9 border-2 border-neutral-800">
            <AvatarImage src={user?.avatar_url || undefined} />
            <AvatarFallback className="bg-blue-600 text-white">
              {user?.display_name?.slice(0, 2).toUpperCase() || "ME"}
            </AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 relative cursor-crosshair">
        <div className="absolute left-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-2 shadow-lg backdrop-blur">
          {TOOLS.map((t) => {
            const isDisabled = !canEdit && t.id !== "select";
            return (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              disabled={isDisabled}
              className={cn(
                "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all",
                activeTool === t.id && !isDisabled
                  ? "bg-yellow-500 text-neutral-900 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800",
                isDisabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
              title={t.label}
            >
              <t.icon className="h-5 w-5" />
              <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-100 opacity-0 shadow-md transition-all group-hover:translate-x-0 group-hover:opacity-100">
                {t.label}
              </span>
            </button>
          );
          })}
          <div className="my-1 h-px w-full bg-neutral-800" />
          <button
            type="button"
            onClick={guardedUndo}
            disabled={!canEdit || !canUndo}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
              canEdit && canUndo
                ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                : "text-neutral-700 cursor-not-allowed",
            )}
            title="Undo"
          >
            <Undo2 className="h-5 w-5" />
            <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-100 opacity-0 shadow-md transition-all group-hover:translate-x-0 group-hover:opacity-100">
              Undo
            </span>
          </button>
          <button
            type="button"
            onClick={guardedRedo}
            disabled={!canEdit || !canRedo}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
              canEdit && canRedo
                ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                : "text-neutral-700 cursor-not-allowed",
            )}
            title="Redo"
          >
            <Redo2 className="h-5 w-5" />
            <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-100 opacity-0 shadow-md transition-all group-hover:translate-x-0 group-hover:opacity-100">
              Redo
            </span>
          </button>
          <button
            type="button"
            onClick={resetZoom}
            className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
            title="Reset zoom"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-100 opacity-0 shadow-md transition-all group-hover:translate-x-0 group-hover:opacity-100">
              Reset zoom
            </span>
          </button>
        </div>
        {textEditor.isOpen && (
          <textarea
            ref={textAreaRef}
            value={textEditor.value}
            onChange={handleTextChange}
            onBlur={() => commitTextEditor(true)}
            onKeyDown={handleTextKeyDown}
            rows={1}
            spellCheck={false}
            className="absolute z-20 min-w-[120px] max-w-[420px] resize-none overflow-hidden bg-neutral-900/90 text-neutral-100 border border-neutral-700 rounded-md px-2 py-1 shadow-lg"
            style={{
              top: textEditorScreenPosition.y,
              left: textEditorScreenPosition.x,
              fontSize: textEditor.fontSize * stageScale,
              color: textEditor.color,
            }}
          />
        )}
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={stageHeight}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePosition.x}
          y={stagePosition.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={clearCursor}
          onWheel={handleWheel}
        >
          <Layer>
            <Rect
              x={worldLeft}
              y={worldTop}
              width={worldRight - worldLeft}
              height={worldBottom - worldTop}
              fill="#141414"
            />
            {gridLines.map((line, index) => (
              <Line
                key={`grid-${index}`}
                points={line.points}
                stroke={line.major ? "#2F2F2F" : "#222222"}
                strokeWidth={(line.major ? 1.2 : 1) / stageScale}
                listening={false}
              />
            ))}

            {elements.map((el) => {
              const isSelected = selectedElementId === el.id;
              if (el.element_type === "Shape") {
                if (el.properties.shapeType === "rectangle") {
                  const rectX = Math.min(el.position_x, el.position_x + el.width);
                  const rectY = Math.min(el.position_y, el.position_y + el.height);
                  const rectWidth = Math.abs(el.width);
                  const rectHeight = Math.abs(el.height);
                  return (
                    <Fragment key={el.id}>
                      <Rect
                        x={el.position_x}
                        y={el.position_y}
                        width={el.width}
                        height={el.height}
                        stroke={el.style.stroke}
                        strokeWidth={el.style.strokeWidth}
                        fill={el.style.fill}
                      />
                      {isSelected && (
                        <Rect
                          x={rectX - selectionPadding}
                          y={rectY - selectionPadding}
                          width={rectWidth + selectionPadding * 2}
                          height={rectHeight + selectionPadding * 2}
                          stroke={SELECTION_STROKE}
                          strokeWidth={selectionStrokeWidth}
                          dash={selectionDash}
                          listening={false}
                        />
                      )}
                    </Fragment>
                  );
                }
                if (el.properties.shapeType === "circle") {
                  const radius = Math.hypot(el.width || 0, el.height || 0);
                  return (
                    <Fragment key={el.id}>
                      <Circle
                        x={el.position_x}
                        y={el.position_y}
                        radius={radius}
                        stroke={el.style.stroke}
                        strokeWidth={el.style.strokeWidth}
                        fill={el.style.fill}
                      />
                      {isSelected && (
                        <Circle
                          x={el.position_x}
                          y={el.position_y}
                          radius={radius + selectionPadding}
                          stroke={SELECTION_STROKE}
                          strokeWidth={selectionStrokeWidth}
                          dash={selectionDash}
                          listening={false}
                        />
                      )}
                    </Fragment>
                  );
                }
              }

              if (el.element_type === "Drawing") {
                return (
                  <Fragment key={el.id}>
                    <Line
                      points={el.properties.points}
                      stroke={el.style.stroke}
                      strokeWidth={el.style.strokeWidth}
                      lineCap="round"
                      lineJoin="round"
                    />
                    {isSelected && (
                      <Line
                        points={el.properties.points}
                        stroke={SELECTION_STROKE}
                        strokeWidth={(el.style.strokeWidth ?? 1) + selectionStrokeWidth}
                        lineCap="round"
                        lineJoin="round"
                        dash={selectionDash}
                        listening={false}
                      />
                    )}
                  </Fragment>
                );
              }

              if (el.element_type === "Text") {
                const content = el.properties.content || "";
                const fontSize = el.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
                const { width, height } = getTextMetrics(content, fontSize);
                return (
                  <Fragment key={el.id}>
                    <KonvaText
                      x={el.position_x}
                      y={el.position_y}
                      text={content}
                      fontSize={fontSize}
                      fill={el.style.fill}
                      onDblClick={(event) => {
                        event.cancelBubble = true;
                        openTextEditor({
                          x: el.position_x,
                          y: el.position_y,
                          value: content,
                          elementId: el.id,
                          fontSize,
                          color: el.style.fill ?? DEFAULT_TEXT_STYLE.fill,
                        });
                      }}
                    />
                    {isSelected && (
                      <Rect
                        x={el.position_x - selectionPadding}
                        y={el.position_y - selectionPadding}
                        width={width + selectionPadding * 2}
                        height={height + selectionPadding * 2}
                        stroke={SELECTION_STROKE}
                        strokeWidth={selectionStrokeWidth}
                        dash={selectionDash}
                        listening={false}
                      />
                    )}
                  </Fragment>
                );
              }

              return null;
            })}

            {cursorList
              .filter((cursor) => cursor.x !== null && cursor.y !== null)
              .map((cursor) => (
                <Group
                  key={cursor.client_id}
                  x={cursor.x ?? 0}
                  y={cursor.y ?? 0}
                >
                  <Circle
                    radius={4}
                    fill={cursor.color}
                    stroke="#171717"
                    strokeWidth={1}
                  />
                  <KonvaText
                    text={cursor.user_name}
                    y={10}
                    x={-10}
                    fill={cursor.color}
                    fontSize={10}
                  />
                </Group>
              ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
