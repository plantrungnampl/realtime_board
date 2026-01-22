import { useCallback, useRef } from "react";

import type {
  BoardElement,
  BoardElementResponse,
  CreateBoardElementRequest,
  DeleteBoardElementResponse,
  RestoreBoardElementResponse,
  UpdateBoardElementRequest,
} from "@/features/boards/types";
import {
  createBoardElement,
  deleteBoardElement,
  restoreBoardElement,
  updateBoardElement,
} from "@/features/boards/api";
import { getApiErrorCode, getApiErrorMessage } from "@/shared/api/errors";

type UseBoardElementMutationsOptions = {
  boardId: string;
  onPersisted: (elementId: string, version: number, updatedAt: string) => void;
  onReconciled?: (element: BoardElement) => void;
  onReplaced?: (oldId: string, element: BoardElement) => void;
  onError?: (message: string) => void;
};

const DEFAULT_ERROR_MESSAGE = "Unable to save element changes right now.";
const DEFAULT_DELETE_ERROR_MESSAGE = "Unable to delete the element right now.";
const DEFAULT_RESTORE_ERROR_MESSAGE = "Unable to restore the element right now.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPoint = (value: unknown): value is { x: number; y: number } =>
  isRecord(value) && typeof value.x === "number" && typeof value.y === "number";

const isBoardElementData = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.board_id === "string" &&
    typeof value.element_type === "string" &&
    typeof value.position_x === "number" &&
    typeof value.position_y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
};

const ELEMENT_TYPE_MAP: Record<string, BoardElement["element_type"]> = {
  shape: "Shape",
  text: "Text",
  sticky_note: "StickyNote",
  image: "Image",
  video: "Video",
  frame: "Frame",
  connector: "Connector",
  drawing: "Drawing",
  embed: "Embed",
  document: "Document",
  component: "Component",
};

const normalizeElementType = (
  value: unknown,
): BoardElement["element_type"] | null => {
  if (typeof value !== "string") return null;
  const allowedValues = Object.values(ELEMENT_TYPE_MAP);
  if (allowedValues.includes(value as BoardElement["element_type"])) {
    return value as BoardElement["element_type"];
  }
  const normalized = value.toLowerCase();
  return ELEMENT_TYPE_MAP[normalized] ?? null;
};

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

const resolveElementDimensions = (element: BoardElement) => {
  let positionX = element.position_x;
  let positionY = element.position_y;
  let width = element.width;
  let height = element.height;

  if (element.element_type === "Connector") {
    const props = element.properties as Record<string, unknown>;
    const start = isPoint(props.start) ? props.start : null;
    const end = isPoint(props.end) ? props.end : null;
    if (start && end) {
      positionX = Math.min(start.x, end.x);
      positionY = Math.min(start.y, end.y);
      width = Math.max(1, Math.abs(end.x - start.x));
      height = Math.max(1, Math.abs(end.y - start.y));
    }
  } else if (RECT_LIKE_TYPES.has(element.element_type)) {
    if (width < 0) {
      positionX += width;
      width = Math.abs(width);
    }
    if (height < 0) {
      positionY += height;
      height = Math.abs(height);
    }
  }
  width = Math.max(1, Math.abs(width));
  height = Math.max(1, Math.abs(height));

  return {
    position_x: positionX,
    position_y: positionY,
    width,
    height,
  };
};

const normalizeRotation = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  let next = value % 360;
  if (next < 0) {
    next += 360;
  }
  return next >= 360 ? 0 : next;
};

const normalizeBoardElement = (value: unknown): BoardElement | null => {
  if (!isBoardElementData(value)) return null;
  const elementType = normalizeElementType(value.element_type);
  if (!elementType) return null;
  return {
    ...value,
    element_type: elementType,
    style: isRecord(value.style) ? value.style : {},
    properties: isRecord(value.properties) ? value.properties : {},
  } as unknown as BoardElement;
};

const toCreatePayload = (element: BoardElement): CreateBoardElementRequest => {
  const dimensions = resolveElementDimensions(element);
  return {
    id: element.id,
    element_type: element.element_type,
    position_x: dimensions.position_x,
    position_y: dimensions.position_y,
    width: dimensions.width,
    height: dimensions.height,
    rotation: element.rotation,
    style: element.style,
    properties: element.properties as Record<string, unknown>,
  };
};

const toBoardElement = (element: BoardElementResponse): BoardElement =>
  normalizeBoardElement(element) ?? (element as unknown as BoardElement);

const buildUpdatePayload = (
  element: BoardElement,
  expectedVersion: number,
): UpdateBoardElementRequest => {
  const dimensions = resolveElementDimensions(element);
  return {
    expected_version: expectedVersion,
    position_x: dimensions.position_x,
    position_y: dimensions.position_y,
    width: dimensions.width,
    height: dimensions.height,
    rotation: normalizeRotation(element.rotation),
    style: element.style,
    properties: element.properties as Record<string, unknown>,
  };
};

const serializeRecord = (value: unknown) => {
  if (!isRecord(value)) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const cloneBoardElement = (
  element: BoardElement,
  overrides: Partial<BoardElement>,
): BoardElement => ({ ...element, ...overrides } as BoardElement);

const isSameSnapshot = (left: BoardElement, right: BoardElement) =>
  left.position_x === right.position_x &&
  left.position_y === right.position_y &&
  left.width === right.width &&
  left.height === right.height &&
  (left.rotation ?? 0) === (right.rotation ?? 0) &&
  serializeRecord(left.style) === serializeRecord(right.style) &&
  serializeRecord(left.properties) === serializeRecord(right.properties);

type DeleteElementResult = {
  ok: boolean;
  response?: DeleteBoardElementResponse;
  latest?: BoardElement;
  pendingCreate?: boolean;
};

type RestoreElementResult = {
  ok: boolean;
  response?: RestoreBoardElementResponse;
};

export function useBoardElementMutations({
  boardId,
  onPersisted,
  onReconciled,
  onReplaced,
  onError,
}: UseBoardElementMutationsOptions) {
  const inFlightCreatesRef = useRef(new Set<string>());
  const pendingCreatesRef = useRef(new Map<string, BoardElement>());
  const pendingDeletesRef = useRef(new Set<string>());
  const reconcileCreatedElement = useCallback(
    (originalId: string, created: BoardElementResponse) => {
      const reconciled = toBoardElement(created);
      if (reconciled.id !== originalId) {
        if (onReplaced) {
          onReplaced(originalId, reconciled);
        } else if (onReconciled) {
          onReconciled(reconciled);
        }
      } else if (onReconciled) {
        onReconciled(reconciled);
      }
      onPersisted(
        reconciled.id,
        created.version,
        created.updated_at ?? "",
      );
      return reconciled;
    },
    [onPersisted, onReconciled, onReplaced],
  );
  const persistUpdate = useCallback(
    async (element: BoardElement, expectedVersion: number) => {
      const payload = buildUpdatePayload(element, expectedVersion);

      try {
        const updated = await updateBoardElement(boardId, element.id, payload);
        onPersisted(element.id, updated.version, updated.updated_at);
        return true;
      } catch (error) {
        const code = getApiErrorCode(error);
        if (code === "NOT_FOUND") {
          try {
            const created = await createBoardElement(
              boardId,
              toCreatePayload(element),
            );
            reconcileCreatedElement(element.id, created);
            return true;
          } catch (createError) {
            const message = getApiErrorMessage(
              createError,
              DEFAULT_ERROR_MESSAGE,
            );
            if (onError) {
              onError(message);
            } else {
              window.alert(message);
            }
            return false;
          }
        }
        const message = getApiErrorMessage(error, DEFAULT_ERROR_MESSAGE);
        if (onError) {
          onError(message);
        } else {
          window.alert(message);
        }
        return false;
      }
    },
    [boardId, onError, onPersisted, reconcileCreatedElement],
  );
  const persistElement = useCallback(
    async (element: BoardElement) => {
      if (typeof element.version !== "number") {
        const inFlight = inFlightCreatesRef.current;
        const pending = pendingCreatesRef.current;
        if (inFlight.has(element.id)) {
          pending.set(element.id, element);
          return;
        }
        inFlight.add(element.id);
        pending.set(element.id, element);

        try {
          const created = await createBoardElement(
            boardId,
            toCreatePayload(element),
          );
          if (pendingDeletesRef.current.has(element.id)) {
            pendingDeletesRef.current.delete(element.id);
            pending.delete(element.id);
            try {
              await deleteBoardElement(boardId, created.id, created.version);
            } catch (error) {
              const message = getApiErrorMessage(error, DEFAULT_DELETE_ERROR_MESSAGE);
              if (onError) {
                onError(message);
              } else {
                window.alert(message);
              }
            }
            return;
          }
          const reconciled = reconcileCreatedElement(element.id, created);

          const queued = pending.get(element.id) ?? null;
          pending.delete(element.id);
          if (queued && !isSameSnapshot(queued, reconciled)) {
            const queuedElement =
              reconciled.id === element.id
                ? queued
                : cloneBoardElement(queued, {
                    id: reconciled.id,
                    board_id: boardId,
                  });
            await persistUpdate(queuedElement, created.version);
          }
        } catch (error) {
          const message = getApiErrorMessage(error, DEFAULT_ERROR_MESSAGE);
          if (onError) {
            onError(message);
          } else {
            window.alert(message);
          }
        } finally {
          inFlightCreatesRef.current.delete(element.id);
          pendingCreatesRef.current.delete(element.id);
        }
        return;
      }

      await persistUpdate(element, element.version);
    },
    [boardId, onError, persistUpdate, reconcileCreatedElement],
  );

  const deleteElement = useCallback(
    async (element: BoardElement): Promise<DeleteElementResult> => {
      if (typeof element.version !== "number") {
        const hasPendingCreate =
          inFlightCreatesRef.current.has(element.id) ||
          pendingCreatesRef.current.has(element.id);
        if (hasPendingCreate) {
          pendingDeletesRef.current.add(element.id);
        }
        pendingCreatesRef.current.delete(element.id);
        return { ok: true, pendingCreate: hasPendingCreate };
      }

      const attemptDelete = async (
        target: BoardElement,
      ): Promise<DeleteElementResult> => {
        try {
          const response = await deleteBoardElement(
            boardId,
            target.id,
            target.version ?? 0,
          );
          return { ok: true, response };
        } catch (error) {
          const message = getApiErrorMessage(error, DEFAULT_DELETE_ERROR_MESSAGE);
          if (onError) {
            onError(message);
          } else {
            window.alert(message);
          }
          return { ok: false, latest: target };
        }
      };

      return attemptDelete(element);
    },
    [boardId, onError],
  );

  const clearPendingDelete = useCallback((elementId: string) => {
    pendingDeletesRef.current.delete(elementId);
  }, []);

  const restoreElement = useCallback(
    async (
      elementId: string,
      expectedVersion: number,
    ): Promise<RestoreElementResult> => {
      const attemptRestore = async (
        version: number,
      ): Promise<RestoreElementResult> => {
        try {
          const response = await restoreBoardElement(
            boardId,
            elementId,
            version,
          );
          return { ok: true, response };
        } catch (error) {
          const message = getApiErrorMessage(error, DEFAULT_RESTORE_ERROR_MESSAGE);
          if (onError) {
            onError(message);
          } else {
            window.alert(message);
          }
          return { ok: false };
        }
      };

      return attemptRestore(expectedVersion);
    },
    [boardId, onError],
  );

  return {
    persistElement,
    deleteElement,
    restoreElement,
    clearPendingDelete,
  };
}
