import { memo, useRef } from "react";
import type { Container as PixiContainer, FederatedPointerEvent } from "pixi.js";
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

export const BoardElementItem = memo(function BoardElementItem({
  element,
  isInteractive,
  onPointerDown,
  onOpenTextEditor,
  registerRef,
}: BoardElementItemProps) {
  const lastTapRef = useRef<number>(0);

  const handleTap = (event: FederatedPointerEvent, callback: () => void) => {
    const now = event.originalEvent.timeStamp ?? performance.now();
    const last = lastTapRef.current;
    lastTapRef.current = now;
    if (now - last < DOUBLE_TAP_THRESHOLD) {
      callback();
    }
  };

  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      const rect = getRectBounds(element);
      return (
        <ElementContainer
          element={element}
          isInteractive={isInteractive}
          registerRef={registerRef}
          onPointerDown={onPointerDown}
          x={rect.x}
          y={rect.y}
        >
          <pixiGraphics draw={(g) => drawRectShape(g, element, rect)} />
        </ElementContainer>
      );
    }
    if (element.properties.shapeType === "circle") {
      const radius = Math.hypot(element.width || 0, element.height || 0);
      const positionX = coerceNumber(element.position_x, 0);
      const positionY = coerceNumber(element.position_y, 0);
      return (
        <ElementContainer
          element={element}
          isInteractive={isInteractive}
          registerRef={registerRef}
          onPointerDown={onPointerDown}
          x={positionX}
          y={positionY}
        >
          <pixiGraphics draw={(g) => drawCircleShape(g, element, radius)} />
        </ElementContainer>
      );
    }
  }

  if (element.element_type === "Drawing") {
    const points = element.properties.points;
    if (!Array.isArray(points) || !isValidDrawingPoints(points)) return null;
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    return (
      <ElementContainer
        element={element}
        isInteractive={isInteractive}
        registerRef={registerRef}
        onPointerDown={onPointerDown}
        x={positionX}
        y={positionY}
      >
        <pixiGraphics
          draw={(graphics) => {
            graphics.clear();
            drawPolyline(
              graphics,
              points,
              element.style.strokeWidth ?? 2,
              parseColor(element.style.stroke, 0xffffff),
            );
          }}
        />
      </ElementContainer>
    );
  }

  if (element.element_type === "Text") {
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
    const content = element.properties?.content ?? "";
    const color = element.style.textColor ?? DEFAULT_TEXT_STYLE.fill ?? "#1F2937";

    return (
      <ElementContainer
        element={element}
        isInteractive={isInteractive}
        registerRef={registerRef}
        onPointerDown={onPointerDown}
        x={positionX}
        y={positionY}
        onPointerTap={(event) =>
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
          })
        }
      >
        <pixiText
          text={content}
          style={{
            fontSize,
            fill: color,
          }}
        />
      </ElementContainer>
    );
  }

  if (element.element_type === "StickyNote") {
    const rect = getRectBounds(element);
    const fontSize = element.style.fontSize ?? 16;
    const content = element.properties?.content ?? "";
    const padding = 12;
    const color = element.style.textColor ?? "#1F2937";

    return (
      <ElementContainer
        element={element}
        isInteractive={isInteractive}
        registerRef={registerRef}
        onPointerDown={onPointerDown}
        x={rect.x}
        y={rect.y}
        onPointerTap={(event) =>
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
          })
        }
      >
        <pixiGraphics draw={(g) => drawRoundedRectShape(g, element, rect)} />
        <pixiText
          text={content}
          x={padding}
          y={padding}
          style={{
            fontSize,
            fill: color,
            wordWrap: true,
            wordWrapWidth: Math.max(0, rect.width - padding * 2),
          }}
        />
      </ElementContainer>
    );
  }

  if (element.element_type === "Connector") {
    const points = resolveConnectorPoints(element);
    if (!points || points.length < 4) return null;
    return (
      <ElementContainer
        element={element}
        isInteractive={isInteractive}
        registerRef={registerRef}
        onPointerDown={onPointerDown}
      >
        <pixiGraphics
          draw={(graphics) => {
            graphics.clear();
            drawPolyline(
              graphics,
              points,
              element.style.strokeWidth ?? 2,
              parseColor(element.style.stroke, 0xffffff),
            );
          }}
        />
      </ElementContainer>
    );
  }

  return null;
});
