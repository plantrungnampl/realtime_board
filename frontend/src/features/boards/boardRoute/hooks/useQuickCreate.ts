import { useCallback, useMemo, useState } from "react";

import type { BoardElement, ConnectorElement } from "@/types/board";
import type { ToolType } from "@/features/boards/boardRoute/tools";
import type { QuickCreateDirection } from "@/features/boards/components/BoardQuickCreateHandles";
import {
  DEFAULT_SHAPE_STYLE,
  createElementForTool,
  getNextZIndex,
} from "@/features/boards/boardRoute/elements";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import { applyConnectorRouting } from "@/features/boards/boardCanvas/connectorRouting";
import { clamp } from "@/features/boards/boardRoute.utils";

const QUICK_CREATE_SIZE = { width: 180, height: 120 };
const QUICK_CREATE_GAP = 80;
const QUICK_CREATE_GHOST_STEP = 24;
const QUICK_CREATE_GHOST_MAX_STEPS = 4;
const QUICK_CREATE_GHOST_CLEARANCE = 6;

const QUICK_CREATE_GHOST_OFFSETS = (() => {
  const offsets = [0];
  for (let step = 1; step <= QUICK_CREATE_GHOST_MAX_STEPS; step += 1) {
    offsets.push(-step * QUICK_CREATE_GHOST_STEP, step * QUICK_CREATE_GHOST_STEP);
  }
  return offsets;
})();

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

type QuickCreatePositions = {
  top: { x: number; y: number };
  right: { x: number; y: number };
  bottom: { x: number; y: number };
  left: { x: number; y: number };
};

type UseQuickCreateOptions = {
  boardId: string;
  canEdit: boolean;
  isPrimaryLocked: boolean;
  canShowQuickCreate: boolean;
  elements: BoardElement[];
  renderElements: BoardElement[];
  primarySelectedElement: BoardElement | null;
  selectionBounds: Bounds | null;
  selectionScreenBounds: Bounds | null;
  canvasWidth: number;
  stageHeight: number;
  routeObstacles: Set<BoardElement["element_type"]>;
  buildConnectorRoute: (
    connector: BoardElement,
    obstacleElements: BoardElement[],
  ) => Promise<BoardElement>;
  persistElement: (element: BoardElement) => void;
  startHistoryEntry: () => void;
  upsertElement: (element: BoardElement) => void;
  setSelectedElementIds: (ids: string[]) => void;
};

const rectsOverlap = (a: Bounds, b: Bounds, padding: number) => {
  const padded = {
    left: b.left - padding,
    right: b.right + padding,
    top: b.top - padding,
    bottom: b.bottom + padding,
  };
  return (
    a.left < padded.right &&
    a.right > padded.left &&
    a.top < padded.bottom &&
    a.bottom > padded.top
  );
};

export const useQuickCreate = ({
  boardId,
  canEdit,
  isPrimaryLocked,
  canShowQuickCreate,
  elements,
  renderElements,
  primarySelectedElement,
  selectionBounds,
  selectionScreenBounds,
  canvasWidth,
  stageHeight,
  routeObstacles,
  buildConnectorRoute,
  persistElement,
  startHistoryEntry,
  upsertElement,
  setSelectedElementIds,
}: UseQuickCreateOptions) => {
  const hoverKey = canShowQuickCreate
    ? (primarySelectedElement?.id ?? "none")
    : "disabled";
  const [hoverState, setHoverState] = useState<{
    key: string;
    value: QuickCreateDirection | null;
  }>(() => ({ key: hoverKey, value: null }));
  const quickCreateHover = hoverState.key === hoverKey ? hoverState.value : null;
  const setQuickCreateHover = useCallback(
    (next: QuickCreateDirection | null) => {
      setHoverState({ key: hoverKey, value: next });
    },
    [hoverKey],
  );

  const quickCreatePositions = useMemo<QuickCreatePositions | null>(() => {
    if (!selectionScreenBounds) return null;
    const offset = 28;
    return {
      top: {
        x: clamp(selectionScreenBounds.centerX, 16, canvasWidth - 16),
        y: clamp(selectionScreenBounds.top - offset, 16, stageHeight - 16),
      },
      right: {
        x: clamp(selectionScreenBounds.right + offset, 16, canvasWidth - 16),
        y: clamp(selectionScreenBounds.centerY, 16, stageHeight - 16),
      },
      bottom: {
        x: clamp(selectionScreenBounds.centerX, 16, canvasWidth - 16),
        y: clamp(selectionScreenBounds.bottom + offset, 16, stageHeight - 16),
      },
      left: {
        x: clamp(selectionScreenBounds.left - offset, 16, canvasWidth - 16),
        y: clamp(selectionScreenBounds.centerY, 16, stageHeight - 16),
      },
    };
  }, [canvasWidth, selectionScreenBounds, stageHeight]);

  const ghostObstacles = useMemo(() => {
    if (!primarySelectedElement) return [];
    return renderElements
      .filter(
        (element) =>
          element.id !== primarySelectedElement.id &&
          routeObstacles.has(element.element_type),
      )
      .map(getElementBounds);
  }, [primarySelectedElement, renderElements, routeObstacles]);

  const quickCreateGhost = useMemo(() => {
    if (!quickCreateHover || !selectionBounds || !primarySelectedElement) {
      return null;
    }
    const baseLeft = (() => {
      if (quickCreateHover === "right") {
        return selectionBounds.right + QUICK_CREATE_GAP;
      }
      if (quickCreateHover === "left") {
        return selectionBounds.left - QUICK_CREATE_GAP - QUICK_CREATE_SIZE.width;
      }
      return selectionBounds.centerX - QUICK_CREATE_SIZE.width / 2;
    })();
    const baseTop = (() => {
      if (quickCreateHover === "bottom") {
        return selectionBounds.bottom + QUICK_CREATE_GAP;
      }
      if (quickCreateHover === "top") {
        return selectionBounds.top - QUICK_CREATE_GAP - QUICK_CREATE_SIZE.height;
      }
      return selectionBounds.centerY - QUICK_CREATE_SIZE.height / 2;
    })();
    const isCircle =
      primarySelectedElement.element_type === "Shape" &&
      primarySelectedElement.properties.shapeType === "circle";
    const ghostWidth = isCircle
      ? Math.min(QUICK_CREATE_SIZE.width, QUICK_CREATE_SIZE.height)
      : QUICK_CREATE_SIZE.width;
    const ghostHeight = isCircle ? ghostWidth : QUICK_CREATE_SIZE.height;
    const innerOffsetX = (QUICK_CREATE_SIZE.width - ghostWidth) / 2;
    const innerOffsetY = (QUICK_CREATE_SIZE.height - ghostHeight) / 2;

    const tryResolveGhostBounds = () => {
      for (const offset of QUICK_CREATE_GHOST_OFFSETS) {
        const offsetX =
          quickCreateHover === "top" || quickCreateHover === "bottom"
            ? offset
            : 0;
        const offsetY =
          quickCreateHover === "left" || quickCreateHover === "right"
            ? offset
            : 0;
        const left = baseLeft + innerOffsetX + offsetX;
        const top = baseTop + innerOffsetY + offsetY;
        const bounds = {
          left,
          right: left + ghostWidth,
          top,
          bottom: top + ghostHeight,
          centerX: left + ghostWidth / 2,
          centerY: top + ghostHeight / 2,
        };
        const blocked = ghostObstacles.some((obstacle) =>
          rectsOverlap(bounds, obstacle, QUICK_CREATE_GHOST_CLEARANCE),
        );
        if (!blocked) return bounds;
      }
      return null;
    };

    const resolved = tryResolveGhostBounds();
    if (!resolved) return null;
    const ghostStyle = {
      stroke: primarySelectedElement.style.stroke ?? DEFAULT_SHAPE_STYLE.stroke,
      strokeWidth:
        primarySelectedElement.style.strokeWidth ??
        DEFAULT_SHAPE_STYLE.strokeWidth,
      fill: DEFAULT_SHAPE_STYLE.fill,
      cornerRadius: primarySelectedElement.style.cornerRadius,
    };

    if (isCircle) {
      const radius = ghostWidth / 2;
      return {
        id: "ghost-preview",
        board_id: boardId,
        element_type: "Shape",
        position_x: resolved.centerX,
        position_y: resolved.centerY,
        width: radius,
        height: 0,
        rotation: 0,
        z_index: (primarySelectedElement.z_index ?? 0) + 1,
        style: ghostStyle,
        properties: { shapeType: "circle" },
      } satisfies BoardElement;
    }

    return {
      id: "ghost-preview",
      board_id: boardId,
      element_type: "Shape",
      position_x: resolved.left,
      position_y: resolved.top,
      width: ghostWidth,
      height: ghostHeight,
      rotation: 0,
      z_index: (primarySelectedElement.z_index ?? 0) + 1,
      style: ghostStyle,
      properties: { shapeType: "rectangle" },
    } satisfies BoardElement;
  }, [
    boardId,
    ghostObstacles,
    primarySelectedElement,
    quickCreateHover,
    selectionBounds,
  ]);

  const handleQuickCreate = useCallback(
    (direction: QuickCreateDirection) => {
      if (!primarySelectedElement || !selectionBounds) return;
      if (!canEdit || isPrimaryLocked) return;
      startHistoryEntry();

      const newId = crypto.randomUUID();
      const connectorId = crypto.randomUUID();
      const baseZ = getNextZIndex(elements);

      const basePosition = (() => {
        if (direction === "right") {
          return {
            x: selectionBounds.right + QUICK_CREATE_GAP,
            y: selectionBounds.centerY - QUICK_CREATE_SIZE.height / 2,
          };
        }
        if (direction === "left") {
          return {
            x: selectionBounds.left - QUICK_CREATE_GAP - QUICK_CREATE_SIZE.width,
            y: selectionBounds.centerY - QUICK_CREATE_SIZE.height / 2,
          };
        }
        if (direction === "top") {
          return {
            x: selectionBounds.centerX - QUICK_CREATE_SIZE.width / 2,
            y: selectionBounds.top - QUICK_CREATE_GAP - QUICK_CREATE_SIZE.height,
          };
        }
        return {
          x: selectionBounds.centerX - QUICK_CREATE_SIZE.width / 2,
          y: selectionBounds.bottom + QUICK_CREATE_GAP,
        };
      })();

      const isCircle =
        primarySelectedElement.element_type === "Shape" &&
        primarySelectedElement.properties.shapeType === "circle";
      const createPosition = isCircle
        ? {
            x: basePosition.x + QUICK_CREATE_SIZE.width / 2,
            y: basePosition.y + QUICK_CREATE_SIZE.height / 2,
          }
        : basePosition;
      const quickCreateTool: ToolType = isCircle
        ? "shape:circle"
        : "shape:rectangle";

      const newElement = createElementForTool(
        quickCreateTool,
        boardId,
        newId,
        createPosition,
        baseZ + 1,
      );

      if (!newElement) return;
      const radius =
        Math.min(QUICK_CREATE_SIZE.width, QUICK_CREATE_SIZE.height) / 2;
      const inheritedStyle =
        primarySelectedElement.element_type === "Shape"
          ? {
              ...(primarySelectedElement.style.stroke
                ? { stroke: primarySelectedElement.style.stroke }
                : {}),
              ...(typeof primarySelectedElement.style.strokeWidth === "number"
                ? { strokeWidth: primarySelectedElement.style.strokeWidth }
                : {}),
            }
          : {};
      const sizedElement: BoardElement = {
        ...newElement,
        width: isCircle ? radius : QUICK_CREATE_SIZE.width,
        height: isCircle ? 0 : QUICK_CREATE_SIZE.height,
        style: {
          ...newElement.style,
          ...inheritedStyle,
        },
      };

      const targetBounds = getElementBounds(sizedElement);
      if (!targetBounds) return;

      const start = (() => {
        if (direction === "right") {
          return { x: selectionBounds.right, y: selectionBounds.centerY };
        }
        if (direction === "left") {
          return { x: selectionBounds.left, y: selectionBounds.centerY };
        }
        if (direction === "top") {
          return { x: selectionBounds.centerX, y: selectionBounds.top };
        }
        return { x: selectionBounds.centerX, y: selectionBounds.bottom };
      })();

      const end = (() => {
        if (direction === "right") {
          return { x: targetBounds.left, y: targetBounds.centerY };
        }
        if (direction === "left") {
          return { x: targetBounds.right, y: targetBounds.centerY };
        }
        if (direction === "top") {
          return { x: targetBounds.centerX, y: targetBounds.bottom };
        }
        return { x: targetBounds.centerX, y: targetBounds.top };
      })();

      const connectorBase = createElementForTool(
        "connector",
        boardId,
        connectorId,
        start,
        baseZ,
      );
      if (!connectorBase || connectorBase.element_type !== "Connector") return;
      const connectorBaseElement = connectorBase as ConnectorElement;
      const connector: ConnectorElement = {
        ...connectorBaseElement,
        position_x: Math.min(start.x, end.x),
        position_y: Math.min(start.y, end.y),
        width: Math.max(1, Math.abs(end.x - start.x)),
        height: Math.max(1, Math.abs(end.y - start.y)),
        properties: {
          ...connectorBaseElement.properties,
          start,
          end,
          routing: { mode: "orthogonal" },
          bindings: {
            start: {
              elementId: primarySelectedElement.id,
              side: "auto",
            },
            end: {
              elementId: sizedElement.id,
              side: "auto",
            },
          },
        },
      };

      void buildConnectorRoute(connector, [
        ...elements,
        sizedElement,
      ]).then((routedConnector) => {
        if (routedConnector.id !== connector.id) return;
        upsertElement(routedConnector);
        persistElement(routedConnector);
      });

      upsertElement(connector);
      upsertElement(sizedElement);
      persistElement(connector);
      persistElement(sizedElement);
      setSelectedElementIds([sizedElement.id]);
    },
    [
      boardId,
      buildConnectorRoute,
      canEdit,
      elements,
      isPrimaryLocked,
      persistElement,
      primarySelectedElement,
      selectionBounds,
      setSelectedElementIds,
      startHistoryEntry,
      upsertElement,
    ],
  );

  return {
    setQuickCreateHover,
    quickCreatePositions,
    quickCreateGhost,
    handleQuickCreate,
  };
};
