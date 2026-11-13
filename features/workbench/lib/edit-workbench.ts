import {
  type CardLayoutOption,
  getDefaultCardWidthPx,
  getImageRightVerticalPositionDefaultForFixedSideLayout,
  imageRightVerticalPositionDefaultForFluidSideLayout,
  type SideLayoutFlowOption,
} from '@/features/card-renderer/lib/card-renderer-options';
import { normalizeWorkbenchStateForStyle } from './card-style-capability-registry';
import {
  getImageFramePresetFieldValues,
  type ImageFramePresetValue,
} from './image-frame-preset';
import {
  type MagicItemWorkbenchState,
  withItemDetails,
} from './workbench-options';

export type WorkbenchEditHandler = (edit: WorkbenchEdit) => void;

export type WorkbenchEdit =
  | {
      kind: 'field';
      key: keyof MagicItemWorkbenchState;
      value: MagicItemWorkbenchState[keyof MagicItemWorkbenchState];
    }
  | { kind: 'quick-layout'; value: 'stacked' | 'compact' }
  | { kind: 'card-width-px'; value: number }
  | { kind: 'artwork-custom-color'; value: string }
  | { kind: 'image-frame'; value: ImageFramePresetValue };

function applyImageRightVerticalPositionForFlow(
  state: MagicItemWorkbenchState,
  flow: SideLayoutFlowOption,
  classificationAndRarity: string,
): void {
  if (flow === 'fixed') {
    state.imageRightVerticalPosition =
      getImageRightVerticalPositionDefaultForFixedSideLayout(
        classificationAndRarity,
      );
  } else {
    state.imageRightVerticalPosition =
      imageRightVerticalPositionDefaultForFluidSideLayout;
  }
}

function withCardLayout(
  state: MagicItemWorkbenchState,
  nextLayout: CardLayoutOption,
): MagicItemWorkbenchState {
  const priorFlow = state.sideLayoutFlow;
  const next = { ...state, cardLayout: nextLayout };
  next.cardWidthPx = getDefaultCardWidthPx(nextLayout);
  if (nextLayout === 'vertical') {
    next.sideLayoutFlow = 'fixed';
  } else if (nextLayout === 'image-right') {
    applyImageRightVerticalPositionForFlow(
      next,
      priorFlow,
      next.classificationAndRarity,
    );
  }
  return next;
}

function withSideLayoutFlow(
  state: MagicItemWorkbenchState,
  flow: SideLayoutFlowOption,
): MagicItemWorkbenchState {
  const next = { ...state, sideLayoutFlow: flow };
  if (next.cardLayout === 'image-right') {
    applyImageRightVerticalPositionForFlow(
      next,
      flow,
      next.classificationAndRarity,
    );
  }
  return next;
}

function applyFieldEdit(
  base: MagicItemWorkbenchState,
  edit: Extract<WorkbenchEdit, { kind: 'field' }>,
): MagicItemWorkbenchState {
  const { key, value } = edit;
  if (key === 'cardLayout') {
    return withCardLayout(base, value as CardLayoutOption);
  }
  if (key === 'sideLayoutFlow') {
    return withSideLayoutFlow(base, value as SideLayoutFlowOption);
  }
  if (key === 'cardWidthAuto') {
    const next = { ...base, cardWidthAuto: value as boolean };
    if (next.cardWidthAuto) {
      next.cardWidthPx = getDefaultCardWidthPx(next.cardLayout);
    }
    return next;
  }
  return { ...base, [key]: value };
}

export function editWorkbench(
  previous: MagicItemWorkbenchState,
  rendered: MagicItemWorkbenchState,
  edit: WorkbenchEdit,
): MagicItemWorkbenchState {
  const base = withItemDetails(previous, rendered);
  let next: MagicItemWorkbenchState;

  switch (edit.kind) {
    case 'field':
      next = applyFieldEdit(base, edit);
      break;
    case 'quick-layout':
      if (edit.value === 'stacked') {
        next = withCardLayout(base, 'vertical');
      } else {
        next = withSideLayoutFlow(withCardLayout(base, 'image-right'), 'fluid');
      }
      break;
    case 'card-width-px':
      next = {
        ...base,
        cardWidthAuto: false,
        cardWidthPx: edit.value,
      };
      break;
    case 'artwork-custom-color':
      next = {
        ...base,
        artworkCustomColor: edit.value,
        artworkColorSource: 'custom',
      };
      break;
    case 'image-frame': {
      const presetFields = getImageFramePresetFieldValues(edit.value);
      next = {
        ...base,
        ...presetFields,
      };
      break;
    }
  }

  return normalizeWorkbenchStateForStyle(next);
}
