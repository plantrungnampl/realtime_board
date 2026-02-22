import { memo, useCallback, useMemo } from "react";
import { Graphics as PixiGraphics } from "pixi.js";
import { extend } from "@pixi/react";
import { parseColor, setStrokeStyle } from "@/features/boards/boardCanvas/renderUtils";

extend({ Graphics: PixiGraphics });

type SelectionOutlineProps = {
  width: number;
  height: number;
  strokeWidth: number;
  padding: number;
  color: string;
};

export const SelectionOutline = memo(function SelectionOutline({
  width,
  height,
  strokeWidth,
  padding,
  color,
}: SelectionOutlineProps) {
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(color));
      graphics.rect(
        -padding,
        -padding,
        width + padding * 2,
        height + padding * 2,
      );
      graphics.stroke();
    },
    [width, height, strokeWidth, padding, color],
  );

  return <pixiGraphics draw={draw} />;
});

type SelectionCircleProps = {
  radius: number;
  strokeWidth: number;
  padding: number;
  color: string;
};

export const SelectionCircle = memo(function SelectionCircle({
  radius,
  strokeWidth,
  padding,
  color,
}: SelectionCircleProps) {
  const draw = useCallback(
    (graphics: PixiGraphics) => {
      graphics.clear();
      setStrokeStyle(graphics, strokeWidth, parseColor(color));
      graphics.circle(0, 0, radius + padding);
      graphics.stroke();
    },
    [radius, strokeWidth, padding, color],
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
  const labelStyle = useMemo(
    () => ({
      fontSize: labelFontSize,
      fill: color,
    }),
    [labelFontSize, color],
  );

  return (
    <pixiContainer x={x} y={y} eventMode="passive">
      <SelectionOutline
        width={width}
        height={height}
        strokeWidth={strokeWidth}
        padding={padding}
        color={color}
      />
      {label && (
        <pixiText
          text={label}
          x={0}
          y={-labelFontSize - labelOffset}
          style={labelStyle}
        />
      )}
    </pixiContainer>
  );
});
