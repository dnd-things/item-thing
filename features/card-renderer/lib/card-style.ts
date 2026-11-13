import {
  type CardBorderRadiusOption,
  type CardLayoutOption,
  type CardStyleOption,
  clampCardWidthPxForLayout,
  clampImageBorderWidthPx,
  getDefaultCardWidthPx,
  type ImageAspectRatioOption,
  type SideLayoutFlowOption,
} from '@/features/card-renderer/lib/card-renderer-options';
import { defaultImageRightVerticalPosition } from '@/features/card-renderer/lib/image-right-artwork-placement';

export type StyleCapability = 'print' | 'minimal';

export type CardStyleLayout = 'print' | 'minimal' | 'pending';

export type WorkbenchControlPlacement = 'none' | 'basic' | 'advanced' | 'both';

export type WorkbenchControlId =
  | 'cardBorderRadius'
  | 'quickLayout'
  | 'cardLayout'
  | 'sideLayoutFlow'
  | 'imageFramePreset'
  | 'imageAspectRatio'
  | 'imageBorderRadius'
  | 'imageBorderWidthPx'
  | 'imageSize'
  | 'cardWidth'
  | 'imageRightVerticalPosition'
  | 'imageRotationDegrees'
  | 'imageFlipHorizontal'
  | 'imageFlipVertical'
  | 'artworkColorSource';

export type RenderStyleFieldId =
  | 'cardBorderRadius'
  | 'cardLayout'
  | 'sideLayoutFlow'
  | 'imageAspectRatio'
  | 'imageSize'
  | 'cardWidthAuto'
  | 'cardWidthPx'
  | 'imageBorderRadius'
  | 'imageBorderWidthPx'
  | 'imageRightVerticalPosition'
  | 'imageRotationDegrees'
  | 'imageFlipHorizontal'
  | 'imageFlipVertical'
  | 'artworkColorSource'
  | 'artworkCustomColor';

export type ImageFramePresetValue = 'borderless' | 'bordered';

export type QuickLayoutValue = 'stacked' | 'compact';

export type BasicChoiceId = 'quickLayout' | 'imageFrame';

interface StyleCapabilityConfig {
  controls: Record<WorkbenchControlId, WorkbenchControlPlacement>;
  renderFields: ReadonlyArray<RenderStyleFieldId>;
}

export interface StyleNormalizableWorkbenchState {
  cardStyle: CardStyleOption;
  cardLayout: CardLayoutOption;
  sideLayoutFlow: SideLayoutFlowOption;
  cardBorderRadius: CardBorderRadiusOption;
  cardWidthAuto: boolean;
  cardWidthPx: number;
  imageAspectRatio: ImageAspectRatioOption;
  imageBorderRadius: number;
  imageBorderWidthPx: number;
  imageRightVerticalPosition: number;
}

export interface BasicChoiceReadableWorkbenchState {
  cardLayout: CardLayoutOption;
  sideLayoutFlow: SideLayoutFlowOption;
  imageBorderWidthPx: number;
  imageBorderRadius: number;
  imageAspectRatio: ImageAspectRatioOption;
}

const imageFramePresetFieldValues = {
  borderless: {
    imageBorderWidthPx: 0,
    imageBorderRadius: 0,
    imageAspectRatio: 'based-on-image' as const,
  },
  bordered: {
    imageBorderWidthPx: 5,
    imageBorderRadius: 100,
    imageAspectRatio: 'square' as const,
  },
} as const satisfies Record<
  ImageFramePresetValue,
  Pick<
    StyleNormalizableWorkbenchState,
    'imageBorderWidthPx' | 'imageBorderRadius' | 'imageAspectRatio'
  >
>;

const workbenchControlOrderByPlacement = {
  basic: [
    'quickLayout',
    'imageFramePreset',
    'cardBorderRadius',
    'cardWidth',
    'artworkColorSource',
  ],
  advanced: [
    'cardBorderRadius',
    'cardLayout',
    'sideLayoutFlow',
    'imageAspectRatio',
    'imageBorderRadius',
    'imageBorderWidthPx',
    'imageSize',
    'cardWidth',
    'imageRightVerticalPosition',
    'imageRotationDegrees',
    'imageFlipHorizontal',
    'imageFlipVertical',
    'artworkColorSource',
  ],
} as const satisfies Record<
  'basic' | 'advanced',
  ReadonlyArray<WorkbenchControlId>
>;

const styleCapabilityRegistry = {
  print: {
    controls: {
      cardBorderRadius: 'both',
      quickLayout: 'basic',
      cardLayout: 'advanced',
      sideLayoutFlow: 'advanced',
      imageFramePreset: 'basic',
      imageAspectRatio: 'advanced',
      imageBorderRadius: 'advanced',
      imageBorderWidthPx: 'advanced',
      imageSize: 'advanced',
      cardWidth: 'both',
      imageRightVerticalPosition: 'advanced',
      imageRotationDegrees: 'advanced',
      imageFlipHorizontal: 'advanced',
      imageFlipVertical: 'advanced',
      artworkColorSource: 'both',
    },
    renderFields: [
      'cardBorderRadius',
      'cardLayout',
      'sideLayoutFlow',
      'imageAspectRatio',
      'imageSize',
      'cardWidthAuto',
      'cardWidthPx',
      'imageBorderRadius',
      'imageBorderWidthPx',
      'imageRightVerticalPosition',
      'imageRotationDegrees',
      'imageFlipHorizontal',
      'imageFlipVertical',
      'artworkColorSource',
      'artworkCustomColor',
    ],
  },
  minimal: {
    controls: {
      cardBorderRadius: 'none',
      quickLayout: 'none',
      cardLayout: 'none',
      sideLayoutFlow: 'none',
      imageFramePreset: 'none',
      imageAspectRatio: 'none',
      imageBorderRadius: 'none',
      imageBorderWidthPx: 'none',
      imageSize: 'advanced',
      cardWidth: 'both',
      imageRightVerticalPosition: 'none',
      imageRotationDegrees: 'advanced',
      imageFlipHorizontal: 'advanced',
      imageFlipVertical: 'advanced',
      artworkColorSource: 'both',
    },
    renderFields: [
      'imageSize',
      'cardWidthAuto',
      'cardWidthPx',
      'imageRotationDegrees',
      'imageFlipHorizontal',
      'imageFlipVertical',
      'artworkColorSource',
      'artworkCustomColor',
    ],
  },
} as const satisfies Record<StyleCapability, StyleCapabilityConfig>;

function resolveStyleCapability(cardStyle: CardStyleOption): StyleCapability {
  if (cardStyle === 'minimal') {
    return 'minimal';
  }
  return 'print';
}

export function resolveCardStyle(cardStyle: CardStyleOption): {
  capability: StyleCapability;
  layout: CardStyleLayout;
} {
  if (cardStyle === 'minimal') {
    return { capability: 'minimal', layout: 'minimal' };
  }
  if (cardStyle === 'classic') {
    return { capability: 'print', layout: 'pending' };
  }
  return { capability: 'print', layout: 'print' };
}

export function controlsForPlacement(
  cardStyle: CardStyleOption,
  placement: 'basic' | 'advanced',
): ReadonlyArray<WorkbenchControlId> {
  const styleCapability = resolveStyleCapability(cardStyle);
  return workbenchControlOrderByPlacement[placement].filter((controlId) => {
    const controlPlacement =
      styleCapabilityRegistry[styleCapability].controls[controlId];
    return controlPlacement === placement || controlPlacement === 'both';
  });
}

export function renderStyleFieldIds(
  capability: StyleCapability,
): ReadonlyArray<RenderStyleFieldId> {
  return styleCapabilityRegistry[capability].renderFields;
}

export function applyImageFrame<T extends StyleNormalizableWorkbenchState>(
  state: T,
  value: ImageFramePresetValue,
): T {
  return {
    ...state,
    ...imageFramePresetFieldValues[value],
  };
}

export function readBasicChoice(
  state: BasicChoiceReadableWorkbenchState,
  choiceId: BasicChoiceId,
): QuickLayoutValue | ImageFramePresetValue | null {
  if (choiceId === 'quickLayout') {
    if (state.cardLayout === 'vertical') {
      return 'stacked';
    }
    if (
      state.cardLayout === 'image-right' &&
      state.sideLayoutFlow === 'fluid'
    ) {
      return 'compact';
    }
    return null;
  }
  const borderless = imageFramePresetFieldValues.borderless;
  const bordered = imageFramePresetFieldValues.bordered;
  const matchesBorderless =
    state.imageBorderWidthPx === borderless.imageBorderWidthPx &&
    state.imageBorderRadius === borderless.imageBorderRadius &&
    state.imageAspectRatio === borderless.imageAspectRatio;
  const matchesBordered =
    state.imageBorderWidthPx === bordered.imageBorderWidthPx &&
    state.imageBorderRadius === bordered.imageBorderRadius &&
    state.imageAspectRatio === bordered.imageAspectRatio;
  if (matchesBorderless) {
    return 'borderless';
  }
  if (matchesBordered) {
    return 'bordered';
  }
  const widthMatchesBorderless =
    state.imageBorderWidthPx === borderless.imageBorderWidthPx;
  const widthMatchesBordered =
    state.imageBorderWidthPx === bordered.imageBorderWidthPx;
  const radiusMatchesBorderless =
    state.imageBorderRadius === borderless.imageBorderRadius;
  const radiusMatchesBordered =
    state.imageBorderRadius === bordered.imageBorderRadius;
  const aspectMatchesBorderless =
    state.imageAspectRatio === borderless.imageAspectRatio;
  const aspectMatchesBordered =
    state.imageAspectRatio === bordered.imageAspectRatio;
  const widthOnly =
    (widthMatchesBorderless || widthMatchesBordered) &&
    !radiusMatchesBorderless &&
    !radiusMatchesBordered &&
    !aspectMatchesBorderless &&
    !aspectMatchesBordered;
  const radiusOnly =
    (radiusMatchesBorderless || radiusMatchesBordered) &&
    !widthMatchesBorderless &&
    !widthMatchesBordered &&
    !aspectMatchesBorderless &&
    !aspectMatchesBordered;
  const aspectOnly =
    (aspectMatchesBorderless || aspectMatchesBordered) &&
    !widthMatchesBorderless &&
    !widthMatchesBordered &&
    !radiusMatchesBorderless &&
    !radiusMatchesBordered;
  if (widthOnly || radiusOnly || aspectOnly) {
    return null;
  }
  return null;
}

export function normalizeWorkbenchStateForStyle<
  TState extends StyleNormalizableWorkbenchState,
>(state: TState): TState {
  const styleCapability = resolveStyleCapability(state.cardStyle);

  const nextState =
    styleCapability === 'minimal'
      ? {
          ...state,
          cardLayout: 'vertical' as const,
          sideLayoutFlow: 'fixed' as const,
          cardBorderRadius: 'none' as const,
          imageAspectRatio: 'based-on-image' as const,
          imageBorderRadius: 0,
          imageBorderWidthPx: 0,
          imageRightVerticalPosition: defaultImageRightVerticalPosition(
            'fluid',
            '',
          ),
        }
      : { ...state };

  nextState.cardWidthPx = clampCardWidthPxForLayout(
    nextState.cardLayout,
    nextState.cardWidthPx,
  );
  nextState.imageBorderWidthPx = clampImageBorderWidthPx(
    nextState.imageBorderWidthPx,
  );

  if (nextState.cardWidthAuto) {
    nextState.cardWidthPx = getDefaultCardWidthPx(nextState.cardLayout);
  }

  return nextState;
}
