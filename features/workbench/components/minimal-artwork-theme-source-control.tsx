'use client';

import { Field, FieldLabel } from '@/components/ui/field';
import type { MinimalArtworkThemeSource } from '@/features/card-renderer/lib/card-renderer-options';
import type { MinimalArtworkThemeSwatch } from '@/features/card-renderer/lib/minimal-artwork-theme-source';
import { cn } from '@/lib/utils';

interface MinimalArtworkThemeSourceControlProps {
  customColor: string;
  labelHidden?: boolean;
  source: MinimalArtworkThemeSource;
  swatches: ReadonlyArray<MinimalArtworkThemeSwatch>;
  onCustomColorChange: (value: string) => void;
  onSourceChange: (value: MinimalArtworkThemeSource) => void;
}

function getSourceLabel(source: Exclude<MinimalArtworkThemeSource, 'custom'>) {
  switch (source) {
    case 'triad-left':
      return 'Triad left';
    case 'triad-right':
      return 'Triad right';
    default:
      return 'Complement';
  }
}

export function MinimalArtworkThemeSourceControl({
  customColor,
  labelHidden = false,
  source,
  swatches,
  onCustomColorChange,
  onSourceChange,
}: MinimalArtworkThemeSourceControlProps) {
  return (
    <Field className="gap-2">
      {labelHidden ? (
        <FieldLabel className="sr-only">Artwork background</FieldLabel>
      ) : (
        <FieldLabel>Artwork background</FieldLabel>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((swatch) => {
          const isSelected = source === swatch.source;
          return (
            <button
              key={swatch.source}
              type="button"
              aria-label={getSourceLabel(swatch.source)}
              aria-pressed={isSelected}
              className={cn(
                'flex size-9 items-center justify-center rounded-full border transition-all outline-none',
                isSelected
                  ? 'border-primary/60 bg-primary/10 ring-2 ring-primary/20'
                  : 'border-border/70 bg-card/60 hover:border-primary/25 hover:bg-card',
              )}
              onClick={() => onSourceChange(swatch.source)}
            >
              <span
                aria-hidden
                className="size-5 rounded-full border border-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_0_1px_rgba(15,23,42,0.08)]"
                style={{ backgroundColor: swatch.color }}
              />
            </button>
          );
        })}

        <label
          className={cn(
            'relative flex size-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-all',
            source === 'custom'
              ? 'border-primary/60 bg-primary/10 ring-2 ring-primary/20'
              : 'border-border/70 bg-card/60 hover:border-primary/25 hover:bg-card',
          )}
        >
          <span
            aria-hidden
            className="size-5 rounded-full border border-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_0_1px_rgba(15,23,42,0.08)]"
            style={{ backgroundColor: customColor }}
          />
          <input
            type="color"
            aria-label="Custom artwork background color"
            value={customColor}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => onCustomColorChange(event.target.value)}
          />
        </label>
      </div>
    </Field>
  );
}
