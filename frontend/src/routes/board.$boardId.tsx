import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/store/useAppStore";
import type { BoardElement } from "@/types/board";
import { BoardHeader } from "@/features/boards/components/BoardHeader";
import { BoardCanvasShell } from "@/features/boards/components/BoardCanvasShell";
import { BoardDeleteDialog } from "@/features/boards/components/BoardDeleteDialog";
import { useBoardElementMutations } from "@/features/boards/hooks/useBoardElementMutations";
import { resolveRolePermissions } from "@/features/boards/permissions";
import { usePageBackgroundColor } from "@/features/boards/boardRoute.utils";
import { getBoardStatusScreen } from "@/features/boards/boardRoute/boardStatus";
import { useBoardAccess } from "@/features/boards/boardRoute/hooks/useBoardAccess";
import { useBoardHotkeys } from "@/features/boards/boardRoute/hooks/useBoardHotkeys";
import { ROUTE_OBSTACLES } from "@/features/boards/boardRoute/constants";
import { useDeleteSelection } from "@/features/boards/boardRoute/hooks/useDeleteSelection";
import { useBoardRestoration } from "@/features/boards/boardRoute/hooks/useBoardRestoration";
import { useConnectorRouting } from "@/features/boards/boardRoute/hooks/useConnectorRouting";
import { usePresenceUi } from "@/features/boards/boardRoute/hooks/usePresenceUi";
import { usePublicWorkspaceToast } from "@/features/boards/boardRoute/hooks/usePublicWorkspaceToast";
import { useQuickCreate } from "@/features/boards/boardRoute/hooks/useQuickCreate";
import { useSelectionUi } from "@/features/boards/boardRoute/hooks/useSelectionUi";
import {
  useBoardCanvasInteractions,
  useBoardViewport,
} from "@/features/boards/boardCanvas.hooks";
import type { ToolType } from "@/features/boards/boardRoute/tools";
import { useBoardMetadata } from "@/features/boards/boardRoute/hooks/useBoardMetadata";
import { useBoardRealtime } from "@/features/boards/boardRoute/hooks/useBoardRealtime";
import { useCanvasDimensions } from "@/features/boards/boardRoute/hooks/useCanvasDimensions";
import { useTextEditor } from "@/features/boards/boardRoute/hooks/useTextEditor";
import { BoardCommentsPanel, type CommentTarget } from "@/features/boards/comments/components/BoardCommentsPanel";

export const Route = createFileRoute("/board/$boardId")({
  component: BoardComponent,
});

const HEADER_HEIGHT = 56;
const UNDO_TIMEOUT_MS = 6000;
const NUDGE_PERSIST_MS = 200;

function BoardComponent() {
  const { boardId } = Route.useParams();
  const { user, isAuthenticated } = useAppStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userId = user?.id ?? "";
  const userEmail = user?.email ?? "";
  const [tool, setTool] = useState<ToolType>("select");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    boardRole,
    boardPermissions,
    isRoleLoading,
    handleRoleUpdate,
    handleRoleOverride,
  } = useBoardAccess({
    boardId,
    userId,
    userEmail,
    navigate,
    onEditRestriction: (nextPermissions) => {
      setTool((prev) => {
        if (prev === "comment" && nextPermissions.canComment) {
          return prev;
        }
        if (!nextPermissions.canEdit) {
          return nextPermissions.canComment ? "comment" : "select";
        }
        return prev;
      });
    },
  });

  const {
    boardTitle,
    boardDescription,
    canvasSettings,
    isPublic,
    isArchived,
    isDeleted,
    refreshBoardMetadata,
    applyBoardMetadata,
  } = useBoardMetadata(
    boardId,
    isAuthenticated,
    navigate,
  );
  const dimensions = useCanvasDimensions();
  const pageBackgroundColor = usePageBackgroundColor(containerRef);
  const canEdit = boardPermissions?.canEdit
    ?? (boardRole ? resolveRolePermissions(boardRole).canEdit : false);
  const canComment = boardPermissions?.canComment
    ?? (boardRole ? resolveRolePermissions(boardRole).canComment : false);
  const activeTool = canEdit
    ? tool
    : tool === "comment" && canComment
      ? "comment"
      : "select";

  useEffect(() => {
    if (!canComment && tool === "comment") {
      setTool("select");
    }
  }, [canComment, tool]);
  const {
    showPublicWorkspaceMessage,
    publicToastVisible,
  } = usePublicWorkspaceToast({
    boardId,
    isPublic,
  });
  const nudgeTimeoutsRef = useRef<Map<string, number>>(new Map());
  const selectionReplaceRef = useRef<((oldId: string, newId: string) => void) | null>(
    null,
  );
  const {
    archivedStatus,
    isRestoring,
    deletedStatus,
    isRestoringDeleted,
    handleRestoreBoard,
    handleRestoreDeletedBoard,
  } = useBoardRestoration({
    boardId,
    refreshBoardMetadata,
    t,
  });
  const stageHeight = dimensions.height - HEADER_HEIGHT;
  const {
    elements,
    cursors,
    selectionPresence,
    presenceUsers,
    queueState,
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
    canUndo,
    canRedo,
    lockedElementIds,
    syncStatus,
  } = useBoardRealtime({
    boardId,
    user,
    canEdit,
    onRoleUpdate: handleRoleUpdate,
    enabled: !isArchived && !isDeleted,
  });

  const {
    syncLabel,
    syncTone,
    cursorList,
    visiblePresence,
    extraPresenceCount,
  } = usePresenceUi({
    cursors,
    presenceUsers,
    userId,
    syncStatus,
    t,
  });

  const handleElementReplace = useCallback(
    (oldId: string, element: BoardElement) => {
      removeElement(oldId);
      upsertElement(element);
      selectionReplaceRef.current?.(oldId, element.id);
    },
    [removeElement, upsertElement],
  );

  const {
    persistElement,
    deleteElement,
    restoreElement,
    clearPendingDelete,
  } = useBoardElementMutations({
    boardId,
    onPersisted: (elementId, version, updatedAt) => {
      applyRemotePatch(elementId, {
        version,
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      }, "sync");
    },
    onReconciled: (element) => {
      applyRemotePatch(element.id, element);
    },
    onReplaced: handleElementReplace,
  });

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
      if (lockedElementIds.has(id)) return;
      updateElement(id, updater);
    },
    [canEdit, lockedElementIds, updateElement],
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
    elements,
    upsertElement: guardedUpsertElement,
    updateElement: guardedUpdateElement,
    persistElement,
    startHistoryEntry: guardedStartHistoryEntry,
    setEditingPresence,
  });

  const gridSize = canvasSettings.gridSize;
  const gridEnabled = canvasSettings.gridEnabled;
  const backgroundColor = pageBackgroundColor;
  const {
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
  } = useBoardCanvasInteractions({
    boardId,
    activeTool,
    canEdit,
    canComment,
    elements,
    gridEnabled,
    gridSize,
    snapToGrid: canvasSettings.snapToGrid,
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
    upsertElement: guardedUpsertElement,
    updateElement: guardedUpdateElement,
    removeElement,
    persistElement,
    getElementById,
    startHistoryEntry: guardedStartHistoryEntry,
    onCommentPin: (payload) => {
      if (!canComment) return;
      setCommentTarget({
        elementId: payload.elementId,
        position: payload.position,
      });
      setIsCommentsOpen(true);
    },
  });
  useEffect(() => {
    selectionReplaceRef.current = (oldId: string, newId: string) => {
      setSelectedElementIds((prev) =>
        prev.map((id) => (id === oldId ? newId : id)),
      );
    };
  }, [setSelectedElementIds]);
  const { gridLines, worldRect } = useBoardViewport({
    dimensions,
    stageHeight,
    stageScale,
    stagePosition,
    gridEnabled,
    gridSize,
  });
  const defaultCommentPosition = useMemo(() => {
    if (!Number.isFinite(worldRect.width) || !Number.isFinite(worldRect.height)) {
      return null;
    }
    return {
      x: worldRect.x + worldRect.width / 2,
      y: worldRect.y + worldRect.height / 2,
    };
  }, [worldRect.height, worldRect.width, worldRect.x, worldRect.y]);
  const {
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
  } = useSelectionUi({
    elements,
    renderElements,
    selectedElementIds,
    lockedElementIds,
    canEdit,
    activeTool,
    textEditorOpen: textEditor.isOpen,
    stageScale,
    stagePosition,
    stageHeight,
    canvasWidth: dimensions.width,
  });
  const { buildConnectorRoute } = useConnectorRouting();

  const {
    setQuickCreateHover,
    quickCreatePositions,
    quickCreateGhost,
    handleQuickCreate,
  } = useQuickCreate({
    boardId,
    canEdit,
    isPrimaryLocked,
    canShowQuickCreate,
    elements,
    renderElements,
    primarySelectedElement,
    selectionBounds,
    selectionScreenBounds,
    canvasWidth: dimensions.width,
    stageHeight,
    routeObstacles: ROUTE_OBSTACLES,
    buildConnectorRoute,
    persistElement,
    startHistoryEntry: guardedStartHistoryEntry,
    upsertElement: guardedUpsertElement,
    setSelectedElementIds,
  });

  const applySelectionStyle = useCallback(
    (patch: Partial<BoardElement["style"]>) => {
      if (editableSelectedElements.length === 0) return;
      guardedStartHistoryEntry();
      const updates: BoardElement[] = [];
      editableSelectedElements.forEach((element) => {
        guardedUpdateElement(element.id, (current) => {
          const next = {
            ...current,
            style: {
              ...current.style,
              ...patch,
            },
          };
          updates.push(next);
          return next;
        });
      });
      updates.forEach((element) => {
        persistElement(element);
      });
    },
    [
      editableSelectedElements,
      guardedStartHistoryEntry,
      guardedUpdateElement,
      persistElement,
    ],
  );

  const clearNudgeTimers = useCallback(() => {
    const timers = nudgeTimeoutsRef.current;
    timers.forEach((timerId) => window.clearTimeout(timerId));
    timers.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearNudgeTimers();
    };
  }, [clearNudgeTimers]);

  const {
    deleteDialogOpen,
    pendingDeleteElements,
    undoDeleteState,
    requestDeleteSelection,
    confirmDeleteSelection,
    handleUndoDelete,
    handleDeleteDialogOpenChange,
  } = useDeleteSelection({
    canEdit,
    textEditorOpen: textEditor.isOpen,
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
    undoTimeoutMs: UNDO_TIMEOUT_MS,
  });

  const scheduleNudgePersist = useCallback(
    (element: BoardElement) => {
      const timers = nudgeTimeoutsRef.current;
      const existing = timers.get(element.id);
      if (existing) {
        window.clearTimeout(existing);
      }
      const timerId = window.setTimeout(() => {
        timers.delete(element.id);
        persistElement(element);
      }, NUDGE_PERSIST_MS);
      timers.set(element.id, timerId);
    },
    [persistElement],
  );

  useBoardHotkeys({
    enabled: canEdit,
    textEditorOpen: textEditor.isOpen,
    deleteDialogOpen,
    editableSelectedElements,
    elements,
    gridEnabled,
    gridSize,
    snapToGrid: canvasSettings.snapToGrid,
    onDeleteSelection: requestDeleteSelection,
    startHistoryEntry: guardedStartHistoryEntry,
    updateElement,
    scheduleNudgePersist,
    onUndo: guardedUndo,
    onRedo: guardedRedo,
    onToolChange: setTool,
    onResetZoom: resetZoom,
  });

  const canDragElements = canEdit && activeTool === "select" && !textEditor.isOpen;

  const statusScreen = getBoardStatusScreen({
    isDeleted,
    isArchived,
    queueState,
    archivedStatus,
    deletedStatus,
    isRestoring,
    isRestoringDeleted,
    onRestoreBoard: handleRestoreBoard,
    onRestoreDeletedBoard: handleRestoreDeletedBoard,
    onBackToDashboard: () => navigate({ to: "/dashboard" }),
    onRetryQueue: () => window.location.reload(),
    t,
  });

  if (statusScreen) {
    return statusScreen;
  }

  return (
    <div
      ref={containerRef}
      className="relative w-screen h-screen overflow-hidden bg-neutral-900 flex flex-col"
    >
      <BoardDeleteDialog
        open={deleteDialogOpen}
        pendingCount={pendingDeleteElements.length}
        onOpenChange={handleDeleteDialogOpenChange}
        onConfirm={confirmDeleteSelection}
      />
      {/* Header */}
      <BoardHeader
        boardId={boardId}
        boardTitle={boardTitle}
        boardDescription={boardDescription}
        isPublic={isPublic}
        isArchived={isArchived}
        canEdit={canEdit}
        canComment={canComment}
        isRoleLoading={isRoleLoading}
        boardRole={boardRole}
        visiblePresence={visiblePresence}
        extraPresenceCount={extraPresenceCount}
        user={user}
        backLabel={t("org.backToDashboard")}
        readOnlyLabel={t("board.readOnly")}
        syncLabel={syncLabel}
        syncTone={syncTone}
        isCommentsOpen={isCommentsOpen}
        onToggleComments={() => setIsCommentsOpen((prev) => !prev)}
        onBack={() => navigate({ to: "/" })}
        onBoardUpdated={applyBoardMetadata}
        onRefresh={refreshBoardMetadata}
        onRoleOverride={handleRoleOverride}
      />

      {/* Canvas */}
      <BoardCanvasShell
        toolbarProps={{
          activeTool,
          canEdit,
          canComment,
          canUndo,
          canRedo,
          onToolChange: setTool,
          onUndo: guardedUndo,
          onRedo: guardedRedo,
          onResetZoom: resetZoom,
        }}
        selectionToolbarProps={{
          position: selectionToolbarPosition,
          visible: canShowSelectionToolbar,
          supportsFill,
          supportsStroke,
          fill: primarySelectedElement?.style.fill,
          stroke: primarySelectedElement?.style.stroke,
          strokeWidth: primarySelectedElement?.style.strokeWidth,
          onFillChange: (color) => applySelectionStyle({ fill: color }),
          onStrokeChange: (color) => applySelectionStyle({ stroke: color }),
          onStrokeWidthChange: (width) =>
            applySelectionStyle({ strokeWidth: width }),
        }}
        quickCreateProps={{
          positions: quickCreatePositions,
          visible: canShowQuickCreate,
          onCreate: handleQuickCreate,
          onHoverChange: setQuickCreateHover,
        }}
        textEditorProps={{
          isOpen: textEditor.isOpen,
          value: textEditor.value,
          screenPosition: textEditorScreenPosition,
          fontSize: textEditor.fontSize,
          color: textEditor.color,
          backgroundColor: textEditor.backgroundColor,
          editorWidth: textEditor.editorWidth,
          editorHeight: textEditor.editorHeight,
          stageScale,
          textAreaRef,
          onChange: handleTextChange,
          onBlur: () => commitTextEditor(true),
          onKeyDown: handleTextKeyDown,
        }}
        publicToastProps={{
          isEnabled: showPublicWorkspaceMessage,
          isVisible: publicToastVisible,
          message: "This board is public in this workspace.",
        }}
        undoDeleteToastProps={undoDeleteState ? {
          label:
            undoDeleteState.elements.length > 1
              ? "Elements deleted."
              : "Element deleted.",
          actionLabel: undoDeleteState.isRestoring ? "Restoring..." : "Undo",
          isRestoring: undoDeleteState.isRestoring,
          onUndo: handleUndoDelete,
        } : null}
        canvasProps={{
          stageRef,
          width: dimensions.width,
          height: stageHeight,
          stageScale,
          stagePosition,
          onMouseDown: handleMouseDown,
          onMouseMove: handleMouseMove,
          onMouseUp: handleMouseUp,
          onMouseLeave: clearCursor,
          onWheel: handleWheel,
          worldRect,
          backgroundColor,
          gridLines,
          snapGuides,
          elements: renderElements,
          ghostElement: quickCreateGhost,
          selectedElementIds,
          selectionPresence,
          cursorList,
          isDragEnabled: canDragElements,
          localOverrideIds,
          lockedElementIds,
          onElementDragMove: handleElementDragMove,
          onElementDragEnd: handleElementDragEnd,
          onElementTransform: handleElementTransform,
          onElementTransformEnd: handleElementTransformEnd,
          onDrawingDragEnd: handleDrawingDragEnd,
          onOpenTextEditor: openTextEditor,
        }}
      />

      <BoardCommentsPanel
        boardId={boardId}
        isOpen={isCommentsOpen}
        canComment={canComment}
        defaultBoardPosition={defaultCommentPosition}
        target={commentTarget}
        onTargetChange={setCommentTarget}
        onClose={() => {
          setIsCommentsOpen(false);
          setCommentTarget(null);
        }}
      />
    </div>
  );
}
