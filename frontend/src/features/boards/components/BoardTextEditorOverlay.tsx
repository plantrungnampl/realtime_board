import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { cn } from "@/lib/utils";

type BoardTextEditorOverlayProps = {
  isOpen: boolean;
  value: string;
  screenPosition: { x: number; y: number };
  fontSize: number;
  color: string;
  backgroundColor?: string;
  editorWidth?: number;
  editorHeight?: number;
  stageScale: number;
  textAreaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

export function BoardTextEditorOverlay({
  isOpen,
  value,
  screenPosition,
  fontSize,
  color,
  backgroundColor,
  editorWidth,
  editorHeight,
  stageScale,
  textAreaRef,
  onChange,
  onBlur,
  onKeyDown,
}: BoardTextEditorOverlayProps) {
  if (!isOpen) return null;

  const scaledWidth =
    typeof editorWidth === "number" ? Math.max(1, editorWidth * stageScale) : undefined;
  const scaledHeight =
    typeof editorHeight === "number" ? Math.max(1, editorHeight * stageScale) : undefined;
  const usesFixedSize = typeof scaledWidth === "number" || typeof scaledHeight === "number";

  return (
    <textarea
      ref={textAreaRef}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      rows={1}
      spellCheck={false}
      className={cn(
        "absolute z-20 resize-none overflow-hidden border border-neutral-700 rounded-md shadow-lg",
        usesFixedSize ? "min-w-0 max-w-none p-0" : "min-w-[120px] max-w-[420px] px-2 py-1",
      )}
      style={{
        top: screenPosition.y,
        left: screenPosition.x,
        fontSize: fontSize * stageScale,
        color,
        backgroundColor: backgroundColor ?? "rgba(17, 24, 39, 0.9)",
        width: scaledWidth,
        height: scaledHeight,
      }}
    />
  );
}
