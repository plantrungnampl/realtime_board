import { Undo2, Redo2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOLS, type ToolType } from "@/features/boards/boardRoute/tools";

type BoardToolbarProps = {
  activeTool: ToolType;
  canEdit: boolean;
  canComment: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: ToolType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onResetZoom: () => void;
};

type TooltipLabelProps = {
  label: string;
};

const TooltipLabel = ({ label }: TooltipLabelProps) => (
  <span
    aria-hidden="true"
    className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900/95 px-2 py-1 text-xs text-neutral-100 opacity-0 shadow-md transition-all group-focus-visible:translate-x-0 group-focus-visible:opacity-100 group-hover:translate-x-0 group-hover:opacity-100"
  >
    {label}
  </span>
);

export function BoardToolbar({
  activeTool,
  canEdit,
  canComment,
  canUndo,
  canRedo,
  onToolChange,
  onUndo,
  onRedo,
  onResetZoom,
}: BoardToolbarProps) {
  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60";

  return (
    <div className="absolute left-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-neutral-800 bg-neutral-900/80 p-2 shadow-lg backdrop-blur">
      {TOOLS.map((tool) => {
        const isCommentTool = tool.id === "comment";
        const isDisabled = isCommentTool
          ? !canComment
          : !canEdit && tool.id !== "select";
        const shortcut = "shortcut" in tool ? tool.shortcut : undefined;
        const label = shortcut ? `${tool.label} (${shortcut})` : tool.label;

        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onToolChange(tool.id)}
            disabled={isDisabled}
            aria-label={label}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all",
              activeTool === tool.id && !isDisabled
                ? "bg-yellow-500 text-neutral-900 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800",
              isDisabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
              focusRing,
            )}
          >
            <tool.icon className="h-5 w-5" />
            <TooltipLabel label={label} />
          </button>
        );
      })}
      <div className="my-1 h-px w-full bg-neutral-800" />
      <button
        type="button"
        onClick={onUndo}
        disabled={!canEdit || !canUndo}
        aria-label="Undo (Ctrl+Z)"
        className={cn(
          "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
          canEdit && canUndo
            ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            : "text-neutral-700 cursor-not-allowed",
          focusRing,
        )}
      >
        <Undo2 className="h-5 w-5" />
        <TooltipLabel label="Undo (Ctrl+Z)" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canEdit || !canRedo}
        aria-label="Redo (Ctrl+Y)"
        className={cn(
          "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
          canEdit && canRedo
            ? "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
            : "text-neutral-700 cursor-not-allowed",
          focusRing,
        )}
      >
        <Redo2 className="h-5 w-5" />
        <TooltipLabel label="Redo (Ctrl+Y)" />
      </button>
      <button
        type="button"
        onClick={onResetZoom}
        aria-label="Reset zoom"
        className={cn(
          "group relative flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200",
          focusRing,
        )}
      >
        <RotateCcw className="h-5 w-5" />
        <TooltipLabel label="Reset zoom" />
      </button>
    </div>
  );
}
