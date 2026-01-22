import { useMemo } from "react";

import type { BoardElement } from "@/types/board";
import type { ToolType } from "@/features/boards/boardRoute/tools";
import { clamp } from "@/features/boards/boardRoute.utils";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import {
  SUPPORTS_FILL,
  SUPPORTS_QUICK_CREATE,
  SUPPORTS_STROKE,
} from "@/features/boards/boardRoute/constants";

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

type UseSelectionUiOptions = {
  elements: BoardElement[];
  renderElements: BoardElement[];
  selectedElementIds: string[];
  lockedElementIds: Set<string>;
  canEdit: boolean;
  activeTool: ToolType;
  textEditorOpen: boolean;
  stageScale: number;
  stagePosition: { x: number; y: number };
  stageHeight: number;
  canvasWidth: number;
};

export const useSelectionUi = ({
  elements,
  renderElements,
  selectedElementIds,
  lockedElementIds,
  canEdit,
  activeTool,
  textEditorOpen,
  stageScale,
  stagePosition,
  stageHeight,
  canvasWidth,
}: UseSelectionUiOptions) => {
  const selectedElements = useMemo(() => {
    if (selectedElementIds.length === 0) return [];
    const selectedSet = new Set(selectedElementIds);
    return elements.filter((element) => selectedSet.has(element.id));
  }, [elements, selectedElementIds]);

  const editableSelectedElements = useMemo(
    () => selectedElements.filter((element) => !lockedElementIds.has(element.id)),
    [lockedElementIds, selectedElements],
  );

  const primarySelectedElement = useMemo(() => {
    if (selectedElementIds.length !== 1) return null;
    const selectedId = selectedElementIds[0];
    return renderElements.find((element) => element.id === selectedId) ?? null;
  }, [renderElements, selectedElementIds]);

  const selectionBounds = useMemo(() => {
    if (!primarySelectedElement) return null;
    return getElementBounds(primarySelectedElement);
  }, [primarySelectedElement]);

  const selectionScreenBounds = useMemo<Bounds | null>(() => {
    if (!selectionBounds) return null;
    return {
      left: selectionBounds.left * stageScale + stagePosition.x,
      right: selectionBounds.right * stageScale + stagePosition.x,
      top: selectionBounds.top * stageScale + stagePosition.y,
      bottom: selectionBounds.bottom * stageScale + stagePosition.y,
      centerX: selectionBounds.centerX * stageScale + stagePosition.x,
      centerY: selectionBounds.centerY * stageScale + stagePosition.y,
    };
  }, [selectionBounds, stagePosition.x, stagePosition.y, stageScale]);

  const isPrimaryLocked = primarySelectedElement
    ? lockedElementIds.has(primarySelectedElement.id)
    : false;

  const supportsFill = SUPPORTS_FILL.has(
    primarySelectedElement?.element_type ?? "Shape",
  );
  const supportsStroke = SUPPORTS_STROKE.has(
    primarySelectedElement?.element_type ?? "Shape",
  );

  const canShowSelectionToolbar =
    Boolean(primarySelectedElement) &&
    !isPrimaryLocked &&
    canEdit &&
    activeTool === "select" &&
    !textEditorOpen &&
    (supportsFill || supportsStroke);

  const selectionToolbarPosition = useMemo(() => {
    if (!selectionScreenBounds) return null;
    const x = clamp(selectionScreenBounds.centerX, 16, canvasWidth - 16);
    const y = clamp(selectionScreenBounds.top - 12, 16, stageHeight - 16);
    return { x, y };
  }, [canvasWidth, selectionScreenBounds, stageHeight]);

  const canShowQuickCreate =
    Boolean(primarySelectedElement) &&
    !isPrimaryLocked &&
    canEdit &&
    activeTool === "select" &&
    !textEditorOpen &&
    SUPPORTS_QUICK_CREATE.has(primarySelectedElement?.element_type ?? "Shape");

  return {
    selectedElements,
    editableSelectedElements,
    primarySelectedElement,
    selectionBounds,
    selectionScreenBounds,
    isPrimaryLocked,
    supportsFill,
    supportsStroke,
    canShowSelectionToolbar,
    selectionToolbarPosition,
    canShowQuickCreate,
  };
};
