import { useCallback, useEffect } from "react";

import type { BoardElement } from "@/types/board";
import {
  applyAnchorPosition,
  getAnchorPosition,
  resolveSnapPosition,
} from "@/features/boards/elementMove.utils";
import { TOOLS, type ToolType } from "../tools";

type BoardHotkeysOptions = {
  enabled: boolean;
  textEditorOpen: boolean;
  deleteDialogOpen: boolean;
  editableSelectedElements: BoardElement[];
  elements: BoardElement[];
  gridEnabled: boolean;
  gridSize: number;
  snapToGrid: boolean;
  onDeleteSelection: () => void;
  startHistoryEntry: () => void;
  updateElement: (
    id: string,
    updater: (current: BoardElement) => BoardElement | null,
  ) => void;
  scheduleNudgePersist: (element: BoardElement) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToolChange: (tool: ToolType) => void;
};

export const useBoardHotkeys = ({
  enabled,
  textEditorOpen,
  deleteDialogOpen,
  editableSelectedElements,
  elements,
  gridEnabled,
  gridSize,
  snapToGrid,
  onDeleteSelection,
  startHistoryEntry,
  updateElement,
  scheduleNudgePersist,
  onUndo,
  onRedo,
  onToolChange,
}: BoardHotkeysOptions) => {
  const handleGlobalKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      if (textEditorOpen) return;
      if (event.defaultPrevented) return;
      if (deleteDialogOpen) return;
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

      const key = event.key.toLowerCase();
      if (key === "delete" || key === "backspace") {
        if (editableSelectedElements.length > 0) {
          event.preventDefault();
          onDeleteSelection();
        }
        return;
      }

      if (
        key === "arrowup" ||
        key === "arrowdown" ||
        key === "arrowleft" ||
        key === "arrowright"
      ) {
        if (editableSelectedElements.length === 0) return;
        event.preventDefault();
        const allowSnap = !event.altKey;
        const snapEnabled = allowSnap && gridEnabled && snapToGrid;
        const safeGrid = Math.max(1, gridSize);
        const step = snapEnabled ? safeGrid : event.shiftKey ? 10 : 1;
        const delta = {
          x: key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
          y: key === "arrowup" ? -step : key === "arrowdown" ? step : 0,
        };
        const selectedSet = new Set(
          editableSelectedElements.map((element) => element.id),
        );
        const otherElements = elements.filter(
          (element) => !selectedSet.has(element.id),
        );
        const alignmentTargets =
          editableSelectedElements.length > 1 ? [] : otherElements;
        startHistoryEntry();
        editableSelectedElements.forEach((element) => {
          let nextElement: BoardElement | null = null;
          updateElement(element.id, (current) => {
            const anchor = getAnchorPosition(current);
            const proposed = {
              x: anchor.x + delta.x,
              y: anchor.y + delta.y,
            };
            const snapped = resolveSnapPosition(
              current,
              proposed,
              alignmentTargets,
              {
                allowSnap: snapEnabled,
                gridEnabled,
                gridSize,
                snapToGrid,
              },
            );
            if (
              anchor.x === snapped.position.x &&
              anchor.y === snapped.position.y
            ) {
              nextElement = null;
              return current;
            }
            nextElement = applyAnchorPosition(current, snapped.position);
            return nextElement;
          });
          if (nextElement) {
            scheduleNudgePersist(nextElement);
          }
        });
        return;
      }

      const isModifier = event.metaKey || event.ctrlKey;

      if (!isModifier && !event.shiftKey && !event.altKey) {
        for (const tool of TOOLS) {
          if (
            "shortcut" in tool &&
            tool.shortcut &&
            tool.shortcut.toLowerCase() === key
          ) {
            event.preventDefault();
            onToolChange(tool.id);
            return;
          }
        }
      }

      if (!isModifier) return;

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (key === "y") {
        event.preventDefault();
        onRedo();
      }
    },
    [
      deleteDialogOpen,
      editableSelectedElements,
      elements,
      enabled,
      gridEnabled,
      gridSize,
      onDeleteSelection,
      onRedo,
      onUndo,
      scheduleNudgePersist,
      snapToGrid,
      startHistoryEntry,
      textEditorOpen,
      updateElement,
      onToolChange,
    ],
  );

  useEffect(() => {
    if (!enabled) return () => undefined;
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [enabled, handleGlobalKeyDown]);
};
