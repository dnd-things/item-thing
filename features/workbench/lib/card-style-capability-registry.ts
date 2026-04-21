import {
  type CardBorderRadiusOption,
  type CardLayoutOption,
  type CardStyleOption,
  clampCardWidthPxForLayout,
  clampImageBorderWidthPx,
  getDefaultCardWidthPx,
  type ImageAspectRatioOption,
  imageRightVerticalPositionDefaultForFluidSideLayout,
  type SideLayoutFlowOption,
} from '@/features/card-renderer/lib/card-renderer-options';

export type SupportedStyleCapability = 'print' | 'minimal';

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
  | 'imageFlipVertical';

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
  | 'imageFlipVertical';

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

const workbenchControlOrderByPlacement = {
  basic: ['quickLayout', 'imageFramePreset', 'cardBorderRadius', 'cardWidth'],
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
    },
    renderFields: [
      'imageSize',
      'cardWidthAuto',
      'cardWidthPx',
      'imageRotationDegrees',
      'imageFlipHorizontal',
      'imageFlipVertical',
    ],
  },
} as const satisfies Record<SupportedStyleCapability, StyleCapabilityConfig>;

function resolveStyleCapability(
  cardStyle: CardStyleOption,
): SupportedStyleCapability {
  if (cardStyle === 'minimal') {
    return 'minimal';
  }
  return 'print';
}

export function getSupportedStyleCapability(
  cardStyle: CardStyleOption,
): SupportedStyleCapability {
  return resolveStyleCapability(cardStyle);
}

export function getWorkbenchControlsForPlacement(
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

export function getWorkbenchControlPlacement(
  cardStyle: CardStyleOption,
  controlId: WorkbenchControlId,
): WorkbenchControlPlacement {
  return styleCapabilityRegistry[resolveStyleCapability(cardStyle)].controls[
    controlId
  ];
}

export function getRenderStyleFieldIds(
  style: SupportedStyleCapability,
): ReadonlyArray<RenderStyleFieldId> {
  return styleCapabilityRegistry[style].renderFields;
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
          imageRightVerticalPosition:
            imageRightVerticalPositionDefaultForFluidSideLayout,
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
