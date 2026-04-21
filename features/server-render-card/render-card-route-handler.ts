import { after, NextResponse } from 'next/server';
import type { SupportedStyleCapability } from '@/features/workbench/lib/card-style-capability-registry';
import { serverLogger } from '@/lib/server-logger';

import { getConvexDeploymentUrl } from './get-convex-deployment-url';
import { getRequestBaseUrl } from './get-request-base-url';
import { mapRenderRequestToMagicItemWorkbenchState } from './map-render-request-to-workbench-state';
import { persistCardExportToConvex } from './persist-card-export-to-convex';
import { parseRenderCardMultipartFormData } from './render-card-form-schema';
import {
  getApiSecretOrThrow,
  getInternalSecretOrThrow,
  isApiRequestAuthorizedBySecret,
} from './render-card-secret-auth';
import { runPuppeteerCardExport } from './run-puppeteer-card-export';

export async function handleRenderCardRoute(
  request: Request,
  style: SupportedStyleCapability,
) {
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

  const parsed = await parseRenderCardMultipartFormData(formData, style);
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
    ReturnType<typeof mapRenderRequestToMagicItemWorkbenchState<typeof style>>
  >;
  try {
    mapped = await mapRenderRequestToMagicItemWorkbenchState({
      artworkBuffer: parsed.artworkBuffer,
      artworkFileName: parsed.artwork.name,
      fields: parsed.fields,
      item: parsed.item,
      style,
    });
  } catch {
    return NextResponse.json(
      { error: 'artwork_processing_failed' },
      { status: 400 },
    );
  }

  const baseUrl = getRequestBaseUrl(request);
  const sharedFields = parsed.fields as {
    format: 'png' | 'jpg';
    pixelRatio: 1 | 2;
  };
  const { format, pixelRatio } = sharedFields;

  try {
    serverLogger.info({ style }, 'running puppeteer card export');
    const result = await runPuppeteerCardExport({
      baseUrl,
      internalSecret,
      payload: {
        state: mapped.workbenchState,
        format,
        pixelRatio,
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
          exportFormat: format,
          exportPixelRatio: pixelRatio,
          sourceArtworkBuffer: parsed.artworkBuffer,
          sourceMimeType: mapped.sourceMimeType,
          workbenchState: mapped.workbenchState,
        });
      } catch (error) {
        serverLogger.error(
          { err: error, style },
          'persistCardExportToConvex failed',
        );
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
