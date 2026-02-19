import { memo, useCallback, useMemo } from "react";
import type { Graphics } from "pixi.js";
import { parseColor, setStrokeStyle } from "@/features/boards/boardCanvas/renderUtils";

type SelectionRectOutlineProps = {
  width: number;
  height: number;
  color: number;
  strokeWidth: number;
  padding: number;
};

// Memoized component to prevent re-drawing graphics when only the parent container position changes.
export const SelectionRectOutline = memo(function SelectionRectOutline({
  width,
  height,
  color,
  strokeWidth,
  padding,
}: SelectionRectOutlineProps) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      setStrokeStyle(g, strokeWidth, color);
      g.rect(-padding, -padding, width + padding * 2, height + padding * 2);
      g.stroke();
    },
    [width, height, color, strokeWidth, padding]
  );

  return <pixiGraphics draw={draw} />;
});

type SelectionCircleOutlineProps = {
  radius: number;
  color: number;
  strokeWidth: number;
  padding: number;
};

export const SelectionCircleOutline = memo(function SelectionCircleOutline({
  radius,
  color,
  strokeWidth,
  padding,
}: SelectionCircleOutlineProps) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      setStrokeStyle(g, strokeWidth, color);
      g.circle(0, 0, radius + padding);
      g.stroke();
    },
    [radius, color, strokeWidth, padding]
  );

  return <pixiGraphics draw={draw} />;
});

type PresenceOverlayItemProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
  strokeWidth: number;
  padding: number;
  labelFontSize: number;
  labelOffset: number;
};

export const PresenceOverlayItem = memo(function PresenceOverlayItem({
  x,
  y,
  width,
  height,
  color,
  label,
  strokeWidth,
  padding,
  labelFontSize,
  labelOffset,
}: PresenceOverlayItemProps) {
  const parsedColor = useMemo(() => parseColor(color), [color]);

  const textStyle = useMemo(() => ({
    fontSize: labelFontSize,
    fill: color,
  }), [labelFontSize, color]);

  return (
    <pixiContainer x={x} y={y}>
      <SelectionRectOutline
        width={width}
        height={height}
        color={parsedColor}
        strokeWidth={strokeWidth}
        padding={padding}
      />
      {label && (
        <pixiText
          text={label}
          x={0}
          y={-labelFontSize - labelOffset}
          style={textStyle}
        />
      )}
    </pixiContainer>
  );
});
