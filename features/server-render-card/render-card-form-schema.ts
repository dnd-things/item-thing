import { z } from 'zod';

export const renderCardItemJsonSchema = z.object({
  itemName: z.string().min(1),
  classificationAndRarity: z.string().min(1),
  requiresAttunement: z.boolean(),
  flavorDescription: z.string(),
  mechanicalDescription: z.string().min(1),
});

export type RenderCardItemJson = z.infer<typeof renderCardItemJsonSchema>;

const pixelRatioFormSchema = z
  .union([z.literal(1), z.literal(2), z.literal('1'), z.literal('2')])
  .transform((value): 1 | 2 => (value === '1' || value === 1 ? 1 : 2));

export const renderCardMultipartFieldsSchema = z.object({
  cardLayout: z.literal('vertical'),
  sideLayoutFlow: z.literal('fixed'),
  cardStyle: z.enum(['print', 'minimal']),
  imageFramePreset: z.enum(['borderless', 'bordered']),
  pixelRatio: pixelRatioFormSchema,
  format: z.enum(['png', 'jpg']),
});

export type RenderCardMultipartFields = z.infer<
  typeof renderCardMultipartFieldsSchema
>;

export interface RenderCardMultipartFieldsRaw {
  cardLayout: string | undefined;
  sideLayoutFlow: string | undefined;
  cardStyle: string | undefined;
  imageFramePreset: string | undefined;
  pixelRatio: FormDataEntryValue | null;
  format: string | undefined;
}

function getFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

export interface ParseRenderCardFormSuccess {
  ok: true;
  artwork: File;
  artworkBuffer: Buffer;
  fields: RenderCardMultipartFields;
  item: RenderCardItemJson;
}

export interface ParseRenderCardFormFailure {
  ok: false;
  message: string;
  details?: unknown;
}

export type ParseRenderCardFormResult =
  | ParseRenderCardFormSuccess
  | ParseRenderCardFormFailure;

export async function parseRenderCardMultipartFormData(
  formData: FormData,
): Promise<ParseRenderCardFormResult> {
  const artwork = formData.get('artwork');
  if (!(artwork instanceof File)) {
    return { ok: false, message: 'artwork must be a file' };
  }
  if (artwork.size === 0) {
    return { ok: false, message: 'artwork is empty' };
  }

  const itemRaw = formData.get('item');
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

  const fieldsRaw: RenderCardMultipartFieldsRaw = {
    cardLayout: getFormString(formData, 'cardLayout'),
    sideLayoutFlow: getFormString(formData, 'sideLayoutFlow'),
    cardStyle: getFormString(formData, 'cardStyle'),
    imageFramePreset: getFormString(formData, 'imageFramePreset'),
    pixelRatio: formData.get('pixelRatio'),
    format: getFormString(formData, 'format'),
  };

  const fieldsResult = renderCardMultipartFieldsSchema.safeParse(fieldsRaw);
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
    fields: fieldsResult.data,
    item: itemResult.data,
  };
}
