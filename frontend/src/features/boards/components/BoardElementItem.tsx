import { memo, useCallback, useMemo, useRef } from "react";
import type { Container as PixiContainer, FederatedPointerEvent, Graphics } from "pixi.js";
import type { BoardElement, ConnectorElement, DrawingElement, ShapeElement, StickyNoteElement, TextElement } from "@/types/board";
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
  const shapeElement = element as ShapeElement;
  const rect = getRectBounds(shapeElement);
  const draw = useCallback(
    (g: Graphics) => drawRectShape(g, shapeElement, rect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapeElement.style, shapeElement.properties, rect.width, rect.height],
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
  const shapeElement = element as ShapeElement;
  const radius = Math.hypot(shapeElement.width || 0, shapeElement.height || 0);
  const positionX = coerceNumber(shapeElement.position_x, 0);
  const positionY = coerceNumber(shapeElement.position_y, 0);
  const draw = useCallback(
    (g: Graphics) => drawCircleShape(g, shapeElement, radius),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapeElement.style, shapeElement.properties, radius],
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
  const drawingElement = element as DrawingElement;
  const points = drawingElement.properties.points;
  const isValid = Array.isArray(points) && isValidDrawingPoints(points);
  const positionX = coerceNumber(drawingElement.position_x, 0);
  const positionY = coerceNumber(drawingElement.position_y, 0);

  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      if (isValid && points) {
        drawPolyline(
          graphics,
          points,
          drawingElement.style.strokeWidth ?? 2,
          parseColor(drawingElement.style.stroke, 0xffffff),
        );
      }
    },
    [drawingElement.style, points, isValid],
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
  const textElement = element as TextElement;
  const positionX = coerceNumber(textElement.position_x, 0);
  const positionY = coerceNumber(textElement.position_y, 0);
  const fontSize = textElement.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
  const content = textElement.properties.content;
  const color = textElement.style.textColor ?? DEFAULT_TEXT_STYLE.fill ?? "#1F2937";
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
            element: textElement,
            x: positionX,
            y: positionY,
            content,
            fontSize,
            color,
            elementType: "Text",
          }),
        );
      }),
    [handleTap, onOpenTextEditor, textElement, positionX, positionY, content, fontSize, color],
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
  const stickyElement = element as StickyNoteElement;
  const rect = getRectBounds(stickyElement);
  const fontSize = stickyElement.style.fontSize ?? 16;
  const content = stickyElement.properties.content;
  const padding = 12;
  const color = stickyElement.style.textColor ?? "#1F2937";
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
    (g: Graphics) => drawRoundedRectShape(g, stickyElement, rect),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stickyElement.style, stickyElement.properties, rect.width, rect.height],
  );

  const handleTap = useDoubleTap();

  const onTap = useCallback(
    (event: FederatedPointerEvent) =>
      handleTap(event, () => {
        onOpenTextEditor(
          buildTextEditorPayload({
            element: stickyElement,
            x: rect.x + padding,
            y: rect.y + padding,
            content,
            fontSize,
            color,
            elementType: "StickyNote",
            backgroundColor: stickyElement.style.fill,
            editorWidth: Math.max(0, rect.width - padding * 2),
            editorHeight: Math.max(0, rect.height - padding * 2),
          }),
        );
      }),
    [handleTap, onOpenTextEditor, stickyElement, rect.x, rect.y, rect.width, rect.height, content, fontSize, color],
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
  const connectorElement = element as ConnectorElement;
  const points = resolveConnectorPoints(connectorElement);
  const isValid = points && points.length >= 4;

  const draw = useCallback(
    (graphics: Graphics) => {
      graphics.clear();
      if (isValid && points) {
        drawPolyline(
          graphics,
          points,
          connectorElement.style.strokeWidth ?? 2,
          parseColor(connectorElement.style.stroke, 0xffffff),
        );
      }
    },
    [connectorElement.style, points, isValid],
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
