'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { isCardStyleSupported } from '@/features/card-renderer/lib/card-renderer-options';
import { DownloadControlsCard } from './components/download-controls-card';
import { ItemDetailsForm } from './components/item-details-form';
import { PreviewColumn } from './components/preview-column';
import { useWorkbenchPersistenceControlsVisible } from './lib/use-workbench-persistence-controls-visible';
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

const formDefaultValues: WorkbenchItemDetailsFormValues = {
  itemName: defaultMagicItemWorkbenchState.itemName,
  imageFile: undefined,
  classificationAndRarity:
    defaultMagicItemWorkbenchState.classificationAndRarity,
  requiresAttunement: defaultMagicItemWorkbenchState.requiresAttunement,
  flavorDescription: defaultMagicItemWorkbenchState.flavorDescription,
  mechanicalDescription: defaultMagicItemWorkbenchState.mechanicalDescription,
};

export function ItemCardWorkbench() {
  const [workbenchState, setWorkbenchState] = useState<MagicItemWorkbenchState>(
    defaultMagicItemWorkbenchState,
  );
  const [persistSaveButtonTitle, setPersistSaveButtonTitle] = useState<
    string | undefined
  >(undefined);
  const [isPersistenceLoadPending, setIsPersistenceLoadPending] =
    useState(false);
  const persistenceControlsVisible = useWorkbenchPersistenceControlsVisible();
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

  const setWorkbenchField = useCallback(
    <TKey extends keyof MagicItemWorkbenchState>(
      fieldName: TKey,
      fieldValue: MagicItemWorkbenchState[TKey],
    ) => {
      setWorkbenchState((previousState) => ({
        ...previousState,
        [fieldName]: fieldValue,
      }));
    },
    [],
  );

  const canDownload = isCardStyleSupported(workbenchState.cardStyle);

  const handleBeforeDownload = useCallback(async () => {
    const formValid = await form.trigger();
    return formValid;
  }, [form]);

  const handlePersistSave = useCallback(() => {
    const result = saveMagicItemWorkbenchStateToLocalStorage(
      previewStateRef.current,
    );
    if (!result.success) {
      setPersistSaveButtonTitle(
        result.reason === 'quota'
          ? 'Not enough browser storage for this snapshot.'
          : 'Could not save to browser storage.',
      );
      return;
    }
    setPersistSaveButtonTitle(undefined);
  }, []);

  const handlePersistLoad = useCallback(async () => {
    setIsPersistenceLoadPending(true);
    try {
      const loaded = loadMagicItemWorkbenchStateFromLocalStorage();
      if (!loaded) {
        return;
      }

      isApplyingPersistenceLoadRef.current = true;

      let imageFile: File | undefined;
      if (loaded.imagePreviewUrl.trim() !== '') {
        try {
          imageFile = await dataUrlToFile(
            loaded.imagePreviewUrl,
            loaded.imageFileName,
          );
        } catch {
          imageFile = undefined;
        }
      }

      form.reset({
        itemName: loaded.itemName,
        classificationAndRarity: loaded.classificationAndRarity,
        requiresAttunement: loaded.requiresAttunement,
        flavorDescription: loaded.flavorDescription,
        mechanicalDescription: loaded.mechanicalDescription,
        imageFile,
      });
      setWorkbenchState(loaded);
      setPersistSaveButtonTitle(undefined);
    } finally {
      setIsPersistenceLoadPending(false);
    }
  }, [form]);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="grid auto-rows-fr gap-6 xl:grid-cols-[minmax(340px,2fr)_3fr]">
        <div data-print-hide className="animate-entrance">
          <ItemDetailsForm
            control={form.control}
            formErrors={form.formState.errors}
            trigger={form.trigger}
            persistence={
              persistenceControlsVisible
                ? {
                    onPersistSave: handlePersistSave,
                    onPersistLoad: handlePersistLoad,
                    isPersistenceLoadPending,
                    persistSaveButtonTitle,
                  }
                : undefined
            }
          />
        </div>
        <div className="animate-entrance animate-entrance-delay-1">
          <PreviewColumn
            cardRef={cardRef}
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
        />
      </div>
    </div>
  );
}
