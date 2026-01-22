import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardElement, SelectionEditMode } from "@/types/board";
import {
  DEFAULT_TEXT_STYLE,
  createTextElement,
  getNextZIndex,
} from "@/features/boards/boardRoute/elements";
import type {
  TextEditorState,
  UpdateElementFn,
} from "@/features/boards/boardRoute/types";

const createDefaultTextEditor = (): TextEditorState => ({
  isOpen: false,
  x: 0,
  y: 0,
  value: "",
  elementId: null,
  fontSize: DEFAULT_TEXT_STYLE.fontSize,
  color: DEFAULT_TEXT_STYLE.fill,
  elementType: "Text",
  backgroundColor: undefined,
  editorWidth: undefined,
  editorHeight: undefined,
});

const normalizeTextValue = (value: string) => value.replace(/\r\n/g, "\n");

export function useTextEditor({
  boardId,
  elements,
  upsertElement,
  updateElement,
  persistElement,
  startHistoryEntry,
  setEditingPresence,
}: {
  boardId: string;
  elements: BoardElement[];
  upsertElement: (element: BoardElement) => void;
  updateElement: UpdateElementFn;
  persistElement: (element: BoardElement) => void;
  startHistoryEntry: () => void;
  setEditingPresence: (
    editing: { element_id: string; mode: SelectionEditMode } | null,
  ) => void;
}) {
  const [textEditor, setTextEditor] = useState(createDefaultTextEditor);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressNextPointerRef = useRef(false);

  useEffect(() => {
    if (!textEditor.isOpen) return;
    const raf = requestAnimationFrame(() => {
      textAreaRef.current?.focus();
      textAreaRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [textEditor.isOpen]);

  useEffect(() => {
    suppressNextPointerRef.current = false;
    queueMicrotask(() => {
      setTextEditor(createDefaultTextEditor());
    });
  }, [boardId]);

  const openTextEditor = useCallback(
    (next: Omit<TextEditorState, "isOpen">) => {
      if (next.elementId) {
        setEditingPresence({ element_id: next.elementId, mode: "text" });
      }
      setTextEditor({ ...next, isOpen: true });
    },
    [setEditingPresence],
  );

  const closeTextEditor = useCallback(
    (suppressNextPointer = false) => {
      if (suppressNextPointer) {
        suppressNextPointerRef.current = true;
      }
      setEditingPresence(null);
      setTextEditor(createDefaultTextEditor());
    },
    [setEditingPresence],
  );

  const commitTextEditor = useCallback(
    (suppressNextPointer = false) => {
      const content = normalizeTextValue(textEditor.value);

      if (textEditor.elementId) {
        startHistoryEntry();
        let nextElement: BoardElement | null = null;
        updateElement(textEditor.elementId, (existing) => {
          if (existing.element_type === "Text") {
            nextElement = {
              ...existing,
              style: {
                ...existing.style,
                fontSize: textEditor.fontSize,
                fill: textEditor.color,
              },
              properties: {
                ...existing.properties,
                content,
              },
            };
            return nextElement;
          }
          if (existing.element_type === "StickyNote") {
            nextElement = {
              ...existing,
              style: {
                ...existing.style,
                fontSize: textEditor.fontSize,
                textColor: textEditor.color,
              },
              properties: {
                ...existing.properties,
                content,
              },
            };
            return nextElement;
          }
          return null;
        });
        if (nextElement) {
          persistElement(nextElement);
        }
        closeTextEditor(suppressNextPointer);
        return;
      }

      if (content.trim() === "") {
        closeTextEditor(suppressNextPointer);
        return;
      }

      if (textEditor.elementType !== "Text") {
        closeTextEditor(suppressNextPointer);
        return;
      }

      startHistoryEntry();
      const element = createTextElement(
        boardId,
        { x: textEditor.x, y: textEditor.y },
        content,
        {
          fontSize: textEditor.fontSize,
          color: textEditor.color,
        },
        getNextZIndex(elements),
      );
      upsertElement(element);
      persistElement(element);
      closeTextEditor(suppressNextPointer);
    },
    [
      boardId,
      closeTextEditor,
      elements,
      persistElement,
      startHistoryEntry,
      textEditor,
      updateElement,
      upsertElement,
    ],
  );

  return {
    textEditor,
    setTextEditor,
    openTextEditor,
    closeTextEditor,
    commitTextEditor,
    textAreaRef,
    suppressNextPointerRef,
  };
}
