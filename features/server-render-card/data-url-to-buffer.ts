export interface DataUrlToBufferResult {
  mimeType: string;
  buffer: Buffer;
}

export function dataUrlToBuffer(dataUrl: string): DataUrlToBufferResult {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  const mimeType = match?.[1];
  const base64Payload = match?.[2];
  if (mimeType === undefined || base64Payload === undefined) {
    throw new Error('invalid_data_url');
  }
  return { mimeType, buffer: Buffer.from(base64Payload, 'base64') };
}
