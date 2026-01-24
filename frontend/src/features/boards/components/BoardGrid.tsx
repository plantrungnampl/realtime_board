import { memo } from "react";
import { Shape } from "react-konva";
import type { Context } from "konva/lib/Context";

type BoardGridProps = {
  gridSize: number;
  gridEnabled: boolean;
  worldRect: { x: number; y: number; width: number; height: number };
  stageScale: number;
};

const GRID_MAJOR_EVERY = 5;

export const BoardGrid = memo(function BoardGrid({
  gridSize,
  gridEnabled,
  worldRect,
  stageScale,
}: BoardGridProps) {
  if (!gridEnabled) return null;

  const safeGridSize = Math.max(1, gridSize);

  return (
    <Shape
      listening={false}
      sceneFunc={(context: Context) => {
        const { x, y, width, height } = worldRect;
        const startX = Math.floor(x / safeGridSize) * safeGridSize;
        const endX = Math.ceil((x + width) / safeGridSize) * safeGridSize;
        const startY = Math.floor(y / safeGridSize) * safeGridSize;
        const endY = Math.ceil((y + height) / safeGridSize) * safeGridSize;

        // Minor lines
        const minorLineWidth = 1 / stageScale;
        const majorLineWidth = 1.2 / stageScale;

        // Pass 1: Minor lines
        context.beginPath();
        context.lineWidth = minorLineWidth;
        context.strokeStyle = "#222222";

        for (let ix = startX; ix <= endX; ix += safeGridSize) {
          const index = Math.round(ix / safeGridSize);
          if (index % GRID_MAJOR_EVERY !== 0) {
            context.moveTo(ix, y);
            context.lineTo(ix, y + height);
          }
        }
        for (let iy = startY; iy <= endY; iy += safeGridSize) {
          const index = Math.round(iy / safeGridSize);
          if (index % GRID_MAJOR_EVERY !== 0) {
            context.moveTo(x, iy);
            context.lineTo(x + width, iy);
          }
        }
        context.stroke();

        // Pass 2: Major lines
        context.beginPath();
        context.lineWidth = majorLineWidth;
        context.strokeStyle = "#2F2F2F";

        for (let ix = startX; ix <= endX; ix += safeGridSize) {
          const index = Math.round(ix / safeGridSize);
          if (index % GRID_MAJOR_EVERY === 0) {
            context.moveTo(ix, y);
            context.lineTo(ix, y + height);
          }
        }
        for (let iy = startY; iy <= endY; iy += safeGridSize) {
          const index = Math.round(iy / safeGridSize);
          if (index % GRID_MAJOR_EVERY === 0) {
            context.moveTo(x, iy);
            context.lineTo(x + width, iy);
          }
        }
        context.stroke();
      }}
    />
  );
});
