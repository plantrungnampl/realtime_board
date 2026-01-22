import type { BoardElement } from "@/types/board";

export type NavigateFn = (options: { to: string }) => void;

export type UpdateElementFn = (
  id: string,
  updater: (current: BoardElement) => BoardElement | null,
) => void;

export type TextEditorState = {
  isOpen: boolean;
  x: number;
  y: number;
  value: string;
  elementId: string | null;
  fontSize: number;
  color: string;
  elementType: "Text" | "StickyNote";
  backgroundColor?: string;
  editorWidth?: number;
  editorHeight?: number;
};
