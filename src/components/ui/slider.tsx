"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";

/** 单值滑块：细轨道、主题色填充，悬停或拖动时滑块放大 */
function Slider({
  className,
  thumbLabel,
  ...props
}: SliderPrimitive.Root.Props<number> & { thumbLabel?: string }) {
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn("w-full", className)} {...props}>
      <SliderPrimitive.Control className="group/slider flex w-full touch-none items-center py-2.5 select-none data-disabled:opacity-50">
        <SliderPrimitive.Track className="h-1 w-full rounded-full bg-muted select-none">
          <SliderPrimitive.Indicator className="rounded-full bg-brand select-none" />
          <SliderPrimitive.Thumb
            aria-label={thumbLabel}
            className="size-3.5 rounded-full border-2 border-brand bg-background shadow-sm transition-transform select-none group-hover/slider:scale-110 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-dragging:scale-115"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
