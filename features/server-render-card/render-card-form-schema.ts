import { z } from 'zod';
import { normalizeArtworkCustomColor } from '@/features/card-renderer/lib/artwork-color-source';
import {
  type ImageAspectRatioOption,
  imageBorderWidthPxRange,
} from '@/features/card-renderer/lib/card-renderer-options';
import {
  getRenderStyleFieldIds,
  type RenderStyleFieldId,
  type SupportedStyleCapability,
} from '@/features/workbench/lib/card-style-capability-registry';

export const renderCardItemJsonSchema = z.object({
  itemName: z.string().min(1),
  classificationAndRarity: z.string().min(1),
  requiresAttunement: z.boolean(),
  flavorDescription: z.string(),
  mechanicalDescription: z.string().min(1),
});

export type RenderCardItemJson = z.infer<typeof renderCardItemJsonSchema>;

const booleanFormFieldSchema = z
  .union([
    z.literal(true),
    z.literal(false),
    z.literal('true'),
    z.literal('false'),
  ])
  .transform((value) => value === true || value === 'true');

const numberFormFieldSchema = z.union([
  z.number(),
  z
    .string()
    .min(1)
    .transform((value, context) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        context.issues.push({
          code: 'custom',
          message: 'Expected a number',
          input: value,
        });
        return z.NEVER;
      }
      return parsed;
    }),
]);

const integerFormFieldSchema = numberFormFieldSchema.pipe(z.number().int());

function optionalIntegerFieldSchema(bounds?: { min?: number; max?: number }) {
  let schema: z.ZodTypeAny = integerFormFieldSchema.pipe(z.number().int());
  if (bounds?.min !== undefined) {
    schema = schema.pipe(z.number().min(bounds.min));
  }
  if (bounds?.max !== undefined) {
    schema = schema.pipe(z.number().max(bounds.max));
  }
  return schema.optional();
}

function optionalNumberFieldSchema(bounds?: { min?: number; max?: number }) {
  let schema: z.ZodTypeAny = numberFormFieldSchema.pipe(z.number());
  if (bounds?.min !== undefined) {
    schema = schema.pipe(z.number().min(bounds.min));
  }
  if (bounds?.max !== undefined) {
    schema = schema.pipe(z.number().max(bounds.max));
  }
  return schema.optional();
}

const pixelRatioFormSchema = z
  .union([z.literal(1), z.literal(2), z.literal('1'), z.literal('2')])
  .transform((value): 1 | 2 => (value === '1' || value === 1 ? 1 : 2));

const imageAspectRatioSchema = z.enum([
  'based-on-image',
  'square',
  'portrait',
  'portrait-3-4',
  'portrait-2-3',
  'portrait-9-16',
  'landscape',
  'widescreen',
] satisfies ReadonlyArray<ImageAspectRatioOption>);

const sharedRenderCardMultipartFieldsSchema = z.object({
  pixelRatio: pixelRatioFormSchema,
  format: z.enum(['png', 'jpg']),
});

const renderStyleFieldSchemaMap = {
  cardBorderRadius: z.enum(['none', 'small', 'large']).optional(),
  cardLayout: z.enum(['vertical', 'image-right']).optional(),
  sideLayoutFlow: z.enum(['fixed', 'fluid']).optional(),
  imageAspectRatio: imageAspectRatioSchema.optional(),
  imageSize: optionalIntegerFieldSchema({ min: 30, max: 100 }),
  cardWidthAuto: booleanFormFieldSchema.optional(),
  cardWidthPx: optionalIntegerFieldSchema(),
  imageBorderRadius: optionalNumberFieldSchema({ min: 0, max: 100 }),
  imageBorderWidthPx: optionalIntegerFieldSchema({
    min: imageBorderWidthPxRange.min,
    max: imageBorderWidthPxRange.max,
  }),
  imageRightVerticalPosition: optionalIntegerFieldSchema({ min: -8, max: 32 }),
  imageRotationDegrees: optionalNumberFieldSchema({ min: 0, max: 360 }),
  imageFlipHorizontal: booleanFormFieldSchema.optional(),
  imageFlipVertical: booleanFormFieldSchema.optional(),
  artworkColorSource: z
    .enum(['auto-complement', 'triad-left', 'triad-right', 'neutral', 'custom'])
    .optional(),
  artworkCustomColor: z
    .string()
    .transform((value) => normalizeArtworkCustomColor(value))
    .optional(),
} as const satisfies Record<RenderStyleFieldId, z.ZodTypeAny>;

function pickRenderStyleFieldSchemaShape(
  style: SupportedStyleCapability,
): Record<string, z.ZodTypeAny> {
  return Object.fromEntries(
    getRenderStyleFieldIds(style).map((fieldId) => [
      fieldId,
      renderStyleFieldSchemaMap[fieldId],
    ]),
  );
}

const renderCardFieldsSchemaByStyle = {
  print: sharedRenderCardMultipartFieldsSchema.extend(
    pickRenderStyleFieldSchemaShape('print'),
  ),
  minimal: sharedRenderCardMultipartFieldsSchema.extend(
    pickRenderStyleFieldSchemaShape('minimal'),
  ),
} as const satisfies Record<
  SupportedStyleCapability,
  z.ZodObject<Record<string, z.ZodTypeAny>>
>;

export type RenderCardMultipartFields<TStyle extends SupportedStyleCapability> =
  z.infer<(typeof renderCardFieldsSchemaByStyle)[TStyle]>;

function getFormEntry(
  formData: FormData,
  key: string,
): FormDataEntryValue | null {
  return formData.get(key);
}

function collectRenderFieldEntries(
  formData: FormData,
): Record<string, FormDataEntryValue> {
  type ArtworkColorAliasEntries = Partial<
    Record<
      | 'artworkColorSource'
      | 'artworkCustomColor'
      | 'minimalArtworkThemeSource'
      | 'minimalArtworkThemeCustomColor',
      FormDataEntryValue
    >
  >;
  const entries: Record<string, FormDataEntryValue> & ArtworkColorAliasEntries =
    {};
  for (const [key, value] of formData.entries()) {
    if (key === 'artwork' || key === 'item') {
      continue;
    }
    entries[key] = value;
  }
  if (
    entries.artworkColorSource === undefined &&
    entries.minimalArtworkThemeSource !== undefined
  ) {
    entries.artworkColorSource = entries.minimalArtworkThemeSource;
  }
  if (
    entries.artworkCustomColor === undefined &&
    entries.minimalArtworkThemeCustomColor !== undefined
  ) {
    entries.artworkCustomColor = entries.minimalArtworkThemeCustomColor;
  }
  return entries;
}

export interface ParseRenderCardFormSuccess<
  TStyle extends SupportedStyleCapability,
> {
  ok: true;
  artwork: File;
  artworkBuffer: Buffer;
  fields: RenderCardMultipartFields<TStyle>;
  item: RenderCardItemJson;
  style: TStyle;
}

export interface ParseRenderCardFormFailure {
  ok: false;
  message: string;
  details?: unknown;
}

export type ParseRenderCardFormResult<TStyle extends SupportedStyleCapability> =
  | ParseRenderCardFormSuccess<TStyle>
  | ParseRenderCardFormFailure;

export async function parseRenderCardMultipartFormData<
  TStyle extends SupportedStyleCapability,
>(
  formData: FormData,
  style: TStyle,
): Promise<ParseRenderCardFormResult<TStyle>> {
  const artwork = formData.get('artwork');
  if (!(artwork instanceof File)) {
    return { ok: false, message: 'artwork must be a file' };
  }
  if (artwork.size === 0) {
    return { ok: false, message: 'artwork is empty' };
  }

  const itemRaw = getFormEntry(formData, 'item');
  if (typeof itemRaw !== 'string') {
    return { ok: false, message: 'item must be a JSON string' };
  }

  let itemParsed: unknown;
  try {
    itemParsed = JSON.parse(itemRaw);
  } catch {
    return { ok: false, message: 'item JSON is invalid' };
  }

  const itemResult = renderCardItemJsonSchema.safeParse(itemParsed);
  if (!itemResult.success) {
    return {
      ok: false,
      message: 'item JSON failed validation',
      details: itemResult.error.flatten(),
    };
  }

  const fieldsResult = renderCardFieldsSchemaByStyle[style]
    .strict()
    .safeParse(collectRenderFieldEntries(formData));
  if (!fieldsResult.success) {
    return {
      ok: false,
      message: 'form fields failed validation',
      details: fieldsResult.error.flatten(),
    };
  }

  const artworkBuffer = Buffer.from(await artwork.arrayBuffer());

  return {
    ok: true,
    artwork,
    artworkBuffer,
    fields: fieldsResult.data as RenderCardMultipartFields<TStyle>,
    item: itemResult.data,
    style,
  };
}
