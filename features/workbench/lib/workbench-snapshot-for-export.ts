import type { MagicItemWorkbenchState } from './workbench-options';

export type WorkbenchSnapshotForExport = Omit<
  MagicItemWorkbenchState,
  'imagePreviewUrl'
>;

export function toWorkbenchSnapshotForExport(
  state: MagicItemWorkbenchState,
): WorkbenchSnapshotForExport {
  const { imagePreviewUrl: _imagePreviewUrl, ...rest } = state;
  return rest;
}
