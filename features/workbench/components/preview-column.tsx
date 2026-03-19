'use client';

import {
  BorderAll02Icon,
  BorderNone01Icon,
  CircleIcon,
  Settings01Icon,
  SquareIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { RefObject } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { imageBorderRadiusRange } from '@/features/card-renderer/lib/card-renderer-options';

import {
  cardStyleOptions,
  type MagicItemWorkbenchState,
  type WorkbenchFieldSetter,
} from '../lib/workbench-options';
import { ItemPreviewPanel } from './item-preview-panel';
import { ToolbarSelectField } from './workbench-field-controls';
import { WorkbenchSettingsDrawer } from './workbench-settings-drawer';

type QuickLayoutValue = 'stacked' | 'compact';
type QuickImageShapeValue = 'rect' | 'circle';

function deriveQuickImageShape(
  workbenchState: MagicItemWorkbenchState,
): QuickImageShapeValue | '' {
  if (workbenchState.imageBorderRadius === 0) return 'rect';
  if (workbenchState.imageBorderRadius === imageBorderRadiusRange.max)
    return 'circle';
  return '';
}

function deriveQuickLayout(
  workbenchState: MagicItemWorkbenchState,
): QuickLayoutValue | '' {
  if (workbenchState.cardLayout === 'vertical') return 'stacked';
  if (
    workbenchState.cardLayout === 'image-right' &&
    workbenchState.sideLayoutFlow === 'fluid'
  )
    return 'compact';
  return '';
}

interface PreviewColumnProps {
  cardRef: RefObject<HTMLDivElement | null>;
  workbenchState: MagicItemWorkbenchState;
  setWorkbenchField: WorkbenchFieldSetter;
}

export function PreviewColumn({
  cardRef,
  workbenchState,
  setWorkbenchField,
}: PreviewColumnProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const quickLayout = deriveQuickLayout(workbenchState);
  const quickImageShape = deriveQuickImageShape(workbenchState);

  function handleQuickLayoutChange(value: string) {
    if (value === 'stacked') {
      setWorkbenchField('cardLayout', 'vertical');
      setWorkbenchField('sideLayoutFlow', 'fixed');
    } else if (value === 'compact') {
      setWorkbenchField('cardLayout', 'image-right');
      setWorkbenchField('sideLayoutFlow', 'fluid');
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div data-print-hide className="flex items-end gap-3">
        <div className="flex flex-1 items-end gap-3">
          <div className="w-36 shrink-0">
            <ToolbarSelectField
              fieldLabel="Style"
              options={cardStyleOptions}
              triggerId="quick-card-style"
              value={workbenchState.cardStyle}
              onValueChange={(value) => {
                setWorkbenchField('cardStyle', value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium leading-none text-foreground">
              Layout
            </span>
            <ToggleGroup
              value={quickLayout ? [quickLayout] : []}
              variant="outline"
              onValueChange={(nextValues) => {
                const nextValue = nextValues[nextValues.length - 1];
                if (nextValue) {
                  handleQuickLayoutChange(nextValue);
                }
              }}
            >
              <ToggleGroupItem value="stacked" aria-label="Stacked layout">
                Stacked
              </ToggleGroupItem>
              <ToggleGroupItem value="compact" aria-label="Compact layout">
                Compact
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium leading-none text-foreground">
              Shape
            </span>
            <ToggleGroup
              value={quickImageShape ? [quickImageShape] : []}
              variant="outline"
              onValueChange={(nextValues) => {
                const nextValue = nextValues[nextValues.length - 1];
                if (nextValue === 'rect') {
                  setWorkbenchField('imageBorderRadius', 0);
                } else if (nextValue === 'circle') {
                  setWorkbenchField(
                    'imageBorderRadius',
                    imageBorderRadiusRange.max,
                  );
                  setWorkbenchField('imageAspectRatio', 'square');
                }
              }}
            >
              <ToggleGroupItem value="rect" aria-label="Rectangle image">
                <HugeiconsIcon icon={SquareIcon} strokeWidth={1.5} />
              </ToggleGroupItem>
              <ToggleGroupItem value="circle" aria-label="Circle image">
                <HugeiconsIcon icon={CircleIcon} strokeWidth={1.5} />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium leading-none text-foreground">
              Border
            </span>
            <ToggleGroup
              value={[workbenchState.imageBorder]}
              variant="outline"
              onValueChange={(nextValues) => {
                const nextValue = nextValues[nextValues.length - 1];
                if (nextValue) {
                  setWorkbenchField(
                    'imageBorder',
                    nextValue as MagicItemWorkbenchState['imageBorder'],
                  );
                }
              }}
            >
              <ToggleGroupItem value="none" aria-label="No image border">
                <HugeiconsIcon icon={BorderNone01Icon} strokeWidth={1.5} />
              </ToggleGroupItem>
              <ToggleGroupItem value="thin" aria-label="Thin image border">
                <HugeiconsIcon icon={BorderAll02Icon} strokeWidth={1.5} />
              </ToggleGroupItem>
              <ToggleGroupItem value="thick" aria-label="Thick image border">
                <HugeiconsIcon icon={BorderAll02Icon} strokeWidth={3} />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Open card settings"
          onClick={() => setIsDrawerOpen(true)}
        >
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={1.5} />
        </Button>
      </div>

      <ItemPreviewPanel cardRef={cardRef} workbenchState={workbenchState} />

      <WorkbenchSettingsDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        setWorkbenchField={setWorkbenchField}
        workbenchState={workbenchState}
      />
    </div>
  );
}
