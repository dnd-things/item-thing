import { NextResponse } from 'next/server';

import { mapRenderRequestToMagicItemWorkbenchState } from '@/features/server-render-card/map-render-request-to-workbench-state';
import { parseRenderCardMultipartFormData } from '@/features/server-render-card/render-card-form-schema';

export const runtime = 'nodejs';

function isRenderCardRequestAuthorized(request: Request): boolean {
  const secret = process.env.RENDER_CARD_SECRET;
  if (secret === undefined || secret.length === 0) {
    return false;
  }
  const authorization = request.headers.get('authorization');
  const bearer = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  const headerSecret = request.headers.get('x-render-card-secret');
  return bearer === secret || headerSecret === secret;
}

export async function POST(request: Request) {
  if (!isRenderCardRequestAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const parsed = await parseRenderCardMultipartFormData(formData);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: 'validation_failed',
        message: parsed.message,
        details: parsed.details,
      },
      { status: 400 },
    );
  }

  try {
    await mapRenderRequestToMagicItemWorkbenchState({
      artworkBuffer: parsed.artworkBuffer,
      artworkFileName: parsed.artwork.name,
      fields: parsed.fields,
      item: parsed.item,
    });
  } catch {
    return NextResponse.json(
      { error: 'artwork_processing_failed' },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: 'not_implemented',
      message:
        'Card image rendering is not wired yet; validation and state mapping succeeded.',
    },
    { status: 501 },
  );
}
