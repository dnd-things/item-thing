'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseFormReturn, useForm } from 'react-hook-form';
import {
  getImageRightVerticalPositionDefaultForFixedSideLayout,
  imageRightVerticalPositionDefaultForFluidSideLayout,
  isCardStyleSupported,
  isMinimalCardStyle,
} from '@/features/card-renderer/lib/card-renderer-options';
import {
  DownloadControlsCard,
  type ItemExportCompletePayload,
} from './components/download-controls-card';
import { ItemDetailsForm } from './components/item-details-form';
import { PreviewColumn } from './components/preview-column';
import { usePersistItemExport } from './lib/use-persist-item-export';
import {
  type WorkbenchItemDetailsFormValues,
  workbenchItemDetailsSchema,
} from './lib/workbench-form-schema';
import {
  defaultMagicItemWorkbenchState,
  type MagicItemWorkbenchState,
} from './lib/workbench-options';
import {
  dataUrlToFile,
  loadMagicItemWorkbenchStateFromLocalStorage,
  saveMagicItemWorkbenchStateToLocalStorage,
} from './lib/workbench-persistence';
import { toWorkbenchSnapshotForExport } from './lib/workbench-snapshot-for-export';

const WORKBENCH_AUTOSAVE_DEBOUNCE_MS = 400 as const;

interface ImagePreviewData {
  previewUrl: string;
  aspectRatio: number;
}

async function readFileAsDataUrl(imageFile: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onerror = () => {
      reject(new Error('Failed to read image file.'));
    };

    fileReader.onload = () => {
      if (typeof fileReader.result === 'string') {
        resolve(fileReader.result);
        return;
      }

      reject(new Error('Image preview did not produce a data URL.'));
    };

    fileReader.readAsDataURL(imageFile);
  });
}

async function readImageAspectRatio(previewUrl: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const image = new Image();

    image.onerror = () => {
      reject(new Error('Failed to read image dimensions.'));
    };

    image.onload = () => {
      const hasValidDimensions =
        image.naturalWidth > 0 && image.naturalHeight > 0;

      if (!hasValidDimensions) {
        reject(new Error('Image dimensions are invalid.'));
        return;
      }

      resolve(image.naturalWidth / image.naturalHeight);
    };

    image.src = previewUrl;
  });
}

async function readImagePreviewData(
  imageFile: File,
): Promise<ImagePreviewData> {
  const previewUrl = await readFileAsDataUrl(imageFile);
  const aspectRatio = await readImageAspectRatio(previewUrl);
  return { previewUrl, aspectRatio };
}

async function imageFileFromPersistedWorkbenchState(
  loaded: MagicItemWorkbenchState,
): Promise<File | undefined> {
  if (loaded.imagePreviewUrl.trim() === '') {
    return undefined;
  }

  try {
    return await dataUrlToFile(loaded.imagePreviewUrl, loaded.imageFileName);
  } catch {
    return undefined;
  }
}

interface HydrateWorkbenchFromLocalStorageParams {
  form: UseFormReturn<WorkbenchItemDetailsFormValues>;
  setWorkbenchState: Dispatch<SetStateAction<MagicItemWorkbenchState>>;
  isApplyingPersistenceLoadRef: MutableRefObject<boolean>;
}

async function hydrateWorkbenchFromLocalStorage(
  params: HydrateWorkbenchFromLocalStorageParams,
  shouldAbort: () => boolean,
): Promise<void> {
  const loaded = loadMagicItemWorkbenchStateFromLocalStorage();
  if (!loaded) {
    return;
  }

  params.isApplyingPersistenceLoadRef.current = true;

  const nextImageFile = await imageFileFromPersistedWorkbenchState(loaded);

  if (shouldAbort()) {
    return;
  }

  params.form.reset({
    itemName: loaded.itemName,
    classificationAndRarity: loaded.classificationAndRarity,
    requiresAttunement: loaded.requiresAttunement,
    flavorDescription: loaded.flavorDescription,
    mechanicalDescription: loaded.mechanicalDescription,
    imageFile: nextImageFile,
  });
  params.setWorkbenchState(loaded);
}

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
  const [restorationComplete, setRestorationComplete] = useState(false);
  const persistItemExport = usePersistItemExport();
  const imageReadRequestIdRef = useRef(0);
  const isApplyingPersistenceLoadRef = useRef(false);
  const previewStateRef = useRef<MagicItemWorkbenchState>(
    defaultMagicItemWorkbenchState,
  );
  const cardRef = useRef<HTMLDivElement>(null);

  const form = useForm<WorkbenchItemDetailsFormValues>({
    resolver: zodResolver(workbenchItemDetailsSchema),
    defaultValues: formDefaultValues,
  });

  const formValues = form.watch();
  const imageFile = formValues.imageFile;

  useEffect(() => {
    let cancelled = false;

    void hydrateWorkbenchFromLocalStorage(
      {
        form,
        setWorkbenchState,
        isApplyingPersistenceLoadRef,
      },
      () => cancelled,
    ).finally(() => {
      if (!cancelled) {
        setRestorationComplete(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [form]);

  useEffect(() => {
    if (!imageFile) {
      if (isApplyingPersistenceLoadRef.current) {
        isApplyingPersistenceLoadRef.current = false;
        return;
      }
      setWorkbenchState((previousState) => ({
        ...previousState,
        imageFileName: '',
        imagePreviewUrl: '',
      }));
      return;
    }

    isApplyingPersistenceLoadRef.current = false;

    const nextImageReadRequestId = imageReadRequestIdRef.current + 1;
    imageReadRequestIdRef.current = nextImageReadRequestId;

    void readImagePreviewData(imageFile).then(
      ({ previewUrl, aspectRatio }) => {
        if (imageReadRequestIdRef.current !== nextImageReadRequestId) return;
        setWorkbenchState((previousState) => ({
          ...previousState,
          imageFileName: imageFile.name,
          imagePreviewUrl: previewUrl,
          resolvedImageAspectRatio: aspectRatio,
        }));
      },
      () => {
        if (imageReadRequestIdRef.current !== nextImageReadRequestId) return;
        setWorkbenchState((previousState) => ({
          ...previousState,
          imageFileName: imageFile.name,
          imagePreviewUrl: '',
        }));
      },
    );
  }, [imageFile]);

  const { imageFile: _imageFile, ...formValuesForPreview } = formValues;
  const previewState: MagicItemWorkbenchState = {
    ...workbenchState,
    ...formValuesForPreview,
  };

  previewStateRef.current = previewState;

  // biome-ignore lint/correctness/useExhaustiveDependencies: workbenchState covers preview-only controls; form.watch only fires for form fields.
  useEffect(() => {
    if (!restorationComplete) {
      return;
    }

    let timeoutId: number | undefined;

    const scheduleAutosave = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        const result = saveMagicItemWorkbenchStateToLocalStorage(
          previewStateRef.current,
        );
        if (!result.success) {
          console.warn(
            result.reason === 'quota'
              ? 'Workbench autosave: not enough browser storage.'
              : 'Workbench autosave: could not write to browser storage.',
          );
        }
      }, WORKBENCH_AUTOSAVE_DEBOUNCE_MS);
    };

    const subscription = form.watch(() => {
      scheduleAutosave();
    });

    scheduleAutosave();

    return () => {
      subscription.unsubscribe();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [form, restorationComplete, workbenchState]);

  const setWorkbenchField = useCallback(
    <TKey extends keyof MagicItemWorkbenchState>(
      fieldName: TKey,
      fieldValue: MagicItemWorkbenchState[TKey],
    ) => {
      setWorkbenchState((previousState) => {
        const nextState: MagicItemWorkbenchState = {
          ...previousState,
          [fieldName]: fieldValue,
        };

        if (fieldName === 'cardLayout' && fieldValue === 'image-right') {
          if (previousState.sideLayoutFlow === 'fixed') {
            nextState.imageRightVerticalPosition =
              getImageRightVerticalPositionDefaultForFixedSideLayout(
                previousState.classificationAndRarity,
              );
          } else if (previousState.sideLayoutFlow === 'fluid') {
            nextState.imageRightVerticalPosition =
              imageRightVerticalPositionDefaultForFluidSideLayout;
          }
        }

        if (fieldName === 'sideLayoutFlow') {
          if (
            fieldValue === 'fixed' &&
            previousState.cardLayout === 'image-right'
          ) {
            nextState.imageRightVerticalPosition =
              getImageRightVerticalPositionDefaultForFixedSideLayout(
                previousState.classificationAndRarity,
              );
          } else if (
            fieldValue === 'fluid' &&
            previousState.cardLayout === 'image-right'
          ) {
            nextState.imageRightVerticalPosition =
              imageRightVerticalPositionDefaultForFluidSideLayout;
          }
        }

        if (
          fieldName === 'cardStyle' &&
          isMinimalCardStyle(fieldValue as MagicItemWorkbenchState['cardStyle'])
        ) {
          nextState.cardLayout = 'vertical';
          nextState.sideLayoutFlow = 'fixed';
        }

        return nextState;
      });
    },
    [],
  );

  const canDownload = isCardStyleSupported(workbenchState.cardStyle);

  const handleBeforeDownload = useCallback(async () => {
    const formValid = await form.trigger();
    return formValid;
  }, [form]);

  const handleExportComplete = useCallback(
    (payload: ItemExportCompletePayload) => {
      void persistItemExport({
        workbenchSnapshot: toWorkbenchSnapshotForExport(
          previewStateRef.current,
        ),
        sourceImagePreviewDataUrl: previewStateRef.current.imagePreviewUrl,
        exportFormat: payload.exportFormat,
        exportPixelRatio: payload.exportPixelRatio,
      }).catch((error: unknown) => {
        console.error('Failed to persist export to Convex', error);
      });
    },
    [persistItemExport],
  );

  return (
    <div className="flex w-full flex-col gap-6">
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
            setWorkbenchField={setWorkbenchField}
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
          onExportComplete={handleExportComplete}
        />
      </div>
    </div>
  );
}
