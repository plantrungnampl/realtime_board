import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { BoardElement } from "@/types/board";
import type { SnapGuide } from "@/features/boards/elementMove.utils";
import { applyAnchorPosition } from "@/features/boards/elementMove.utils";
import {
  cloneBoardElement,
  normalizeRectElement,
  normalizeRotation,
} from "@/features/boards/boardCanvas/elementUtils";

const ROTATION_FALLBACK = 0;

type ResolveSnapResult = { position: { x: number; y: number }; guides: SnapGuide[] };

type ResolveSnapFn = (
  current: BoardElement | null,
  position: { x: number; y: number },
  allowSnap: boolean,
) => ResolveSnapResult;

type DragPresencePayload = {
  element_id: string;
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  rotation?: number;
};

type TransformPayload = {
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  font_size?: number;
};

type UseElementTransformHandlersOptions = {
  canEdit: boolean;
  lockedElementIds: Set<string>;
  localOverridesRef: MutableRefObject<Record<string, BoardElement>>;
  getElementById: (id: string) => BoardElement | null;
  resolveSnap: ResolveSnapFn;
  scheduleConnectorRouting: (elementId: string) => void;
  scheduleDragPresence: (
    drag: DragPresencePayload | null,
    mode?: "drag" | "resize" | "text" | null,
  ) => void;
  setLocalOverride: (id: string, element: BoardElement) => void;
  setSnapGuides: Dispatch<SetStateAction<SnapGuide[]>>;
  startHistoryEntry: () => void;
  updateElement: (id: string, updater: (current: BoardElement) => BoardElement | null) => void;
  persistElement: (element: BoardElement) => void;
  updateBoundConnectors: (elementId: string, mode: "live" | "commit") => void;
  clearLocalOverride: (id: string) => void;
  clearDragPresence: () => void;
};

export const useElementTransformHandlers = ({
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
}: UseElementTransformHandlersOptions) => {
  const handleElementDragMove = useCallback(
    (
      id: string,
      position: { x: number; y: number },
      modifiers?: { allowSnap?: boolean },
    ) => {
      if (!canEdit) return;
      if (lockedElementIds.has(id)) return;
      const current = localOverridesRef.current[id] ?? getElementById(id);
      if (!current) return;
      const allowSnap = modifiers?.allowSnap !== false;
      const snapped = resolveSnap(current, position, allowSnap);
      const nextElement = applyAnchorPosition(current, snapped.position);
      setLocalOverride(id, nextElement);
      if (nextElement.element_type !== "Connector") {
        scheduleConnectorRouting(id);
      }
      setSnapGuides([]);
      scheduleDragPresence({
        element_id: id,
        position_x: nextElement.position_x,
        position_y: nextElement.position_y,
        width: nextElement.width,
        height: nextElement.height,
        rotation: nextElement.rotation ?? ROTATION_FALLBACK,
      }, "drag");
    },
    [
      canEdit,
      getElementById,
      lockedElementIds,
      localOverridesRef,
      resolveSnap,
      scheduleConnectorRouting,
      scheduleDragPresence,
      setLocalOverride,
      setSnapGuides,
    ],
  );

  const handleElementTransform = useCallback(
    (id: string, payload: TransformPayload) => {
      if (!canEdit) return;
      if (lockedElementIds.has(id)) return;
      const current =
        localOverridesRef.current[id] ?? getElementById(id);
      if (!current) return;
      let nextElement = cloneBoardElement(current, {
        position_x: payload.position_x,
        position_y: payload.position_y,
        width: payload.width,
        height: payload.height,
        rotation: normalizeRotation(payload.rotation),
      });
      if (typeof payload.font_size === "number") {
        nextElement = {
          ...nextElement,
          style: { ...nextElement.style, fontSize: payload.font_size },
        };
      }
      setLocalOverride(id, nextElement);
      if (nextElement.element_type !== "Connector") {
        scheduleConnectorRouting(id);
      }
      scheduleDragPresence({
        element_id: id,
        position_x: nextElement.position_x,
        position_y: nextElement.position_y,
        width: nextElement.width,
        height: nextElement.height,
        rotation: nextElement.rotation ?? ROTATION_FALLBACK,
      }, "resize");
    },
    [
      canEdit,
      getElementById,
      lockedElementIds,
      localOverridesRef,
      scheduleConnectorRouting,
      scheduleDragPresence,
      setLocalOverride,
    ],
  );

  const handleElementTransformEnd = useCallback(
    (id: string, payload: TransformPayload) => {
      if (!canEdit) return;
      if (lockedElementIds.has(id)) return;
      const current = localOverridesRef.current[id] ?? getElementById(id);
      if (!current) return;
      let updated = cloneBoardElement(current, {
        position_x: payload.position_x,
        position_y: payload.position_y,
        width: payload.width,
        height: payload.height,
        rotation: normalizeRotation(payload.rotation),
      });
      if (typeof payload.font_size === "number") {
        updated = {
          ...updated,
          style: { ...updated.style, fontSize: payload.font_size },
        };
      }
      const normalized = normalizeRectElement(updated);
      startHistoryEntry();
      updateElement(id, () => normalized);
      persistElement(normalized);
      if (normalized.element_type !== "Connector") {
        updateBoundConnectors(id, "commit");
      }
      clearLocalOverride(id);
      clearDragPresence();
    },
    [
      canEdit,
      clearDragPresence,
      clearLocalOverride,
      getElementById,
      lockedElementIds,
      localOverridesRef,
      persistElement,
      startHistoryEntry,
      updateBoundConnectors,
      updateElement,
    ],
  );

  const handleDrawingDragEnd = useCallback(
    (
      id: string,
      position: { x: number; y: number },
      modifiers?: { allowSnap?: boolean },
    ) => {
      if (!canEdit) return;
      if (lockedElementIds.has(id)) return;
      const allowSnap = modifiers?.allowSnap !== false;
      const current = localOverridesRef.current[id] ?? getElementById(id);
      if (!current) return;
      const snapped = resolveSnap(current, position, allowSnap);
      const nextElement =
        current.element_type === "Drawing" &&
        (current.position_x !== snapped.position.x ||
          current.position_y !== snapped.position.y)
          ? applyAnchorPosition(current, snapped.position)
          : null;
      startHistoryEntry();
      if (nextElement) {
        updateElement(id, () => nextElement);
        persistElement(nextElement);
        updateBoundConnectors(id, "commit");
      } else {
        updateElement(id, () => current);
      }
      clearLocalOverride(id);
      setSnapGuides([]);
      clearDragPresence();
    },
    [
      canEdit,
      clearDragPresence,
      clearLocalOverride,
      getElementById,
      lockedElementIds,
      localOverridesRef,
      persistElement,
      resolveSnap,
      setSnapGuides,
      startHistoryEntry,
      updateBoundConnectors,
      updateElement,
    ],
  );

  const handleElementDragEnd = useCallback(
    (
      id: string,
      position: { x: number; y: number },
      modifiers?: { allowSnap?: boolean },
    ) => {
      if (!canEdit) return;
      if (lockedElementIds.has(id)) return;
      const allowSnap = modifiers?.allowSnap !== false;
      const current = localOverridesRef.current[id] ?? getElementById(id);
      if (!current) return;
      const snapped = resolveSnap(current, position, allowSnap);
      const nextElement =
        current.position_x !== snapped.position.x ||
        current.position_y !== snapped.position.y
          ? applyAnchorPosition(current, snapped.position)
          : null;
      startHistoryEntry();
      if (nextElement) {
        updateElement(id, () => nextElement);
        persistElement(nextElement);
        updateBoundConnectors(id, "commit");
      } else {
        updateElement(id, () => current);
      }
      clearLocalOverride(id);
      setSnapGuides([]);
      clearDragPresence();
    },
    [
      canEdit,
      clearDragPresence,
      clearLocalOverride,
      getElementById,
      lockedElementIds,
      localOverridesRef,
      persistElement,
      resolveSnap,
      setSnapGuides,
      startHistoryEntry,
      updateBoundConnectors,
      updateElement,
    ],
  );

  return {
    handleElementDragMove,
    handleElementDragEnd,
    handleElementTransform,
    handleElementTransformEnd,
    handleDrawingDragEnd,
  };
};
