import { after, NextResponse } from 'next/server';

import { getConvexDeploymentUrl } from '@/features/server-render-card/get-convex-deployment-url';
import { getRequestBaseUrl } from '@/features/server-render-card/get-request-base-url';
import { mapRenderRequestToMagicItemWorkbenchState } from '@/features/server-render-card/map-render-request-to-workbench-state';
import { persistCardExportToConvex } from '@/features/server-render-card/persist-card-export-to-convex';
import { parseRenderCardMultipartFormData } from '@/features/server-render-card/render-card-form-schema';
import {
  getApiSecretOrThrow,
  getInternalSecretOrThrow,
  isApiRequestAuthorizedBySecret,
} from '@/features/server-render-card/render-card-secret-auth';
import { runPuppeteerCardExport } from '@/features/server-render-card/run-puppeteer-card-export';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let apiSecret: string;
  let internalSecret: string;
  try {
    apiSecret = getApiSecretOrThrow();
    internalSecret = getInternalSecretOrThrow();
  } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  if (!isApiRequestAuthorizedBySecret(request, apiSecret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const convexUrl = getConvexDeploymentUrl();
  if (convexUrl === undefined) {
    return NextResponse.json({ error: 'convex_unconfigured' }, { status: 503 });
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

  let mapped: Awaited<
    ReturnType<typeof mapRenderRequestToMagicItemWorkbenchState>
  >;
  try {
    mapped = await mapRenderRequestToMagicItemWorkbenchState({
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

  const baseUrl = getRequestBaseUrl(request);

  try {
    console.log('[api/render-card]', 'running puppeteer card export');
    const result = await runPuppeteerCardExport({
      baseUrl,
      internalSecret,
      payload: {
        state: mapped.workbenchState,
        format: parsed.fields.format,
        pixelRatio: parsed.fields.pixelRatio,
      },
    });

    const response = new NextResponse(new Uint8Array(result.body), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'no-store',
      },
    });

    after(async () => {
      try {
        await persistCardExportToConvex({
          convexUrl,
          exportFormat: parsed.fields.format,
          exportPixelRatio: parsed.fields.pixelRatio,
          sourceArtworkBuffer: parsed.artworkBuffer,
          sourceMimeType: mapped.sourceMimeType,
          workbenchState: mapped.workbenchState,
        });
      } catch (error) {
        console.error('persistCardExportToConvex failed', error);
      }
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'render_failed', message },
      { status: 500 },
    );
  }
}
