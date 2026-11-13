'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { isCardStyleSupported } from '@/features/card-renderer/lib/card-renderer-options';
import { readArtworkLimitError } from '@/lib/artwork-limit-error';
import {
  DownloadControlsCard,
  type ItemExportCompletePayload,
} from './components/download-controls-card';
import { ItemDetailsForm } from './components/item-details-form';
import { PreviewColumn } from './components/preview-column';
import {
  createArtworkReadGate,
  isAbortError,
  markPreparedFile,
} from './lib/artwork-source';
import { editWorkbench, type WorkbenchEdit } from './lib/edit-workbench';
import type { CapturedCardExport } from './lib/export-card-artwork';
import {
  preparedArtworkBundle,
  readPreparedArtwork,
} from './lib/read-image-preview-data';
import { usePersistItemExport } from './lib/use-persist-item-export';
import { bindWorkbenchFormAutosave } from './lib/workbench-form-autosave';
import {
  type WorkbenchItemDetailsFormValues,
  workbenchItemDetailsSchema,
} from './lib/workbench-form-schema';
import {
  defaultMagicItemWorkbenchState,
  type MagicItemWorkbenchState,
} from './lib/workbench-options';
import { readBlobAsDataUrl } from './lib/workbench-persistence';
import {
  createBrowserWorkbenchPersistenceSession,
  type WorkbenchPersistenceSession,
  workbenchPersistenceCopy,
} from './lib/workbench-persistence-session';
import { toWorkbenchSnapshotForExport } from './lib/workbench-snapshot-for-export';

const formDefaultValues: WorkbenchItemDetailsFormValues = {
  itemName: defaultMagicItemWorkbenchState.itemName,
  imageFile: undefined,
  classificationAndRarity:
    defaultMagicItemWorkbenchState.classificationAndRarity,
  requiresAttunement: defaultMagicItemWorkbenchState.requiresAttunement,
  flavorDescription: defaultMagicItemWorkbenchState.flavorDescription,
  mechanicalDescription: defaultMagicItemWorkbenchState.mechanicalDescription,
};

interface ItemCardWorkbenchProps {
  showAdvancedWorkbenchControls: boolean;
}

export function ItemCardWorkbench({
  showAdvancedWorkbenchControls,
}: ItemCardWorkbenchProps) {
  const [workbenchState, setWorkbenchState] = useState<MagicItemWorkbenchState>(
    defaultMagicItemWorkbenchState,
  );
  const [persistencePhase, setPersistencePhase] = useState<
    'loading' | 'settled'
  >('loading');
  const [persistenceMessage, setPersistenceMessage] = useState<string | null>(
    null,
  );
  const [hydrationEpoch, setHydrationEpoch] = useState(0);
  const [artworkLogical, setArtworkLogical] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const { persistItemExport, captureReuseOwnership } = usePersistItemExport(
    workbenchState.imagePreviewUrl,
  );
  const sessionRef = useRef<WorkbenchPersistenceSession | null>(null);
  const hydrationFileRef = useRef<File | undefined | null>(null);
  const previewStateRef = useRef<MagicItemWorkbenchState>(
    defaultMagicItemWorkbenchState,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const artworkReader = useRef(
    createArtworkReadGate((file, isCancelled) =>
      readPreparedArtwork(file, { isCancelled }),
    ),
  );

  const form = useForm<WorkbenchItemDetailsFormValues>({
    resolver: zodResolver(workbenchItemDetailsSchema),
    defaultValues: formDefaultValues,
  });

  const formValues = form.watch();
  const imageFile = formValues.imageFile;

  useEffect(() => {
    let cancelled = false;
    const session = createBrowserWorkbenchPersistenceSession();
    sessionRef.current = session;
    const unsubscribe = session.subscribe(() => {
      if (cancelled) {
        return;
      }
      const hydration = session.takeHydration();
      if (hydration) {
        hydrationFileRef.current = hydration.imageFile;
        form.reset({
          itemName: hydration.state.itemName,
          classificationAndRarity: hydration.state.classificationAndRarity,
          requiresAttunement: hydration.state.requiresAttunement,
          flavorDescription: hydration.state.flavorDescription,
          mechanicalDescription: hydration.state.mechanicalDescription,
          imageFile: hydration.imageFile,
        });
        const restored = session.captureArtwork();
        setArtworkLogical(
          restored
            ? { width: restored.crop.width, height: restored.crop.height }
            : null,
        );
        setWorkbenchState(hydration.state);
        setHydrationEpoch((value) => value + 1);
      }
      setPersistenceMessage(session.getNotice());
    });
    session.start();
    return () => {
      cancelled = true;
      unsubscribe();
      session.dispose();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, [form]);

  useEffect(() => {
    if (
      hydrationEpoch === 0 ||
      hydrationFileRef.current === null ||
      persistencePhase === 'settled'
    ) {
      return;
    }
    const expectedFile = hydrationFileRef.current;
    if (expectedFile instanceof File && imageFile !== expectedFile) {
      return;
    }
    setPersistencePhase('settled');
  }, [hydrationEpoch, imageFile, persistencePhase]);

  useEffect(() => {
    if (persistencePhase !== 'settled') {
      return;
    }
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    const watch = session.beginImageWatch(imageFile);
    let cancelled = false;
    if (watch.kind === 'clear') {
      setArtworkLogical(null);
      setWorkbenchState((previousState) => ({
        ...previousState,
        imageFileName: '',
        imagePreviewUrl: '',
      }));
      session.commitClear({
        ...previewStateRef.current,
        imageFileName: '',
        imagePreviewUrl: '',
      });
    } else if (watch.kind === 'prepare' && imageFile) {
      const selectedFile = imageFile;
      setArtworkLogical(null);
      setWorkbenchState((previousState) => ({
        ...previousState,
        imageFileName: '',
        imagePreviewUrl: '',
      }));
      void artworkReader.current
        .submit(selectedFile, () => cancelled)
        .then(async (prepared) => {
          if (cancelled) {
            return;
          }
          const previewUrl = await readBlobAsDataUrl(prepared.previewBlob);
          if (cancelled) {
            return;
          }
          const accepted = session.acceptPreview(watch.id, {
            file: markPreparedFile(selectedFile),
            previewUrl,
            aspectRatio: prepared.aspectRatio,
            bundle: preparedArtworkBundle(prepared),
          });
          if (!accepted || cancelled) {
            return;
          }
          setArtworkLogical({
            width: prepared.crop.width,
            height: prepared.crop.height,
          });
          setWorkbenchState((previousState) => ({
            ...previousState,
            imageFileName: selectedFile.name,
            imagePreviewUrl: previewUrl,
            resolvedImageAspectRatio: prepared.aspectRatio,
          }));
        })
        .catch((error: unknown) => {
          if (cancelled || isAbortError(error)) {
            return;
          }
          session.failPreview(watch.id, readArtworkLimitError(error)?.message);
        });
    }
    return () => {
      cancelled = true;
      session.cancelImageWatch(watch.id);
    };
  }, [imageFile, persistencePhase]);

  const { imageFile: _imageFile, ...formValuesForPreview } = formValues;
  const previewState: MagicItemWorkbenchState = {
    ...workbenchState,
    ...formValuesForPreview,
  };

  previewStateRef.current = previewState;

  // biome-ignore lint/correctness/useExhaustiveDependencies: workbenchState covers preview-only controls; form.watch only fires for form fields.
  useEffect(() => {
    if (persistencePhase !== 'settled') {
      return;
    }
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    const autosave = bindWorkbenchFormAutosave({
      watch: (callback) => form.watch(callback),
      getRenderedState: () => previewStateRef.current,
      scheduleSnapshot: (state) => {
        session.scheduleSnapshot(state);
      },
      onScheduled: () => {
        setPersistenceMessage(session.getNotice());
      },
    });
    autosave.scheduleRendered();

    return () => {
      autosave.unsubscribe();
      session.cancelDebounce();
    };
  }, [form, persistencePhase, workbenchState]);

  const onWorkbenchEdit = useCallback((edit: WorkbenchEdit) => {
    setWorkbenchState((previousState) =>
      editWorkbench(previousState, previewStateRef.current, edit),
    );
  }, []);

  const previewReadyForFile =
    !(imageFile instanceof File) ||
    workbenchState.imagePreviewUrl.trim() !== '';
  const canDownload =
    isCardStyleSupported(workbenchState.cardStyle) && previewReadyForFile;

  const handleBeforeDownload = useCallback(async () => {
    const formValid = await form.trigger();
    return formValid;
  }, [form]);

  const captureExport = useCallback(
    (input: {
      format: 'png' | 'jpg';
      pixelRatio: 1 | 2;
    }): CapturedCardExport => {
      const state = { ...previewStateRef.current };
      return {
        state,
        snapshot: toWorkbenchSnapshotForExport(state),
        format: input.format,
        pixelRatio: input.pixelRatio,
        bundle: sessionRef.current?.captureArtwork() ?? null,
        reuseEpoch: captureReuseOwnership(),
      };
    },
    [captureReuseOwnership],
  );

  const handleExportComplete = useCallback(
    (payload: ItemExportCompletePayload) => {
      void persistItemExport({
        workbenchSnapshot: payload.workbenchSnapshot,
        sourceImagePreviewDataUrl: payload.sourceImagePreviewDataUrl,
        exportFormat: payload.exportFormat,
        exportPixelRatio: payload.exportPixelRatio,
        reuseEpoch: payload.reuseEpoch,
      }).catch((error: unknown) => {
        console.error('Failed to persist export to Convex', error);
      });
    },
    [persistItemExport],
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {persistencePhase === 'loading' ? (
        <p
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="text-sm text-muted-foreground"
        >
          {workbenchPersistenceCopy.loading}
        </p>
      ) : (
        <>
          {persistenceMessage ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              {persistenceMessage}
            </p>
          ) : null}
          <div className="grid auto-rows-fr gap-6 xl:grid-cols-[minmax(340px,2fr)_3fr]">
            <div data-print-hide className="animate-entrance">
              <ItemDetailsForm
                control={form.control}
                formErrors={form.formState.errors}
                trigger={form.trigger}
              />
            </div>
            <div className="animate-entrance animate-entrance-delay-1">
              <PreviewColumn
                cardRef={cardRef}
                showAdvancedWorkbenchControls={showAdvancedWorkbenchControls}
                workbenchState={previewState}
                onWorkbenchEdit={onWorkbenchEdit}
                {...(artworkLogical
                  ? {
                      artworkLogicalWidth: artworkLogical.width,
                      artworkLogicalHeight: artworkLogical.height,
                    }
                  : {})}
              />
            </div>
          </div>

          <div
            data-print-hide
            className="animate-entrance animate-entrance-delay-2"
          >
            <DownloadControlsCard
              cardRef={cardRef}
              getItemName={() => form.getValues('itemName')}
              disabled={!canDownload}
              onBeforeDownload={handleBeforeDownload}
              captureExport={captureExport}
              onExportComplete={handleExportComplete}
            />
          </div>
        </>
      )}
    </div>
  );
}
