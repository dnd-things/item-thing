import type { MagicItemWorkbenchState } from '@/features/workbench/lib/workbench-options';

export interface CardExportBrowserPayload {
  state: MagicItemWorkbenchState;
  format: 'png' | 'jpg';
  pixelRatio: 1 | 2;
}
