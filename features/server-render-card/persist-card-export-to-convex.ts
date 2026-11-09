import { ConvexHttpClient } from 'convex/browser';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { uploadBlobToConvexStorage } from '@/features/workbench/lib/upload-blob-to-convex-storage';
import type { MagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';
import { toWorkbenchSnapshotForExport } from '@/features/workbench/lib/workbench-snapshot-for-export';

import {
  persistArtworkExport,
  sourceArtworkReuseCache,
} from './source-artwork-reuse';

export interface PersistCardExportToConvexParams {
  convexUrl: string;
  exportFormat: 'jpg' | 'png';
  exportPixelRatio: 1 | 2;
  sourceArtworkBuffer: Buffer;
  sourceMimeType: string;
  workbenchState: MagicItemWorkbenchState;
}

export async function persistCardExportToConvex(
  params: PersistCardExportToConvexParams,
): Promise<void> {
  const client = new ConvexHttpClient(params.convexUrl);
  const workbenchSnapshot = toWorkbenchSnapshotForExport(params.workbenchState);
  const sourceMime =
    params.sourceMimeType.trim() !== '' ? params.sourceMimeType : 'image/png';

  await persistArtworkExport({
    cache: sourceArtworkReuseCache,
    convexUrl: params.convexUrl,
    sourceBytes: params.sourceArtworkBuffer,
    snapshot: workbenchSnapshot,
    exportFormat: params.exportFormat,
    exportPixelRatio: params.exportPixelRatio,
    prepare: async () => {
      const discovered = await client.query(
        api.itemExports.getSourceReuseStatus,
        {},
      );
      const uploadUrl = await client.mutation(
        api.itemExports.generateUploadUrl,
        {},
      );
      const sourceBlob = new Blob(
        [new Uint8Array(params.sourceArtworkBuffer)],
        {
          type: sourceMime,
        },
      );
      const rawSourceStorageId = await uploadBlobToConvexStorage(
        uploadUrl,
        sourceBlob,
      );
      const storageId = await client.action(
        api.optimizeSourceImage.optimizeSourceImage,
        {
          mimeType: sourceMime,
          sourceStorageId: rawSourceStorageId,
          expectedOptimizerVersion: discovered.optimizerVersion,
        },
      );
      return {
        storageId,
        optimizerVersion: discovered.optimizerVersion,
      };
    },
    validate: (prepared) =>
      client.query(api.itemExports.getSourceReuseStatus, {
        storageId: prepared.storageId as Id<'_storage'>,
        optimizerVersion: prepared.optimizerVersion,
      }),
    insert: async (record) => {
      await client.mutation(api.itemExports.createItemExport, {
        exportFormat: record.exportFormat,
        exportPixelRatio: record.exportPixelRatio,
        sourceImageStorageId: record.sourceImageStorageId as Id<'_storage'>,
        sourceOptimizerVersion: record.sourceOptimizerVersion,
        workbenchSnapshot: record.snapshot,
      });
    },
  });
}
