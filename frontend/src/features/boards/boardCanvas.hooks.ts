import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  Dispatch,
  SetStateAction,
} from "react";
import type { BoardElement, ConnectorElement } from "@/types/board";
import {
  DEFAULT_TEXT_STYLE,
  DEFAULT_STICKY_STYLE,
  createElementForTool,
  getNextZIndex,
} from "@/features/boards/boardRoute/elements";
import type { ToolType } from "@/features/boards/boardRoute/tools";
import { type Point } from "@/features/boards/boardRoute.utils";
import type {
  TextEditorState,
  UpdateElementFn,
} from "@/features/boards/boardRoute/types";
import {
  resolveSnapPosition,
  type SnapGuide,
  getElementBounds,
} from "@/features/boards/elementMove.utils";
import {
  applyConnectorRouteResult,
  applyConnectorRouting,
  arePointsEqual,
  buildConnectorRouteContext,
  buildObstacleIndex,
  isNonOrthogonalPoints,
  pruneAutoAnchorCache,
} from "@/features/boards/boardCanvas/connectorRouting";
import {
  isRectLikeElement,
  normalizeConnectorBounds,
  normalizeRectElement,
  shouldDiscardElement,
} from "@/features/boards/boardCanvas/elementUtils";
import { useCanvasZoom } from "@/features/boards/boardCanvas/useCanvasZoom";
import { useElementHitTest } from "@/features/boards/boardCanvas/useElementHitTest";
import { useElementTransformHandlers } from "@/features/boards/boardCanvas/useElementTransformHandlers";
import { useConnectorRoutingWorker } from "@/features/boards/routing/useConnectorRoutingWorker";

type UseBoardCanvasInteractionsOptions = {
  boardId: string;
  activeTool: ToolType;
  canEdit: boolean;
  canComment: boolean;
  elements: BoardElement[];
  gridEnabled: boolean;
  gridSize: number;
  snapToGrid: boolean;
  textEditor: TextEditorState;
  setTextEditor: Dispatch<SetStateAction<TextEditorState>>;
  openTextEditor: (next: Omit<TextEditorState, "isOpen">) => void;
  closeTextEditor: (suppressNextPointer?: boolean) => void;
  commitTextEditor: (suppressNextPointer?: boolean) => void;
  suppressNextPointerRef: MutableRefObject<boolean>;
  scheduleCursorUpdate: (point: Point) => void;
  clearCursor: () => void;
  scheduleSelectionUpdate: (ids: string[]) => void;
  scheduleDragPresence: (drag: {
    element_id: string;
    position_x: number;
    position_y: number;
    width?: number;
    height?: number;
    rotation?: number;
  } | null, mode?: "drag" | "resize" | "text" | null) => void;
  clearDragPresence: () => void;
  lockedElementIds: Set<string>;
  upsertElement: (element: BoardElement) => void;
  updateElement: UpdateElementFn;
  removeElement: (id: string) => void;
  persistElement: (element: BoardElement) => void;
  getElementById: (id: string) => BoardElement | null;
  startHistoryEntry: () => void;
  onCommentPin?: (payload: { position: Point; elementId: string | null }) => void;
};

export type CanvasPointerEvent = {
  screen: Point;
  world: Point;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  originalEvent: MouseEvent | PointerEvent;
};

export type CanvasWheelEvent = {
  screen: Point;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  originalEvent: WheelEvent;
};

const ROUTE_RAF_MS = 48;
const POSITION_CHANGE_THRESHOLD = 0.5;
const BIND_DISTANCE = 12;
const LIVE_ROUTE_SMOOTHING = 0.5;
const LIVE_ROUTE_MIN_DELTA = 10;

type ConnectorBindings = NonNullable<ConnectorElement["properties"]["bindings"]>;
type ConnectorBindingSide = NonNullable<ConnectorBindings["start"]>["side"];

const distanceToRect = (
  point: Point,
  bounds: { left: number; right: number; top: number; bottom: number },
) => {
  const dx = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
  const dy = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
  return Math.hypot(dx, dy);
};

const distanceToCircle = (point: Point, center: Point, radius: number) =>
  Math.max(0, Math.hypot(point.x - center.x, point.y - center.y) - radius);

const resolveBindingSide = (element: BoardElement, target: Point): ConnectorBindingSide => {
  const bounds = getElementBounds(element);
  const dx = target.x - bounds.centerX;
  const dy = target.y - bounds.centerY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
};

const findBindableElement = (
  point: Point,
  snapshot: BoardElement[],
  connectorId: string,
  maxDistance = BIND_DISTANCE,
): BoardElement | null => {
  let bestElement: BoardElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  snapshot.forEach((element) => {
    if (element.id === connectorId) return;
    if (element.element_type === "Connector" || element.element_type === "Drawing") {
      return;
    }
    let distance = Number.POSITIVE_INFINITY;
    if (element.element_type === "Shape" && element.properties.shapeType === "circle") {
      const radius = Math.hypot(element.width || 0, element.height || 0);
      const center = { x: element.position_x, y: element.position_y };
      distance = distanceToCircle(point, center, radius);
    } else {
      distance = distanceToRect(point, getElementBounds(element));
    }
    if (distance > maxDistance) return;
    if (distance < bestDistance) {
      bestElement = element;
      bestDistance = distance;
    }
  });
  return bestElement;
};


export function useBoardCanvasInteractions({
  boardId,
  activeTool,
  canEdit,
  canComment,
  elements,
  gridEnabled,
  gridSize,
  snapToGrid,
  textEditor,
  setTextEditor,
  openTextEditor,
  closeTextEditor,
  commitTextEditor,
  suppressNextPointerRef,
  scheduleCursorUpdate,
  clearCursor,
  scheduleSelectionUpdate,
  scheduleDragPresence,
  clearDragPresence,
  lockedElementIds,
  upsertElement,
  updateElement,
  removeElement,
  persistElement,
  getElementById,
  startHistoryEntry,
  onCommentPin,
}: UseBoardCanvasInteractionsOptions) {
  const [action, setAction] = useState<"none" | "drawing" | "moving">("none");
  const currentShapeId = useRef<string | null>(null);
  const pendingCreationRef = useRef<{
    id: string;
    tool: ToolType;
    start: Point;
  } | null>(null);
  const lastPointerRef = useRef<Point | null>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const selectedElementIdSet = useMemo(
    () => new Set(selectedElementIds),
    [selectedElementIds],
  );
  const [localOverrides, setLocalOverrides] = useState<Record<string, BoardElement>>({});
  const localOverridesRef = useRef(localOverrides);
  const elementsRef = useRef(elements);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const routeRafRef = useRef<number | null>(null);
  const lastRouteFrameRef = useRef(0);
  const routedOnLoadRef = useRef<Set<string>>(new Set());
  const lastLiveElementRouteRef = useRef<
    Map<string, { x: number; y: number; width: number; height: number; rotation: number }>
  >(new Map());
  const isPanningRef = useRef(false);
  const panStartRef = useRef<Point | null>(null);
  const panStageStartRef = useRef<{ x: number; y: number } | null>(null);
  const elementsCount = elements.length;
  const elementsSnapshotRef = useRef<{
    elements: BoardElement[];
    overrides: Record<string, BoardElement>;
    snapshot: BoardElement[];
  } | null>(null);
  const obstacleIndexRef = useRef<{
    snapshot: BoardElement[];
    index: ReturnType<typeof buildObstacleIndex> | null;
  } | null>(null);

  const {
    stageRef,
    stageScale,
    stagePosition,
    stagePositionRef,
    handleWheel,
    resetZoom,
    setStagePositionDirect,
  } = useCanvasZoom();

  useEffect(() => {
    localOverridesRef.current = localOverrides;
  }, [localOverrides]);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const stopPanning = useCallback(() => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    panStartRef.current = null;
    panStageStartRef.current = null;
    const container = stageRef.current;
    if (container) {
      container.style.cursor = "";
    }
  }, [stageRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMouseUp = () => stopPanning();
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseUp);
    };
  }, [stopPanning]);

  const renderElements = useMemo(() => {
    const overrideKeys = Object.keys(localOverrides);
    if (overrideKeys.length === 0) return elements;
    return elements.map((element) => localOverrides[element.id] ?? element);
  }, [elements, localOverrides]);

  const localOverrideIds = useMemo(
    () => new Set(Object.keys(localOverrides)),
    [localOverrides],
  );

  const snapTargets = useMemo(
    () => renderElements.filter((element) => !selectedElementIdSet.has(element.id)),
    [renderElements, selectedElementIdSet],
  );

  const elementIdSet = useMemo(
    () => new Set(elements.map((element) => element.id)),
    [elements],
  );

  const boundConnectorsByElement = useMemo(() => {
    const map = new Map<string, ConnectorElement[]>();
    renderElements.forEach((element) => {
      if (element.element_type !== "Connector") return;
      const connector = element as ConnectorElement;
      const bindings = connector.properties.bindings;
      const startId = bindings?.start?.elementId;
      const endId = bindings?.end?.elementId;
      if (startId) {
        const list = map.get(startId) ?? [];
        list.push(connector);
        map.set(startId, list);
      }
      if (endId) {
        const list = map.get(endId) ?? [];
        list.push(connector);
        map.set(endId, list);
      }
    });
    return map;
  }, [renderElements]);
  const boundConnectorsRef = useRef(boundConnectorsByElement);

  useEffect(() => {
    boundConnectorsRef.current = boundConnectorsByElement;
  }, [boundConnectorsByElement]);

  const buildElementsSnapshot = useCallback(() => {
    const elementsValue = elementsRef.current;
    const overridesValue = localOverridesRef.current;
    const cached = elementsSnapshotRef.current;
    if (cached?.elements === elementsValue && cached.overrides === overridesValue) {
      return cached.snapshot;
    }
    const snapshot = elementsValue.map(
      (element) => overridesValue[element.id] ?? element,
    );
    elementsSnapshotRef.current = {
      elements: elementsValue,
      overrides: overridesValue,
      snapshot,
    };
    return snapshot;
  }, []);

  const buildElementIndex = useCallback((snapshot: BoardElement[]) => {
    const map = new Map<string, BoardElement>();
    snapshot.forEach((element) => {
      map.set(element.id, element);
    });
    return map;
  }, []);

  const getObstacleIndex = useCallback((snapshot: BoardElement[]) => {
    const cached = obstacleIndexRef.current;
    if (cached?.snapshot === snapshot) {
      return cached.index;
    }
    const index = buildObstacleIndex(snapshot);
    obstacleIndexRef.current = { snapshot, index };
    return index;
  }, []);

  const applyConnectorRoutingMemo = useCallback(
    (
      connector: BoardElement,
      snapshot: BoardElement[],
      elementIndex: Map<string, BoardElement>,
      options?: {
        avoidObstacles?: boolean;
        lockAutoSide?: boolean;
        obstacleIndex?: ReturnType<typeof buildObstacleIndex> | null;
      },
    ) => applyConnectorRouting(connector, snapshot, elementIndex, options),
    [],
  );
  const { requestRoute } = useConnectorRoutingWorker();
  const routeSeqRef = useRef(new Map<string, number>());

  const requestConnectorRoute = useCallback(
    (
      context: ReturnType<typeof buildConnectorRouteContext>,
      fallback: () => ConnectorElement,
      onResult: (next: ConnectorElement, provisional: boolean) => void,
      options?: { provisional?: boolean },
    ) => {
      if (!context) {
        const next = fallback();
        onResult(next, false);
        return Promise.resolve(next);
      }
      const base = applyConnectorRouteResult(context);
      if (!context.requiresRoute) {
        onResult(base, false);
        return Promise.resolve(base);
      }
      const connectorId = base.id;
      const nextSeq = (routeSeqRef.current.get(connectorId) ?? 0) + 1;
      routeSeqRef.current.set(connectorId, nextSeq);
      if (options?.provisional !== false) {
        onResult(base, true);
      }
      const pending = requestRoute({
        start: context.routeStart,
        end: context.routeEnd,
        obstacles: context.obstacles,
        options: context.routeOptions,
      });
      if (!pending) {
        const next = fallback();
        onResult(next, false);
        return Promise.resolve(next);
      }
      return pending
        .then((result) => {
          if (routeSeqRef.current.get(connectorId) !== nextSeq) {
            return base;
          }
          const next = applyConnectorRouteResult(context, result);
          onResult(next, false);
          return next;
        })
        .catch(() => {
          if (routeSeqRef.current.get(connectorId) !== nextSeq) {
            return base;
          }
          const next = fallback();
          onResult(next, false);
          return next;
        });
    },
    [requestRoute],
  );

  useEffect(() => {
    pruneAutoAnchorCache(renderElements);
  }, [renderElements]);


  const setLocalOverride = useCallback((id: string, element: BoardElement) => {
    setLocalOverrides((prev) => {
      const existing = prev[id];
      if (existing === element) return prev;
      const next = { ...prev, [id]: element };
      localOverridesRef.current = next;
      return next;
    });
  }, []);

  const clearLocalOverride = useCallback((id: string) => {
    setLocalOverrides((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      localOverridesRef.current = next;
      return next;
    });
  }, []);

  const updateBoundConnectors = useCallback(
    (elementId: string, mode: "live" | "commit") => {
      const connectors = boundConnectorsRef.current.get(elementId);
      if (!connectors || connectors.length === 0) return;
      const snapshot = buildElementsSnapshot();
      const elementIndex = buildElementIndex(snapshot);
      const obstacleIndex = getObstacleIndex(snapshot);
      const movedElement = mode === "live" ? elementIndex.get(elementId) : null;
      if (mode === "live" && movedElement) {
        const rotation = movedElement.rotation ?? 0;
        const prev = lastLiveElementRouteRef.current.get(elementId);
        if (prev) {
          const delta =
            Math.hypot(movedElement.position_x - prev.x, movedElement.position_y - prev.y)
            + Math.hypot(movedElement.width - prev.width, movedElement.height - prev.height)
            + Math.abs(rotation - prev.rotation);
          if (delta < LIVE_ROUTE_MIN_DELTA) {
            return;
          }
        }
      }
      connectors.forEach((connector) => {
        const current =
          localOverridesRef.current[connector.id]
          ?? elementIndex.get(connector.id)
          ?? connector;
        const connectorCurrent = current as ConnectorElement;
        const routingOptions =
          mode === "live"
            ? { avoidObstacles: true, lockAutoSide: true, obstacleIndex }
            : { obstacleIndex };
        const context = buildConnectorRouteContext(
          connectorCurrent,
          snapshot,
          elementIndex,
          routingOptions,
        );

        void requestConnectorRoute(
          context,
          () =>
            applyConnectorRoutingMemo(
              connectorCurrent,
              snapshot,
              elementIndex,
              routingOptions,
            ) as ConnectorElement,
          (next, provisional) => {
            let smoothed = next;
            if (
              mode === "live" &&
              !provisional &&
              connectorCurrent.properties.points &&
              next.properties.points &&
              connectorCurrent.properties.points.length === next.properties.points.length
            ) {
              const currentPoints = connectorCurrent.properties.points;
              const targetPoints = next.properties.points;
              const smoothedPoints = targetPoints.map((value, index) => {
                const currentValue = currentPoints[index] ?? value;
                return currentValue + (value - currentValue) * LIVE_ROUTE_SMOOTHING;
              });
              smoothed = {
                ...next,
                properties: {
                  ...next.properties,
                  points: smoothedPoints,
                  start: {
                    x:
                      (connectorCurrent.properties.start?.x ?? next.properties.start.x) +
                      (next.properties.start.x -
                        (connectorCurrent.properties.start?.x ?? next.properties.start.x)) *
                        LIVE_ROUTE_SMOOTHING,
                    y:
                      (connectorCurrent.properties.start?.y ?? next.properties.start.y) +
                      (next.properties.start.y -
                        (connectorCurrent.properties.start?.y ?? next.properties.start.y)) *
                        LIVE_ROUTE_SMOOTHING,
                  },
                  end: {
                    x:
                      (connectorCurrent.properties.end?.x ?? next.properties.end.x) +
                      (next.properties.end.x -
                        (connectorCurrent.properties.end?.x ?? next.properties.end.x)) *
                        LIVE_ROUTE_SMOOTHING,
                    y:
                      (connectorCurrent.properties.end?.y ?? next.properties.end.y) +
                      (next.properties.end.y -
                        (connectorCurrent.properties.end?.y ?? next.properties.end.y)) *
                        LIVE_ROUTE_SMOOTHING,
                  },
                },
              };
            }

            if (
              connectorCurrent.element_type === "Connector"
              && smoothed.element_type === "Connector"
            ) {
              const pointsChanged = !arePointsEqual(
                connectorCurrent.properties.points,
                smoothed.properties.points,
              );
              const endpointsChanged =
                Math.abs((connectorCurrent.properties.start?.x ?? 0) - (smoothed.properties.start?.x ?? 0)) > POSITION_CHANGE_THRESHOLD
                || Math.abs((connectorCurrent.properties.start?.y ?? 0) - (smoothed.properties.start?.y ?? 0)) > POSITION_CHANGE_THRESHOLD
                || Math.abs((connectorCurrent.properties.end?.x ?? 0) - (smoothed.properties.end?.x ?? 0)) > POSITION_CHANGE_THRESHOLD
                || Math.abs((connectorCurrent.properties.end?.y ?? 0) - (smoothed.properties.end?.y ?? 0)) > POSITION_CHANGE_THRESHOLD;

              if (!pointsChanged && !endpointsChanged) return;
            }

            if (mode === "live") {
              setLocalOverride(connector.id, smoothed);
              return;
            }
            if (provisional) return;
            updateElement(connector.id, () => smoothed);
            persistElement(smoothed);
            clearLocalOverride(connector.id);
          },
          { provisional: mode === "live" },
        );
      });
      if (mode === "live" && movedElement) {
        lastLiveElementRouteRef.current.set(elementId, {
          x: movedElement.position_x,
          y: movedElement.position_y,
          width: movedElement.width,
          height: movedElement.height,
          rotation: movedElement.rotation ?? 0,
        });
      }
    },
    [
      applyConnectorRoutingMemo,
      buildElementIndex,
      buildElementsSnapshot,
      clearLocalOverride,
      persistElement,
      requestConnectorRoute,
      setLocalOverride,
      updateElement,
    ],
  );

  const scheduleConnectorRouting = useCallback(
    (elementId: string) => {
      if (routeRafRef.current !== null) return;
      const schedule = (targetId: string) => {
        routeRafRef.current = window.requestAnimationFrame(() => {
          routeRafRef.current = null;
          const now = performance.now();
          if (now - lastRouteFrameRef.current < ROUTE_RAF_MS) {
            schedule(targetId);
            return;
          }
          lastRouteFrameRef.current = now;
          updateBoundConnectors(targetId, "live");
        });
      };
      schedule(elementId);
    },
    [updateBoundConnectors],
  );

  const clampPointToCanvas = useCallback(
    (point: Point) => ({ x: point.x, y: point.y }),
    [],
  );

  const isWithinCanvas = useCallback(
    (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    [],
  );

  const findElementAtPoint = useElementHitTest({ renderElements, stageScale });

  const resolveSnap = useCallback(
    (
      current: BoardElement | null,
      position: { x: number; y: number },
      allowSnap: boolean,
    ) => {
      if (!current) {
        return { position, guides: [] as SnapGuide[] };
      }
      return resolveSnapPosition(current, position, snapTargets, {
        allowSnap,
        gridEnabled,
        gridSize,
        snapToGrid,
        alignmentThreshold: 0,
      });
    },
    [gridEnabled, gridSize, snapTargets, snapToGrid],
  );

  const handleMouseDown = useCallback(
    (event: CanvasPointerEvent) => {
      if (textEditor.isOpen) return;
      if (suppressNextPointerRef.current) {
        suppressNextPointerRef.current = false;
        return;
      }
      if (action === "drawing") return;
      pendingCreationRef.current = null;

      const position = event.world;
      lastPointerRef.current = position;
      const withinCanvas = isWithinCanvas(position);

      if (activeTool === "select") {
        if (event.button === 1) {
          event.originalEvent.preventDefault();
          if (!withinCanvas) return;
          isPanningRef.current = true;
          panStartRef.current = event.screen;
          panStageStartRef.current = stagePositionRef.current;
          const container = stageRef.current;
          if (container) {
            container.style.cursor = "grabbing";
          }
          return;
        }
        const isMultiSelect = event.shiftKey;
        if (!withinCanvas) {
          if (!isMultiSelect) {
            setSelectedElementIds([]);
          }
          setAction("none");
          return;
        }
        const hit = findElementAtPoint(position);
        if (!hit) {
          if (!isMultiSelect) {
            setSelectedElementIds([]);
          }
          setAction("none");
          return;
        }
        if (isMultiSelect) {
          setSelectedElementIds((prev) =>
            prev.includes(hit.id)
              ? prev.filter((id) => id !== hit.id)
              : [...prev, hit.id],
          );
        } else {
          setSelectedElementIds([hit.id]);
        }
        setAction("none");
        return;
      }

      if (activeTool === "text") {
        if (!canEdit) return;
        if (!withinCanvas) return;
        openTextEditor({
          x: position.x,
          y: position.y,
          value: "",
          elementId: null,
          fontSize: DEFAULT_TEXT_STYLE.fontSize,
          color: DEFAULT_TEXT_STYLE.fill,
          elementType: "Text",
          backgroundColor: undefined,
        });
        setAction("none");
        return;
      }

      if (activeTool === "comment") {
        if (!canComment) return;
        if (event.button !== 0) return;
        if (!withinCanvas) return;
        const hit = findElementAtPoint(position);
        onCommentPin?.({
          position,
          elementId: hit?.id ?? null,
        });
        setAction("none");
        return;
      }

      if (!canEdit) return;
      if (!withinCanvas) return;
      const id = crypto.randomUUID();
      currentShapeId.current = id;
      pendingCreationRef.current = { id, tool: activeTool, start: position };
      setAction("drawing");
    },
    [
      action,
      activeTool,
      canEdit,
      canComment,
      findElementAtPoint,
      isWithinCanvas,
      openTextEditor,
      onCommentPin,
      stagePositionRef,
      stageRef,
      suppressNextPointerRef,
      textEditor.isOpen,
    ],
  );

  const handleMouseMove = useCallback(
    (event: CanvasPointerEvent) => {
      if (textEditor.isOpen) return;

      const position = event.world;

      if (isPanningRef.current) {
        const panStart = panStartRef.current;
        const stageStart = panStageStartRef.current;
        if (!panStart || !stageStart) return;
        setStagePositionDirect({
          x: stageStart.x + (event.screen.x - panStart.x),
          y: stageStart.y + (event.screen.y - panStart.y),
        });
        return;
      }

      if (isWithinCanvas(position)) {
        scheduleCursorUpdate(position);
      } else {
        clearCursor();
      }

      if (action !== "drawing" || !currentShapeId.current) return;

      const pending = pendingCreationRef.current;
      const existing = getElementById(currentShapeId.current);
      if (!existing && pending) {
        startHistoryEntry();
        const newElement = createElementForTool(
          pending.tool,
          boardId,
          pending.id,
          pending.start,
          getNextZIndex(elements),
        );
        if (newElement) {
          upsertElement(newElement);
        }
      }

      const nextPoint = clampPointToCanvas(position);
      updateElement(currentShapeId.current, (currentElement) => {
        if (isRectLikeElement(currentElement)) {
          return {
            ...currentElement,
            width: nextPoint.x - currentElement.position_x,
            height: nextPoint.y - currentElement.position_y,
          };
        }

        if (currentElement.element_type === "Drawing") {
          const newPoints = [
            ...(currentElement.properties.points || []),
            nextPoint.x,
            nextPoint.y,
          ];
          return {
            ...currentElement,
            properties: {
              ...currentElement.properties,
              points: newPoints,
            },
          };
        }

        if (currentElement.element_type === "Connector") {
          return {
            ...currentElement,
            properties: {
              ...currentElement.properties,
              end: { x: nextPoint.x, y: nextPoint.y },
            },
          };
        }

        return null;
      });
    },
    [
      action,
      boardId,
      clampPointToCanvas,
      clearCursor,
      elements,
      getElementById,
      isWithinCanvas,
      scheduleCursorUpdate,
      setStagePositionDirect,
      startHistoryEntry,
      textEditor.isOpen,
      updateElement,
      upsertElement,
    ],
  );

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      stopPanning();
      return;
    }
    if (action === "drawing" && currentShapeId.current) {
      const pending = pendingCreationRef.current;
      const currentElement = getElementById(currentShapeId.current);
      if (currentElement && shouldDiscardElement(currentElement)) {
        removeElement(currentShapeId.current);
        setAction("none");
        currentShapeId.current = null;
        pendingCreationRef.current = null;
        return;
      }

      let elementToPersist = currentElement;

      if (currentElement && currentElement.element_type === "Connector") {
        const connector = currentElement as ConnectorElement;
        let normalized = normalizeConnectorBounds(currentElement) as ConnectorElement;
        const connectorId = currentShapeId.current;
        const bindSnapshot = buildElementsSnapshot();
        const startTarget = findBindableElement(
          normalized.properties.start,
          bindSnapshot,
          normalized.id,
        );
        const endTarget = findBindableElement(
          normalized.properties.end,
          bindSnapshot,
          normalized.id,
        );
        if (startTarget || endTarget) {
          normalized = {
            ...normalized,
            properties: {
              ...normalized.properties,
              bindings: {
                ...(normalized.properties.bindings ?? {}),
                ...(startTarget
                  ? {
                      start: {
                        elementId: startTarget.id,
                        side: resolveBindingSide(
                          startTarget,
                          normalized.properties.end,
                        ),
                      },
                    }
                  : {}),
                ...(endTarget
                  ? {
                      end: {
                        elementId: endTarget.id,
                        side: resolveBindingSide(
                          endTarget,
                          normalized.properties.start,
                        ),
                      },
                    }
                  : {}),
              },
            },
          };
        }
        const snapshot = buildElementsSnapshot();
        const elementIndex = buildElementIndex(snapshot);
        const obstacleIndex = getObstacleIndex(snapshot);
        const routingContext = buildConnectorRouteContext(
          normalized,
          snapshot,
          elementIndex,
          { obstacleIndex },
        );
        void requestConnectorRoute(
          routingContext,
          () =>
            applyConnectorRoutingMemo(
              normalized,
              snapshot,
              elementIndex,
              { obstacleIndex },
            ) as ConnectorElement,
          (routed) => {
            if (
              routed.position_x !== connector.position_x ||
              routed.position_y !== connector.position_y ||
              routed.width !== connector.width ||
              routed.height !== connector.height ||
              !arePointsEqual(connector.properties.points, routed.properties.points) ||
              connector.properties.routing?.mode !== routed.properties.routing?.mode
            ) {
              if (connectorId) {
                updateElement(connectorId, () => routed);
                persistElement(routed);
              }
            }
          },
          { provisional: false },
        );
        elementToPersist = null;
      }

      if (currentElement && isRectLikeElement(currentElement)) {
        const normalized = normalizeRectElement(currentElement);
        if (
          normalized.position_x !== currentElement.position_x ||
          normalized.position_y !== currentElement.position_y ||
          normalized.width !== currentElement.width ||
          normalized.height !== currentElement.height
        ) {
          updateElement(currentShapeId.current, () => normalized);
          elementToPersist = normalized;
        }
      }

      if (pending?.tool === "sticky_note" && elementToPersist) {
        const normalized = isRectLikeElement(elementToPersist)
          ? elementToPersist
          : normalizeRectElement(elementToPersist);

        const padding = 12;
        const editorWidth = Math.max(0, normalized.width - padding * 2);
        const editorHeight = Math.max(0, normalized.height - padding * 2);
        openTextEditor({
          x: normalized.position_x + padding,
          y: normalized.position_y + padding,
          value: "",
          elementId: pending?.id ?? currentShapeId.current,
          fontSize: DEFAULT_STICKY_STYLE.fontSize ?? 16,
          color: DEFAULT_STICKY_STYLE.textColor ?? "#1F2937",
          elementType: "StickyNote",
          backgroundColor: DEFAULT_STICKY_STYLE.fill,
          editorWidth,
          editorHeight,
        });
      }

      if (elementToPersist) {
        persistElement(elementToPersist);
      }
    }

    setAction("none");
    currentShapeId.current = null;
    pendingCreationRef.current = null;
  }, [
    action,
    applyConnectorRoutingMemo,
    buildElementIndex,
    buildElementsSnapshot,
    getElementById,
    openTextEditor,
    persistElement,
    requestConnectorRoute,
    removeElement,
    stopPanning,
    updateElement,
  ]);

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

  const {
    handleElementDragMove,
    handleElementDragEnd,
    handleElementTransform,
    handleElementTransformEnd,
    handleDrawingDragEnd,
  } = useElementTransformHandlers({
    canEdit,
    lockedElementIds,
    localOverridesRef,
    getElementById,
    resolveSnap,
    scheduleConnectorRouting,
    scheduleDragPresence,
    setLocalOverride,
    setSnapGuides,
    startHistoryEntry,
    updateElement,
    persistElement,
    updateBoundConnectors,
    clearLocalOverride,
    clearDragPresence,
  });

  const ensureSelectionExists = useCallback(() => {
    if (selectedElementIds.length === 0) return;
    const nextSelection = selectedElementIds.filter((id) => elementIdSet.has(id));
    if (nextSelection.length !== selectedElementIds.length) {
      setSelectedElementIds(nextSelection);
    }
  }, [elementIdSet, selectedElementIds]);

  useEffect(() => {
    queueMicrotask(() => {
      ensureSelectionExists();
    });
  }, [ensureSelectionExists]);

  useEffect(() => {
    scheduleSelectionUpdate(selectedElementIds);
  }, [scheduleSelectionUpdate, selectedElementIds]);

  useEffect(() => {
    if (action !== "none") return;
    let cancelled = false;
    const snapshot = buildElementsSnapshot();
    const elementIndex = buildElementIndex(snapshot);
    const obstacleIndex = getObstacleIndex(snapshot);
    const promises: Promise<ConnectorElement | null>[] = [];
    snapshot.forEach((element) => {
      if (element.element_type !== "Connector") return;
      if (lockedElementIds.has(element.id)) return;
      const connector = element as ConnectorElement;
      const points = connector.properties.points;
      const shouldRouteOnLoad = !routedOnLoadRef.current.has(connector.id);
      const routingMode = connector.properties.routing?.mode ?? "orthogonal";
      const hasDiagonal = isNonOrthogonalPoints(points);
      const needsRoute =
        routingMode !== "orthogonal"
        || !points
        || points.length < 4
        || hasDiagonal
        || shouldRouteOnLoad;
      if (!needsRoute) return;
      let next = connector as ConnectorElement;
      if (shouldRouteOnLoad) {
        const existingBindings = next.properties.bindings ?? {};
        const resolveBinding = (
          binding: typeof existingBindings.start | undefined,
          point: Point,
          opposite: Point,
        ) => {
          if (binding?.elementId) {
            const target = elementIndex.get(binding.elementId);
            if (target) {
              return {
                elementId: binding.elementId,
                side:
                  binding.side === "auto"
                    ? resolveBindingSide(target, opposite)
                    : binding.side,
              };
            }
          }
          const target = findBindableElement(point, snapshot, connector.id);
          if (!target) return undefined;
          return {
            elementId: target.id,
            side: resolveBindingSide(target, opposite),
          };
        };
        const resolvedStart = resolveBinding(
          existingBindings.start,
          connector.properties.start,
          connector.properties.end,
        );
        const resolvedEnd = resolveBinding(
          existingBindings.end,
          connector.properties.end,
          connector.properties.start,
        );
        if (resolvedStart || resolvedEnd) {
          next = {
            ...next,
            properties: {
              ...next.properties,
              bindings: {
                ...existingBindings,
                ...(resolvedStart ? { start: resolvedStart } : {}),
                ...(resolvedEnd ? { end: resolvedEnd } : {}),
              },
            },
          };
        }
      }
      const context = buildConnectorRouteContext(
        next,
        snapshot,
        elementIndex,
        { lockAutoSide: true, obstacleIndex },
      );
      const promise = requestConnectorRoute(
        context,
        () =>
          applyConnectorRoutingMemo(
            next,
            snapshot,
            elementIndex,
            { lockAutoSide: true, obstacleIndex },
          ) as ConnectorElement,
        () => {},
        { provisional: false },
      ).then((routed) => {
        if (cancelled) return null;
        const pointsChanged = !arePointsEqual(points, routed.properties.points);
        const routingChanged =
          connector.properties.routing?.mode !== routed.properties.routing?.mode;
        if (!pointsChanged && !routingChanged) {
          if (shouldRouteOnLoad) {
            routedOnLoadRef.current.add(connector.id);
          }
          return null;
        }
        if (shouldRouteOnLoad) {
          routedOnLoadRef.current.add(connector.id);
        }
        return routed;
      });
      promises.push(promise);
    });
    if (promises.length === 0) return;
    void Promise.all(promises).then((resolved) => {
      if (cancelled) return;
      const updates = resolved.filter((item): item is ConnectorElement => !!item);
      if (updates.length === 0) return;
      updates.forEach((next) => {
        updateElement(next.id, () => next);
      });
      updates.forEach((next) => {
        persistElement(next);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    action,
    applyConnectorRoutingMemo,
    buildElementIndex,
    buildElementsSnapshot,
    elementsCount,
    lockedElementIds,
    persistElement,
    requestConnectorRoute,
    updateElement,
  ]);

  const textEditorScreenPosition = useMemo(
    () => ({
      x: textEditor.x * stageScale + stagePosition.x,
      y: textEditor.y * stageScale + stagePosition.y,
    }),
    [stagePosition.x, stagePosition.y, stageScale, textEditor.x, textEditor.y],
  );

  return {
    stageRef,
    stageScale,
    stagePosition,
    renderElements,
    localOverrideIds,
    selectedElementIds,
    setSelectedElementIds,
    snapGuides,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    resetZoom,
    handleTextChange,
    handleTextKeyDown,
    handleElementDragMove,
    handleElementDragEnd,
    handleElementTransform,
    handleElementTransformEnd,
    handleDrawingDragEnd,
    textEditorScreenPosition,
  };
}
export { useBoardViewport } from "@/features/boards/boardCanvas/useBoardViewport";
