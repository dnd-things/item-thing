'use client';

import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      className={cn('data-horizontal:w-full data-vertical:h-full', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-4xl bg-muted select-none data-horizontal:h-3 data-horizontal:w-full data-vertical:h-full data-vertical:w-3"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {_values.map((sliderThumbValue) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={sliderThumbValue}
            className="block size-4 shrink-0 cursor-grab rounded-4xl border-2 border-primary bg-primary shadow-[0_0_8px_oklch(0.75_0.12_65/0.3)] ring-ring/50 transition-all duration-200 select-none hover:scale-125 hover:ring-4 hover:shadow-[0_0_12px_oklch(0.75_0.12_65/0.5)] focus-visible:ring-4 focus-visible:outline-hidden active:cursor-grabbing active:scale-110 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
