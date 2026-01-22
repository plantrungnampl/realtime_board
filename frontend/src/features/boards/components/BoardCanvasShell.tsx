import type { ComponentProps } from "react";

import { BoardCanvasStage } from "@/features/boards/components/BoardCanvasStage";
import { BoardPublicToast } from "@/features/boards/components/BoardPublicToast";
import { BoardQuickCreateHandles } from "@/features/boards/components/BoardQuickCreateHandles";
import { BoardSelectionToolbar } from "@/features/boards/components/BoardSelectionToolbar";
import { BoardTextEditorOverlay } from "@/features/boards/components/BoardTextEditorOverlay";
import { BoardToolbar } from "@/features/boards/components/BoardToolbar";
import { UndoDeleteToast } from "@/features/boards/components/UndoDeleteToast";

type BoardCanvasShellProps = {
  toolbarProps: ComponentProps<typeof BoardToolbar>;
  selectionToolbarProps: ComponentProps<typeof BoardSelectionToolbar>;
  quickCreateProps: ComponentProps<typeof BoardQuickCreateHandles>;
  textEditorProps: ComponentProps<typeof BoardTextEditorOverlay>;
  publicToastProps: ComponentProps<typeof BoardPublicToast>;
  undoDeleteToastProps?: ComponentProps<typeof UndoDeleteToast> | null;
  canvasProps: ComponentProps<typeof BoardCanvasStage>;
};

export function BoardCanvasShell({
  toolbarProps,
  selectionToolbarProps,
  quickCreateProps,
  textEditorProps,
  publicToastProps,
  undoDeleteToastProps,
  canvasProps,
}: BoardCanvasShellProps) {
  return (
    <div className="flex-1 relative cursor-crosshair">
      <BoardToolbar {...toolbarProps} />
      <BoardSelectionToolbar {...selectionToolbarProps} />
      <BoardQuickCreateHandles {...quickCreateProps} />
      <BoardTextEditorOverlay {...textEditorProps} />
      <BoardPublicToast {...publicToastProps} />
      {undoDeleteToastProps && <UndoDeleteToast {...undoDeleteToastProps} />}
      <BoardCanvasStage {...canvasProps} />
    </div>
  );
}
