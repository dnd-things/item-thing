'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { isCardStyleSupported } from '@/features/card-renderer/lib/card-renderer-options';
import { DownloadControlsCard } from './components/download-controls-card';
import { ItemDetailsForm } from './components/item-details-form';
import { ItemPreviewPanel } from './components/item-preview-panel';
import { WorkbenchControlsPanel } from './components/workbench-controls-panel';
import {
  type WorkbenchItemDetailsFormValues,
  workbenchItemDetailsSchema,
} from './lib/workbench-form-schema';
import {
  defaultMagicItemWorkbenchState,
  type MagicItemWorkbenchState,
} from './lib/workbench-options';

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

const formDefaultValues: WorkbenchItemDetailsFormValues = {
  itemName: defaultMagicItemWorkbenchState.itemName,
  classificationAndRarity:
    defaultMagicItemWorkbenchState.classificationAndRarity,
  requiresAttunement: defaultMagicItemWorkbenchState.requiresAttunement,
  flavorDescription: defaultMagicItemWorkbenchState.flavorDescription,
  mechanicalDescription: defaultMagicItemWorkbenchState.mechanicalDescription,
};

const imageRequiredError = 'Image is required';

export function ItemCardWorkbench() {
  const [workbenchState, setWorkbenchState] = useState<MagicItemWorkbenchState>(
    defaultMagicItemWorkbenchState,
  );
  const [imageDirty, setImageDirty] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageReadRequestIdRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const form = useForm<WorkbenchItemDetailsFormValues>({
    resolver: zodResolver(workbenchItemDetailsSchema),
    defaultValues: formDefaultValues,
  });

  const formValues = form.watch();
  const previewState: MagicItemWorkbenchState = {
    ...workbenchState,
    ...formValues,
  };

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

  const setImageFile = useCallback(async (imageFile: File | null) => {
    setImageDirty(true);
    if (imageFile) setImageError(null);

    const nextImageReadRequestId = imageReadRequestIdRef.current + 1;
    imageReadRequestIdRef.current = nextImageReadRequestId;

    if (!imageFile) {
      setWorkbenchState((previousState) => ({
        ...previousState,
        imageFileName: '',
        imagePreviewUrl: '',
      }));
      return;
    }

    try {
      const nextImagePreviewUrl = await readFileAsDataUrl(imageFile);

      if (imageReadRequestIdRef.current !== nextImageReadRequestId) {
        return;
      }

      setWorkbenchState((previousState) => ({
        ...previousState,
        imageFileName: imageFile.name,
        imagePreviewUrl: nextImagePreviewUrl,
      }));
    } catch {
      if (imageReadRequestIdRef.current !== nextImageReadRequestId) {
        return;
      }

      setWorkbenchState((previousState) => ({
        ...previousState,
        imageFileName: imageFile.name,
        imagePreviewUrl: '',
      }));
    }
  }, []);

  const canDownload = isCardStyleSupported(workbenchState.cardStyle);

  const handleBeforeDownload = useCallback(async () => {
    const formValid = await form.trigger();
    if (!formValid) return false;
    if (!workbenchState.imagePreviewUrl) {
      setImageError(imageRequiredError);
      setImageDirty(true);
      return false;
    }
    setImageError(null);
    return true;
  }, [form, workbenchState.imagePreviewUrl]);

  return (
    <div className="flex w-full flex-col gap-6">
      <WorkbenchControlsPanel
        setWorkbenchField={setWorkbenchField}
        workbenchState={workbenchState}
      />

      <div className="grid auto-rows-fr gap-6 xl:grid-cols-2">
        <ItemDetailsForm
          control={form.control}
          formErrors={form.formState.errors}
          dirtyFields={form.formState.dirtyFields}
          setImageFile={setImageFile}
          imageDirty={imageDirty}
          imageError={imageError}
        />
        <ItemPreviewPanel cardRef={cardRef} workbenchState={previewState} />
      </div>

      <DownloadControlsCard
        cardRef={cardRef}
        getItemName={() => form.getValues('itemName')}
        disabled={!canDownload}
        onBeforeDownload={handleBeforeDownload}
      />
    </div>
  );
}
