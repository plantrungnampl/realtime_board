import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BoardElement } from "@/types/board";

type UndoDeleteState = {
  elements: BoardElement[];
  versions: Record<string, number | null>;
  pendingCreateIds: string[];
  isRestoring: boolean;
};

type DeleteResult = {
  ok: boolean;
  response?: { version?: number; updated_at?: string };
  latest?: BoardElement;
  pendingCreate?: boolean;
};

type RestoreResult = {
  ok: boolean;
  response?: { version: number; updated_at?: string };
};

type UseDeleteSelectionOptions = {
  canEdit: boolean;
  textEditorOpen: boolean;
  elements: BoardElement[];
  editableSelectedElements: BoardElement[];
  lockedElementIds: Set<string>;
  setSelectedElementIds: (updater: (prev: string[]) => string[]) => void;
  removeElement: (id: string) => void;
  upsertElement: (element: BoardElement) => void;
  deleteElement: (element: BoardElement) => Promise<DeleteResult>;
  restoreElement: (elementId: string, expectedVersion: number) => Promise<RestoreResult>;
  persistElement: (element: BoardElement) => Promise<void> | void;
  applyRemotePatch: (
    id: string,
    patch: Partial<BoardElement>,
    origin?: "remote" | "sync",
  ) => void;
  clearPendingDelete: (elementId: string) => void;
  undoTimeoutMs: number;
};

export const useDeleteSelection = ({
  canEdit,
  textEditorOpen,
  elements,
  editableSelectedElements,
  lockedElementIds,
  setSelectedElementIds,
  removeElement,
  upsertElement,
  deleteElement,
  restoreElement,
  persistElement,
  applyRemotePatch,
  clearPendingDelete,
  undoTimeoutMs,
}: UseDeleteSelectionOptions) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [undoDeleteState, setUndoDeleteState] = useState<UndoDeleteState | null>(
    null,
  );
  const undoDeleteTimerRef = useRef<number | null>(null);

  const pendingDeleteElements = useMemo(() => {
    if (pendingDeleteIds.length === 0) return [];
    const pendingSet = new Set(pendingDeleteIds);
    return elements.filter((element) => pendingSet.has(element.id));
  }, [elements, pendingDeleteIds]);

  const clearUndoDeleteTimer = useCallback(() => {
    if (undoDeleteTimerRef.current) {
      window.clearTimeout(undoDeleteTimerRef.current);
      undoDeleteTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearUndoDeleteTimer();
    };
  }, [clearUndoDeleteTimer]);

  const showUndoDelete = useCallback(
    (
      entries: Array<{
        element: BoardElement;
        version: number | null;
        pendingCreate: boolean;
      }>,
    ) => {
      if (entries.length === 0) return;
      clearUndoDeleteTimer();
      const versions = Object.fromEntries(
        entries.map((entry) => [entry.element.id, entry.version]),
      );
      const pendingCreateIds = entries
        .filter((entry) => entry.pendingCreate)
        .map((entry) => entry.element.id);
      setUndoDeleteState({
        elements: entries.map((entry) => entry.element),
        versions,
        pendingCreateIds,
        isRestoring: false,
      });
      undoDeleteTimerRef.current = window.setTimeout(() => {
        setUndoDeleteState(null);
        undoDeleteTimerRef.current = null;
      }, undoTimeoutMs);
    },
    [clearUndoDeleteTimer, undoTimeoutMs],
  );

  const handleDeleteElements = useCallback(
    async (targets: BoardElement[]) => {
      const unlockedTargets = targets.filter(
        (element) => !lockedElementIds.has(element.id),
      );
      if (unlockedTargets.length === 0) return;
      const deleteIds = new Set(unlockedTargets.map((element) => element.id));
      setSelectedElementIds((prev) => prev.filter((id) => !deleteIds.has(id)));
      unlockedTargets.forEach((element) => {
        removeElement(element.id);
      });

      const results = await Promise.all(
        unlockedTargets.map((element) => deleteElement(element)),
      );
      const undoEntries: Array<{
        element: BoardElement;
        version: number | null;
        pendingCreate: boolean;
      }> = [];

      results.forEach((result, index) => {
        const element = unlockedTargets[index];
        if (result.ok) {
          undoEntries.push({
            element,
            version: result.response?.version ?? null,
            pendingCreate: Boolean(result.pendingCreate),
          });
          return;
        }
        const latest = result.latest ?? element;
        upsertElement(latest);
      });

      showUndoDelete(undoEntries);
    },
    [
      deleteElement,
      lockedElementIds,
      removeElement,
      setSelectedElementIds,
      showUndoDelete,
      upsertElement,
    ],
  );

  const handleUndoDelete = useCallback(async () => {
    if (!undoDeleteState || undoDeleteState.isRestoring) return;
    clearUndoDeleteTimer();
    setUndoDeleteState((prev) =>
      prev ? { ...prev, isRestoring: true } : prev,
    );

    undoDeleteState.pendingCreateIds.forEach((elementId) => {
      clearPendingDelete(elementId);
    });
    const pendingCreateSet = new Set(undoDeleteState.pendingCreateIds);

    const results = await Promise.all(
      undoDeleteState.elements.map(async (element) => {
        upsertElement(element);
        if (pendingCreateSet.has(element.id)) {
          return true;
        }
        const expectedVersion = undoDeleteState.versions[element.id];
        if (typeof expectedVersion === "number") {
          const result = await restoreElement(element.id, expectedVersion);
          if (result.ok && result.response) {
            applyRemotePatch(
              element.id,
              {
                version: result.response.version,
                ...(result.response.updated_at
                  ? { updated_at: result.response.updated_at }
                  : {}),
              },
              "sync",
            );
            return true;
          }
          removeElement(element.id);
          return false;
        }
        await persistElement(element);
        return true;
      }),
    );

    if (results.some((result) => !result)) {
      setUndoDeleteState(null);
      return;
    }
    setUndoDeleteState(null);
  }, [
    applyRemotePatch,
    clearPendingDelete,
    clearUndoDeleteTimer,
    persistElement,
    removeElement,
    restoreElement,
    undoDeleteState,
    upsertElement,
  ]);

  const requestDeleteSelection = useCallback(() => {
    if (!canEdit || textEditorOpen) return;
    if (editableSelectedElements.length === 0) return;
    if (editableSelectedElements.length > 1) {
      setPendingDeleteIds(
        editableSelectedElements.map((element) => element.id),
      );
      setDeleteDialogOpen(true);
      return;
    }
    handleDeleteElements(editableSelectedElements);
  }, [
    canEdit,
    editableSelectedElements,
    handleDeleteElements,
    textEditorOpen,
  ]);

  const confirmDeleteSelection = useCallback(() => {
    if (pendingDeleteElements.length === 0) {
      setDeleteDialogOpen(false);
      setPendingDeleteIds([]);
      return;
    }
    handleDeleteElements(pendingDeleteElements);
    setDeleteDialogOpen(false);
    setPendingDeleteIds([]);
  }, [handleDeleteElements, pendingDeleteElements]);

  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) {
      setPendingDeleteIds([]);
    }
  }, []);

  return {
    deleteDialogOpen,
    pendingDeleteElements,
    undoDeleteState,
    requestDeleteSelection,
    confirmDeleteSelection,
    handleUndoDelete,
    handleDeleteDialogOpenChange,
  };
};
