import type { Id } from '@/convex/_generated/dataModel';

export async function uploadBlobToConvexStorage(
  uploadUrl: string,
  blob: Blob,
): Promise<Id<'_storage'>> {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Convex storage upload failed: ${response.status}`);
  }

  const json = (await response.json()) as { storageId: Id<'_storage'> };
  return json.storageId;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}
