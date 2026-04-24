'use client';

import { Field, FieldLabel } from '@/components/ui/field';
import type {
  ArtworkColorSource,
  ArtworkColorSwatch,
  DerivedArtworkColorSource,
} from '@/features/card-renderer/lib/artwork-color-source';
import { cn } from '@/lib/utils';
import { getArtworkColorControlEntries } from '../lib/artwork-color-control-entries';

interface ArtworkColorSourceControlProps {
  customColor: string;
  disabled?: boolean;
  disabledReason?: string | undefined;
  label?: string;
  labelHidden?: boolean;
  showCustomColor?: boolean;
  source: ArtworkColorSource;
  swatches: ReadonlyArray<ArtworkColorSwatch>;
  onCustomColorChange: (value: string) => void;
  onSourceChange: (value: ArtworkColorSource) => void;
}

function getSourceLabel(source: DerivedArtworkColorSource) {
  switch (source) {
    case 'triad-left':
      return 'Triad left';
    case 'triad-right':
      return 'Triad right';
    default:
      return 'Direct complement';
  }
}

export function ArtworkColorSourceControl({
  customColor,
  disabled = false,
  disabledReason,
  label = 'Artwork color',
  labelHidden = false,
  showCustomColor = true,
  source,
  swatches,
  onCustomColorChange,
  onSourceChange,
}: ArtworkColorSourceControlProps) {
  const entries = getArtworkColorControlEntries(swatches, showCustomColor);
  const effectiveDisabledReason = disabled ? disabledReason : undefined;

  return (
    <Field className={cn('w-auto shrink-0 gap-2', disabled && 'opacity-55')}>
      {labelHidden ? (
        <FieldLabel className="sr-only">{label}</FieldLabel>
      ) : (
        <FieldLabel>{label}</FieldLabel>
      )}
      <div
        className="flex flex-nowrap items-center gap-2"
        aria-disabled={disabled}
        title={effectiveDisabledReason}
      >
        {entries.map((entry) => {
          if (entry.type === 'swatch') {
            const isSelected = source === entry.source;
            return (
              <button
                key={entry.source}
                type="button"
                aria-label={getSourceLabel(entry.source)}
                aria-pressed={isSelected}
                disabled={disabled}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border transition-all outline-none',
                  disabled
                    ? 'cursor-not-allowed border-border/60 bg-muted/40'
                    : isSelected
                      ? 'border-primary/60 bg-primary/10 ring-2 ring-primary/20'
                      : 'border-border/70 bg-card/60 hover:border-primary/25 hover:bg-card',
                )}
                onClick={() => onSourceChange(entry.source)}
              >
                <span
                  aria-hidden
                  className="size-5 rounded-full border border-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_0_1px_rgba(15,23,42,0.08)]"
                  style={{ backgroundColor: entry.color }}
                />
              </button>
            );
          }

          return (
            <label
              key="custom"
              className={cn(
                'relative flex size-9 items-center justify-center overflow-hidden rounded-full border transition-all',
                disabled
                  ? 'cursor-not-allowed border-border/60 bg-muted/40'
                  : source === 'custom'
                    ? 'cursor-pointer border-primary/60 bg-primary/10 ring-2 ring-primary/20'
                    : 'cursor-pointer border-border/70 bg-card/60 hover:border-primary/25 hover:bg-card',
              )}
            >
              <span
                aria-hidden
                className="size-5 rounded-full border border-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_0_1px_rgba(15,23,42,0.08)]"
                style={{ backgroundColor: customColor }}
              />
              <input
                type="color"
                aria-label="Custom artwork color"
                value={customColor}
                disabled={disabled}
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                onChange={(event) => onCustomColorChange(event.target.value)}
              />
            </label>
          );
        })}
      </div>
    </Field>
  );
}
