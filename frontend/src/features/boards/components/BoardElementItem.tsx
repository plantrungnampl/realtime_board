import { memo, useCallback, useMemo, useRef } from "react";
import type { Container as PixiContainer, FederatedPointerEvent, Graphics } from "pixi.js";
import type { BoardElement } from "@/types/board";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import {
  coerceNumber,
  drawPolyline,
  getRectBounds,
  isValidDrawingPoints,
  parseColor,
  resolveConnectorPoints,
  DOUBLE_TAP_THRESHOLD,
  drawRectShape,
  drawCircleShape,
  drawRoundedRectShape,
} from "@/features/boards/boardCanvas/renderUtils";

const DEG_TO_RAD = Math.PI / 180;

export type TextEditorPayload = {
  x: number;
  y: number;
  value: string;
  elementId: string;
  fontSize: number;
  color: string;
  elementType: "Text" | "StickyNote";
  backgroundColor?: string;
  editorWidth?: number;
  editorHeight?: number;
};

type BoardElementItemProps = {
  element: BoardElement;
  isInteractive: boolean;
  onPointerDown: (event: FederatedPointerEvent, element: BoardElement) => void;
  onOpenTextEditor: (payload: TextEditorPayload) => void;
  registerRef: (id: string, node: PixiContainer | null) => void;
};

type ElementContainerProps = {
  element: BoardElement;
  isInteractive: boolean;
  registerRef: (id: string, node: PixiContainer | null) => void;
  onPointerDown: (event: FederatedPointerEvent, element: BoardElement) => void;
  x?: number;
  y?: number;
  onPointerTap?: (event: FederatedPointerEvent) => void;
  children: React.ReactNode;
};

function ElementContainer({
  element,
  isInteractive,
  registerRef,
  onPointerDown,
  x,
  y,
  onPointerTap,
  children,
}: ElementContainerProps) {
  return (
    <pixiContainer
      ref={(node: PixiContainer | null) => registerRef(element.id, node)}
      x={x}
      y={y}
      rotation={(element.rotation ?? 0) * DEG_TO_RAD}
      eventMode={isInteractive ? "static" : "passive"}
      onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
      onPointerTap={onPointerTap}
    >
      {children}
    </pixiContainer>
  );
}

type BuildTextEditorPayloadArgs = {
  element: BoardElement;
  x: number;
  y: number;
  content: string;
  fontSize: number;
  color: string;
  elementType: "Text" | "StickyNote";
  backgroundColor?: string;
  editorWidth?: number;
  editorHeight?: number;
};

function buildTextEditorPayload({
  element,
  x,
  y,
  content,
  fontSize,
  color,
  elementType,
  backgroundColor,
  editorWidth,
  editorHeight,
}: BuildTextEditorPayloadArgs): TextEditorPayload {
  return {
    x,
    y,
    value: content,
    elementId: element.id,
    fontSize,
    color,
    elementType,
    backgroundColor,
    editorWidth,
    editorHeight,
  };
}

function useDoubleTap() {
  const lastTapRef = useRef<number>(0);
  return useCallback((event: FederatedPointerEvent, callback: () => void) => {
    const now = event.originalEvent.timeStamp ?? performance.now();
    const last = lastTapRef.current;
    lastTapRef.current = now;
    if (now - last < DOUBLE_TAP_THRESHOLD) {
      callback();
    }
  }, []);
}

const BoardRectangleItem = ({ element, isInteractive, onPointerDown, registerRef }: BoardElementItemProps) => {
  const rect = getRectBounds(element);
  const draw = useCallback(
    (g: Graphics) => drawRectShape(g, element, rect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [element.style, element.properties, rect.width, rect.height],
  );
  return (
    <ElementContainer
      element={element}
      isInteractive={isInteractive}
      registerRef={registerRef}
      onPointerDown={onPointerDown}
      x={rect.x}
      y={rect.y}
    >
      <pixiGraphics draw={draw} />
    </ElementContainer>
  );
};

const BoardCircleItem = ({ element, isInteractive, onPointerDown, registerRef }: BoardElementItemProps) => {
  const radius = Math.hypot(element.width || 0, element.height || 0);
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  const draw = useCallback(
    (g: Graphics) => drawCircleShape(g, element, radius),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [element.style, element.properties, radius],
  );
  return (
    <ElementContainer
      element={element}
      isInteractive={isInteractive}
      registerRef={registerRef}
      onPointerDown={onPointerDown}
      x={positionX}
      y={positionY}
    >
      <pixiGraphics draw={draw} />
    </ElementContainer>
  );
};

const BoardDrawingItem = ({ element, isInteractive, onPointerDown, registerRef }: BoardElementItemProps) => {
  const points = (element as import('../types').DrawingElement).properties.points;
  const isValid = Array.isArray(points) && isValidDrawingPoints(points);
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);

  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      if (isValid && points) {
        drawPolyline(
          graphics,
          points,
          element.style.strokeWidth ?? 2,
          parseColor(element.style.stroke, 0xffffff),
        );
      }
    },
    [element.style, points, isValid],
  );

  if (!isValid) return null;

  return (
    <ElementContainer
      element={element}
      isInteractive={isInteractive}
      registerRef={registerRef}
      onPointerDown={onPointerDown}
      x={positionX}
      y={positionY}
    >
      <pixiGraphics draw={draw} />
    </ElementContainer>
  );
};

const BoardTextItem = ({ element, isInteractive, onPointerDown, onOpenTextEditor, registerRef }: BoardElementItemProps) => {
  const positionX = coerceNumber(element.position_x, 0);
  const positionY = coerceNumber(element.position_y, 0);
  const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
  const content = (element as import('../types').TextElement).properties?.content ?? "";
  const color = element.style.textColor ?? DEFAULT_TEXT_STYLE.fill ?? "#1F2937";
  const style = useMemo(
    () => ({
      fontSize,
      fill: color,
    }),
    [fontSize, color],
  );

  const handleTap = useDoubleTap();

  const onTap = useCallback(
    (event: FederatedPointerEvent) =>
      handleTap(event, () => {
        onOpenTextEditor(
          buildTextEditorPayload({
            element,
            x: positionX,
            y: positionY,
            content,
            fontSize,
            color,
            elementType: "Text",
          }),
        );
      }),
    [handleTap, onOpenTextEditor, element, positionX, positionY, content, fontSize, color],
  );

  return (
    <ElementContainer
      element={element}
      isInteractive={isInteractive}
      registerRef={registerRef}
      onPointerDown={onPointerDown}
      x={positionX}
      y={positionY}
      onPointerTap={onTap}
    >
      <pixiText text={content} style={style} />
    </ElementContainer>
  );
};

const BoardStickyNoteItem = ({ element, isInteractive, onPointerDown, onOpenTextEditor, registerRef }: BoardElementItemProps) => {
  const rect = getRectBounds(element);
  const fontSize = element.style.fontSize ?? 16;
  const content = (element as import('../types').StickyNoteElement).properties?.content ?? "";
  const padding = 12;
  const color = element.style.textColor ?? "#1F2937";
  const style = useMemo(
    () => ({
      fontSize,
      fill: color,
      wordWrap: true,
      wordWrapWidth: Math.max(0, rect.width - padding * 2),
    }),
    [fontSize, color, rect.width],
  );
  const draw = useCallback(
    (g: Graphics) => drawRoundedRectShape(g, element, rect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [element.style, element.properties, rect.width, rect.height],
  );

  const handleTap = useDoubleTap();

  const onTap = useCallback(
    (event: FederatedPointerEvent) =>
      handleTap(event, () => {
        onOpenTextEditor(
          buildTextEditorPayload({
            element,
            x: rect.x + padding,
            y: rect.y + padding,
            content,
            fontSize,
            color,
            elementType: "StickyNote",
            backgroundColor: element.style.fill,
            editorWidth: Math.max(0, rect.width - padding * 2),
            editorHeight: Math.max(0, rect.height - padding * 2),
          }),
        );
      }),
    [handleTap, onOpenTextEditor, element, rect.x, rect.y, rect.width, rect.height, content, fontSize, color],
  );

  return (
    <ElementContainer
      element={element}
      isInteractive={isInteractive}
      registerRef={registerRef}
      onPointerDown={onPointerDown}
      x={rect.x}
      y={rect.y}
      onPointerTap={onTap}
    >
      <pixiGraphics draw={draw} />
      <pixiText text={content} x={padding} y={padding} style={style} />
    </ElementContainer>
  );
};

const BoardConnectorItem = ({ element, isInteractive, onPointerDown, registerRef }: BoardElementItemProps) => {
  const points = resolveConnectorPoints(element);
  const isValid = points && points.length >= 4;

  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      if (isValid && points) {
        drawPolyline(
          graphics,
          points,
          element.style.strokeWidth ?? 2,
          parseColor(element.style.stroke, 0xffffff),
        );
      }
    },
    [element.style, points, isValid],
  );

  if (!isValid) return null;

  return (
    <ElementContainer
      element={element}
      isInteractive={isInteractive}
      registerRef={registerRef}
      onPointerDown={onPointerDown}
    >
      <pixiGraphics draw={draw} />
    </ElementContainer>
  );
};

export const BoardElementItem = memo(function BoardElementItem(props: BoardElementItemProps) {
  const { element } = props;
  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      return <BoardRectangleItem {...props} />;
    }
    if (element.properties.shapeType === "circle") {
      return <BoardCircleItem {...props} />;
    }
  }
  if (element.element_type === "Drawing") {
    return <BoardDrawingItem {...props} />;
  }
  if (element.element_type === "Text") {
    return <BoardTextItem {...props} />;
  }
  if (element.element_type === "StickyNote") {
    return <BoardStickyNoteItem {...props} />;
  }
  if (element.element_type === "Connector") {
    return <BoardConnectorItem {...props} />;
  }
  return null;
});
