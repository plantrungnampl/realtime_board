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
  resolveFillStyle,
  setFillStyle,
  setStrokeStyle,
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
    if (now - last < 350) {
      callback();
    }
  };

  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      const rect = getRectBounds(element);
      return (
        <pixiContainer
          ref={(node: PixiContainer | null) => registerRef(element.id, node)}
          x={rect.x}
          y={rect.y}
          rotation={(element.rotation ?? 0) * DEG_TO_RAD}
          eventMode={isInteractive ? "static" : "passive"}
          onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        >
          <pixiGraphics
            draw={(graphics) => {
              graphics.clear();
              const stroke = parseColor(element.style.stroke, 0xffffff);
              const fill = resolveFillStyle(element.style.fill, 0x000000);
              const strokeWidth = element.style.strokeWidth ?? 1;
              setStrokeStyle(graphics, strokeWidth, stroke);
              graphics.rect(0, 0, rect.width, rect.height);
              setFillStyle(graphics, fill.color, fill.alpha);
              graphics.fill();
              graphics.stroke();
            }}
          />
        </pixiContainer>
      );
    }
    if (element.properties.shapeType === "circle") {
      const radius = Math.hypot(element.width || 0, element.height || 0);
      const positionX = coerceNumber(element.position_x, 0);
      const positionY = coerceNumber(element.position_y, 0);
      return (
        <pixiContainer
          ref={(node: PixiContainer | null) => registerRef(element.id, node)}
          x={positionX}
          y={positionY}
          rotation={(element.rotation ?? 0) * DEG_TO_RAD}
          eventMode={isInteractive ? "static" : "passive"}
          onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        >
          <pixiGraphics
            draw={(graphics) => {
              graphics.clear();
              const stroke = parseColor(element.style.stroke, 0xffffff);
              const fill = resolveFillStyle(element.style.fill, 0x000000);
              const strokeWidth = element.style.strokeWidth ?? 1;
              setStrokeStyle(graphics, strokeWidth, stroke);
              graphics.circle(0, 0, radius);
              setFillStyle(graphics, fill.color, fill.alpha);
              graphics.fill();
              graphics.stroke();
            }}
          />
        </pixiContainer>
      );
    }
  }

  if (element.element_type === "Drawing") {
    const points = element.properties.points;
    if (!Array.isArray(points) || !isValidDrawingPoints(points)) return null;
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    return (
      <pixiContainer
        ref={(node: PixiContainer | null) => registerRef(element.id, node)}
        x={positionX}
        y={positionY}
        rotation={(element.rotation ?? 0) * DEG_TO_RAD}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
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
      </pixiContainer>
    );
  }

  if (element.element_type === "Text") {
    const positionX = coerceNumber(element.position_x, 0);
    const positionY = coerceNumber(element.position_y, 0);
    const fontSize = element.style.fontSize ?? DEFAULT_TEXT_STYLE.fontSize ?? 16;
    const content = element.properties?.content ?? "";

    return (
      <pixiContainer
        ref={(node: PixiContainer | null) => registerRef(element.id, node)}
        x={positionX}
        y={positionY}
        rotation={(element.rotation ?? 0) * DEG_TO_RAD}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        onPointerTap={(event: FederatedPointerEvent) => {
          handleTap(event, () => {
            onOpenTextEditor({
              x: positionX,
              y: positionY,
              value: content,
              elementId: element.id,
              fontSize,
              color: element.style.textColor ?? DEFAULT_TEXT_STYLE.fill ?? "#1F2937",
              elementType: "Text",
            });
          });
        }}
      >
        <pixiText
          text={content}
          style={{
            fontSize,
            fill: element.style.textColor ?? DEFAULT_TEXT_STYLE.fill ?? "#1F2937",
          }}
        />
      </pixiContainer>
    );
  }

  if (element.element_type === "StickyNote") {
    const rect = getRectBounds(element);
    const fontSize = element.style.fontSize ?? 16;
    const content = element.properties?.content ?? "";
    const padding = 12;
    return (
      <pixiContainer
        ref={(node: PixiContainer | null) => registerRef(element.id, node)}
        x={rect.x}
        y={rect.y}
        rotation={(element.rotation ?? 0) * DEG_TO_RAD}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        onPointerTap={(event: FederatedPointerEvent) => {
          handleTap(event, () => {
            onOpenTextEditor({
              x: rect.x + padding,
              y: rect.y + padding,
              value: content,
              elementId: element.id,
              fontSize,
              color: element.style.textColor ?? "#1F2937",
              elementType: "StickyNote",
              backgroundColor: element.style.fill,
              editorWidth: Math.max(0, rect.width - padding * 2),
              editorHeight: Math.max(0, rect.height - padding * 2),
            });
          });
        }}
      >
        <pixiGraphics
          draw={(graphics) => {
            graphics.clear();
            const stroke = parseColor(element.style.stroke, 0xffffff);
            const fill = resolveFillStyle(element.style.fill, 0xfff9c2);
            const strokeWidth = element.style.strokeWidth ?? 1;
            setStrokeStyle(graphics, strokeWidth, stroke);
            graphics.roundRect(0, 0, rect.width, rect.height, element.style.cornerRadius ?? 12);
            setFillStyle(graphics, fill.color, fill.alpha);
            graphics.fill();
            graphics.stroke();
          }}
        />
        <pixiText
          text={content}
          x={padding}
          y={padding}
          style={{
            fontSize,
            fill: element.style.textColor ?? "#1F2937",
            wordWrap: true,
            wordWrapWidth: Math.max(0, rect.width - padding * 2),
          }}
        />
      </pixiContainer>
    );
  }

  if (element.element_type === "Connector") {
    const points = resolveConnectorPoints(element);
    if (!points || points.length < 4) return null;
    return (
      <pixiContainer
        ref={(node: PixiContainer | null) => registerRef(element.id, node)}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
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
      </pixiContainer>
    );
  }

  return null;
});
