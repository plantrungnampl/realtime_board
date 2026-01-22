import { useMemo } from "react";

type UseBoardViewportOptions = {
  dimensions: { width: number; height: number };
  stageHeight: number;
  stageScale: number;
  stagePosition: { x: number; y: number };
  gridEnabled: boolean;
  gridSize: number;
};

const GRID_MAJOR_EVERY = 5;

export function useBoardViewport({
  dimensions,
  stageHeight,
  stageScale,
  stagePosition,
  gridEnabled,
  gridSize,
}: UseBoardViewportOptions) {
  const worldLeft = (-stagePosition.x) / stageScale;
  const worldTop = (-stagePosition.y) / stageScale;
  const worldRight = (dimensions.width - stagePosition.x) / stageScale;
  const worldBottom = (stageHeight - stagePosition.y) / stageScale;
  const safeGridSize = Math.max(1, gridSize);

  const gridLines = useMemo(() => {
    if (!gridEnabled) return [];
    const lines: Array<{ points: number[]; major: boolean }> = [];
    if (worldLeft >= worldRight || worldTop >= worldBottom) {
      return lines;
    }

    const startX = Math.floor(worldLeft / safeGridSize) * safeGridSize;
    const endX = Math.ceil(worldRight / safeGridSize) * safeGridSize;
    const startY = Math.floor(worldTop / safeGridSize) * safeGridSize;
    const endY = Math.ceil(worldBottom / safeGridSize) * safeGridSize;

    for (let x = startX; x <= endX; x += safeGridSize) {
      const index = Math.round(x / safeGridSize);
      lines.push({
        points: [x, worldTop, x, worldBottom],
        major: index % GRID_MAJOR_EVERY === 0,
      });
    }
    for (let y = startY; y <= endY; y += safeGridSize) {
      const index = Math.round(y / safeGridSize);
      lines.push({
        points: [worldLeft, y, worldRight, y],
        major: index % GRID_MAJOR_EVERY === 0,
      });
    }
    return lines;
  }, [
    gridEnabled,
    safeGridSize,
    worldBottom,
    worldLeft,
    worldRight,
    worldTop,
  ]);

  const worldRect = useMemo(
    () => ({
      x: worldLeft,
      y: worldTop,
      width: worldRight - worldLeft,
      height: worldBottom - worldTop,
    }),
    [worldBottom, worldLeft, worldRight, worldTop],
  );

  return { gridLines, worldRect };
}
