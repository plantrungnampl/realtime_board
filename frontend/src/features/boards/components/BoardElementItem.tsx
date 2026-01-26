import { memo, useRef } from "react";
import { Container as PixiContainer, Graphics as PixiGraphics, Text as PixiText, FederatedPointerEvent } from "pixi.js";
import { extend } from "@pixi/react";
import type { BoardElement } from "@/types/board";
import { DEFAULT_TEXT_STYLE } from "@/features/boards/boardRoute/elements";
import { getTextMetrics } from "@/features/boards/boardRoute.utils";
import {
  coerceNumber,
  parseColor,
  isValidDrawingPoints,
  getRectBounds,
  resolveConnectorPoints,
  setStrokeStyle,
  setFillStyle,
  drawPolyline,
  normalizeOrthogonalPoints,
  SELECTION_STROKE,
} from "@/features/boards/boardCanvas/renderUtils";

// Ensure Pixi elements are available
extend({
  Container: PixiContainer,
  Graphics: PixiGraphics,
  Text: PixiText,
});

type TextEditorPayload = {
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
  isSelected: boolean;
  isDragEnabled: boolean;
  isLocked: boolean;
  stageScale: number;
  onPointerDown: (event: FederatedPointerEvent, element: BoardElement) => void;
  onRegisterRef: (id: string, node: PixiContainer | null) => void;
  onOpenTextEditor: (payload: TextEditorPayload) => void;
};

const DEG_TO_RAD = Math.PI / 180;
const selectionPadding = 6; // Note: In original code this was divided by stageScale inline, we need to check usage

export const BoardElementItem = memo(function BoardElementItem({
  element,
  isSelected,
  isDragEnabled,
  isLocked,
  stageScale,
  onPointerDown,
  onRegisterRef,
  onOpenTextEditor,
}: BoardElementItemProps) {
  const lastTapRef = useRef<number>(0);
  const isInteractive = isDragEnabled && !isLocked;

  const handleDoubleTap = (
    event: FederatedPointerEvent,
    action: () => void
  ) => {
    const now = event.originalEvent.timeStamp ?? performance.now();
    const last = lastTapRef.current;
    lastTapRef.current = now;
    if (now - last < 350) {
      action();
    }
  };

  const selectionStrokeWidth = 2 / stageScale;
  const currentSelectionPadding = selectionPadding / stageScale;

  if (element.element_type === "Shape") {
    if (element.properties.shapeType === "rectangle") {
      const rect = getRectBounds(element);
      return (
        <pixiContainer
          ref={(node: PixiContainer | null) => onRegisterRef(element.id, node)}
          x={rect.x}
          y={rect.y}
          rotation={(element.rotation ?? 0) * DEG_TO_RAD}
          eventMode={isInteractive ? "static" : "passive"}
          onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        >
          <pixiGraphics
            draw={(graphics: PixiGraphics) => {
              graphics.clear();
              const stroke = parseColor(element.style.stroke, 0xffffff);
              const fill = parseColor(element.style.fill, 0x000000);
              const strokeWidth = element.style.strokeWidth ?? 1;
              setStrokeStyle(graphics, strokeWidth, stroke);
              setFillStyle(graphics, fill);
              graphics.rect(0, 0, rect.width, rect.height);
              graphics.fill();
              graphics.stroke();
            }}
          />
          {isSelected && (
            <pixiGraphics
              draw={(graphics: PixiGraphics) => {
                graphics.clear();
                setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
                graphics.rect(
                  -currentSelectionPadding,
                  -currentSelectionPadding,
                  rect.width + currentSelectionPadding * 2,
                  rect.height + currentSelectionPadding * 2,
                );
                graphics.stroke();
              }}
            />
          )}
        </pixiContainer>
      );
    }
    if (element.properties.shapeType === "circle") {
      const radius = Math.hypot(element.width || 0, element.height || 0);
      const positionX = coerceNumber(element.position_x, 0);
      const positionY = coerceNumber(element.position_y, 0);
      return (
        <pixiContainer
          ref={(node: PixiContainer | null) => onRegisterRef(element.id, node)}
          x={positionX}
          y={positionY}
          rotation={(element.rotation ?? 0) * DEG_TO_RAD}
          eventMode={isInteractive ? "static" : "passive"}
          onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        >
          <pixiGraphics
            draw={(graphics: PixiGraphics) => {
              graphics.clear();
              const stroke = parseColor(element.style.stroke, 0xffffff);
              const fill = parseColor(element.style.fill, 0x000000);
              const strokeWidth = element.style.strokeWidth ?? 1;
              setStrokeStyle(graphics, strokeWidth, stroke);
              setFillStyle(graphics, fill);
              graphics.circle(0, 0, radius);
              graphics.fill();
              graphics.stroke();
            }}
          />
          {isSelected && (
            <pixiGraphics
              draw={(graphics: PixiGraphics) => {
                graphics.clear();
                setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
                graphics.circle(0, 0, radius + currentSelectionPadding);
                graphics.stroke();
              }}
            />
          )}
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
        ref={(node: PixiContainer | null) => onRegisterRef(element.id, node)}
        x={positionX}
        y={positionY}
        rotation={(element.rotation ?? 0) * DEG_TO_RAD}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
      >
        <pixiGraphics
          draw={(graphics: PixiGraphics) => {
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
    const metrics = getTextMetrics(content, fontSize);
    return (
      <pixiContainer
        ref={(node: PixiContainer | null) => onRegisterRef(element.id, node)}
        x={positionX}
        y={positionY}
        rotation={(element.rotation ?? 0) * DEG_TO_RAD}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        onPointerTap={(event: FederatedPointerEvent) => {
          handleDoubleTap(event, () => {
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
        {isSelected && (
          <pixiGraphics
            draw={(graphics: PixiGraphics) => {
              graphics.clear();
              setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
              graphics.rect(
                -currentSelectionPadding,
                -currentSelectionPadding,
                metrics.width + currentSelectionPadding * 2,
                metrics.height + currentSelectionPadding * 2,
              );
              graphics.stroke();
            }}
          />
        )}
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
        ref={(node: PixiContainer | null) => onRegisterRef(element.id, node)}
        x={rect.x}
        y={rect.y}
        rotation={(element.rotation ?? 0) * DEG_TO_RAD}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
        onPointerTap={(event: FederatedPointerEvent) => {
          handleDoubleTap(event, () => {
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
          draw={(graphics: PixiGraphics) => {
            graphics.clear();
            const stroke = parseColor(element.style.stroke, 0xffffff);
            const fill = parseColor(element.style.fill, 0xfff9c2);
            const strokeWidth = element.style.strokeWidth ?? 1;
            setStrokeStyle(graphics, strokeWidth, stroke);
            setFillStyle(graphics, fill);
            graphics.roundRect(0, 0, rect.width, rect.height, element.style.cornerRadius ?? 12);
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
        {isSelected && (
          <pixiGraphics
            draw={(graphics: PixiGraphics) => {
              graphics.clear();
              setStrokeStyle(graphics, selectionStrokeWidth, parseColor(SELECTION_STROKE));
              graphics.rect(
                -currentSelectionPadding,
                -currentSelectionPadding,
                rect.width + currentSelectionPadding * 2,
                rect.height + currentSelectionPadding * 2,
              );
              graphics.stroke();
            }}
          />
        )}
      </pixiContainer>
    );
  }

  if (element.element_type === "Connector") {
    const points = resolveConnectorPoints(element);
    if (!points || points.length < 4) return null;
    return (
      <pixiContainer
        ref={(node: PixiContainer | null) => onRegisterRef(element.id, node)}
        eventMode={isInteractive ? "static" : "passive"}
        onPointerDown={(event: FederatedPointerEvent) => onPointerDown(event, element)}
      >
        <pixiGraphics
          draw={(graphics: PixiGraphics) => {
            graphics.clear();
            drawPolyline(
              graphics,
              normalizeOrthogonalPoints(points),
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
