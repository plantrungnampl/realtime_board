import { useMemo } from "react";

type UseBoardViewportOptions = {
  dimensions: { width: number; height: number };
  stageHeight: number;
  stageScale: number;
  stagePosition: { x: number; y: number };
};

export function useBoardViewport({
  dimensions,
  stageHeight,
  stageScale,
  stagePosition,
}: UseBoardViewportOptions) {
  const worldLeft = (-stagePosition.x) / stageScale;
  const worldTop = (-stagePosition.y) / stageScale;
  const worldRight = (dimensions.width - stagePosition.x) / stageScale;
  const worldBottom = (stageHeight - stagePosition.y) / stageScale;

  const worldRect = useMemo(
    () => ({
      x: worldLeft,
      y: worldTop,
      width: worldRight - worldLeft,
      height: worldBottom - worldTop,
    }),
    [worldBottom, worldLeft, worldRight, worldTop],
  );

  return { worldRect };
}
