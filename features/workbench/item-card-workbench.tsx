'use client';

import { useCallback, useRef, useState } from 'react';
import { ItemDetailsForm } from './components/item-details-form';
import { ItemPreviewPanel } from './components/item-preview-panel';
import { WorkbenchControlsPanel } from './components/workbench-controls-panel';
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

export function ItemCardWorkbench() {
  const [workbenchState, setWorkbenchState] = useState<MagicItemWorkbenchState>(
    defaultMagicItemWorkbenchState,
  );
  const imageReadRequestIdRef = useRef(0);

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

  return (
    <div className="flex w-full flex-col gap-6">
      <WorkbenchControlsPanel
        setWorkbenchField={setWorkbenchField}
        workbenchState={workbenchState}
      />

      <div className="grid auto-rows-fr gap-6 xl:grid-cols-2">
        <ItemDetailsForm
          setImageFile={setImageFile}
          setWorkbenchField={setWorkbenchField}
          workbenchState={workbenchState}
        />
        <ItemPreviewPanel workbenchState={workbenchState} />
      </div>
    </div>
  );
}
