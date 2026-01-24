import { useCallback, useEffect, useRef, useState } from "react";

const SCALE_BY = 1.06;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const ZOOM_SMOOTHING = 0.18;
const ZOOM_STOP_THRESHOLD = 0.0005;

type UseCanvasZoomOptions = {
  clampStagePosition?: (position: { x: number; y: number }) => { x: number; y: number };
};

export const useCanvasZoom = (options: UseCanvasZoomOptions = {}) => {
  const clampStagePosition = useCallback(
    (position: { x: number; y: number }) =>
      (options.clampStagePosition ?? ((value) => value))(position),
    [options.clampStagePosition],
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });
  const stageScaleRef = useRef(stageScale);
  const stagePositionRef = useRef(stagePosition);
  const zoomAnimationRef = useRef<number | null>(null);
  const zoomTargetRef = useRef({
    scale: 1,
    position: { x: 0, y: 0 },
  });

  useEffect(() => {
    stageScaleRef.current = stageScale;
  }, [stageScale]);

  useEffect(() => {
    stagePositionRef.current = stagePosition;
  }, [stagePosition]);

  const cancelZoomAnimation = useCallback(() => {
    if (zoomAnimationRef.current === null) return;
    cancelAnimationFrame(zoomAnimationRef.current);
    zoomAnimationRef.current = null;
    zoomTargetRef.current = {
      scale: stageScaleRef.current,
      position: stagePositionRef.current,
    };
  }, []);

  useEffect(() => () => cancelZoomAnimation(), [cancelZoomAnimation]);

  const startZoomAnimation = useCallback(() => {
    if (zoomAnimationRef.current !== null) return;
    let lastTime = performance.now();

    const step = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;
      const { scale: targetScale, position: targetPosition } =
        zoomTargetRef.current;
      const currentScale = stageScaleRef.current;
      const currentPosition = stagePositionRef.current;
      const smoothing = 1 - Math.pow(1 - ZOOM_SMOOTHING, deltaMs / 16.67);
      const nextScale = currentScale + (targetScale - currentScale) * smoothing;
      const nextPosition = {
        x: currentPosition.x + (targetPosition.x - currentPosition.x) * smoothing,
        y: currentPosition.y + (targetPosition.y - currentPosition.y) * smoothing,
      };
      const scaleDelta = Math.abs(targetScale - nextScale);
      const positionDelta = Math.hypot(
        targetPosition.x - nextPosition.x,
        targetPosition.y - nextPosition.y,
      );

      stageScaleRef.current = nextScale;
      stagePositionRef.current = nextPosition;
      setStageScale(nextScale);
      setStagePosition(nextPosition);

      if (scaleDelta < ZOOM_STOP_THRESHOLD && positionDelta < 0.5) {
        stageScaleRef.current = targetScale;
        stagePositionRef.current = targetPosition;
        setStageScale(targetScale);
        setStagePosition(targetPosition);
        zoomAnimationRef.current = null;
        return;
      }

      zoomAnimationRef.current = requestAnimationFrame(step);
    };

    zoomAnimationRef.current = requestAnimationFrame(step);
  }, []);

  const setZoomTarget = useCallback(
    (targetScale: number, targetPosition: { x: number; y: number }) => {
      zoomTargetRef.current = {
        scale: targetScale,
        position: targetPosition,
      };
      startZoomAnimation();
    },
    [startZoomAnimation],
  );

  const handleWheel = useCallback(
    (event: {
      screen: { x: number; y: number };
      deltaX: number;
      deltaY: number;
      ctrlKey: boolean;
      metaKey: boolean;
      originalEvent: WheelEvent;
    }) => {
      event.originalEvent.preventDefault();
      if (!event.ctrlKey && !event.metaKey) {
        cancelZoomAnimation();
        const nextPosition = clampStagePosition({
          x: stagePositionRef.current.x - event.deltaX,
          y: stagePositionRef.current.y - event.deltaY,
        });
        stagePositionRef.current = nextPosition;
        zoomTargetRef.current = {
          scale: stageScaleRef.current,
          position: nextPosition,
        };
        setStagePosition(nextPosition);
        return;
      }

      const oldScale = stageScaleRef.current || 1;
      const oldPosition = stagePositionRef.current;
      const scaleDirection = event.deltaY > 0 ? -1 : 1;
      const scaleFactor = scaleDirection > 0 ? SCALE_BY : 1 / SCALE_BY;
      const nextScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, oldScale * scaleFactor),
      );

      const mousePointTo = {
        x: (event.screen.x - oldPosition.x) / oldScale,
        y: (event.screen.y - oldPosition.y) / oldScale,
      };

      const nextPosition = {
        x: event.screen.x - mousePointTo.x * nextScale,
        y: event.screen.y - mousePointTo.y * nextScale,
      };

      setZoomTarget(nextScale, clampStagePosition(nextPosition));
    },
    [cancelZoomAnimation, clampStagePosition, setZoomTarget],
  );

  const resetZoom = useCallback(() => {
    setZoomTarget(1, { x: 0, y: 0 });
  }, [setZoomTarget]);

  const setStagePositionDirect = useCallback(
    (position: { x: number; y: number }) => {
      cancelZoomAnimation();
      const next = clampStagePosition(position);
      stagePositionRef.current = next;
      zoomTargetRef.current = {
        scale: stageScaleRef.current,
        position: next,
      };
      setStagePosition(next);
    },
    [cancelZoomAnimation, clampStagePosition],
  );

  return {
    stageRef,
    stageScale,
    stagePosition,
    stageScaleRef,
    stagePositionRef,
    handleWheel,
    resetZoom,
    setStagePositionDirect,
  };
};
