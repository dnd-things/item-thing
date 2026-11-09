'use client';

import { useAction, useConvex, useMutation } from 'convex/react';
import { useCallback, useEffect, useRef } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

import {
  type PreviewReuseSlot,
  persistExportWithPreviewReuse,
  releasePreviewReuseSlot,
  syncPreviewReuseSlotOnArtworkChange,
} from './persist-item-export-with-source-reuse';
import {
  dataUrlToBlob,
  uploadBlobToConvexStorage,
} from './upload-blob-to-convex-storage';
import type { WorkbenchSnapshotForExport } from './workbench-snapshot-for-export';

export interface PersistItemExportParams {
  workbenchSnapshot: WorkbenchSnapshotForExport;
  sourceImagePreviewDataUrl: string;
  exportFormat: 'png' | 'jpg';
  exportPixelRatio: 1 | 2;
}

export function usePersistItemExport(sourceImagePreviewDataUrl: string) {
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.itemExports.generateUploadUrl);
  const createItemExport = useMutation(api.itemExports.createItemExport);
  const optimizeSourceImage = useAction(
    api.optimizeSourceImage.optimizeSourceImage,
  );
  const slotRef = useRef<PreviewReuseSlot>(null);
  const artworkPresentRef = useRef(false);

  useEffect(() => {
    syncPreviewReuseSlotOnArtworkChange(
      slotRef,
      artworkPresentRef,
      sourceImagePreviewDataUrl,
    );
  }, [sourceImagePreviewDataUrl]);

  useEffect(() => {
    const slot = slotRef;
    return () => {
      releasePreviewReuseSlot(slot);
    };
  }, []);

  return useCallback(
    (params: PersistItemExportParams) =>
      persistExportWithPreviewReuse(slotRef, params, {
        prepare: async (dataUrl) => {
          const discovered = await convex.query(
            api.itemExports.getSourceReuseStatus,
            {},
          );
          const uploadUrl = await generateUploadUrl();
          const sourceBlob = await dataUrlToBlob(dataUrl);
          const rawStorageId = await uploadBlobToConvexStorage(
            uploadUrl,
            sourceBlob,
          );
          const storageId = await optimizeSourceImage({
            sourceStorageId: rawStorageId,
            mimeType: sourceBlob.type !== '' ? sourceBlob.type : 'image/png',
            expectedOptimizerVersion: discovered.optimizerVersion,
          });
          return {
            storageId,
            optimizerVersion: discovered.optimizerVersion,
          };
        },
        validate: (prepared) =>
          convex.query(api.itemExports.getSourceReuseStatus, {
            storageId: prepared.storageId as Id<'_storage'>,
            optimizerVersion: prepared.optimizerVersion,
          }),
        insert: async (record) => {
          const sourceImageStorageId = record.sourceImageStorageId;
          const sourceOptimizerVersion = record.sourceOptimizerVersion;
          await createItemExport({
            workbenchSnapshot: record.workbenchSnapshot,
            exportFormat: record.exportFormat,
            exportPixelRatio: record.exportPixelRatio,
            ...(sourceImageStorageId !== undefined &&
            sourceOptimizerVersion !== undefined
              ? {
                  sourceImageStorageId: sourceImageStorageId as Id<'_storage'>,
                  sourceOptimizerVersion,
                }
              : {}),
          });
        },
      }),
    [convex, createItemExport, generateUploadUrl, optimizeSourceImage],
  );
}
