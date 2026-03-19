'use client';

import { z } from 'zod';

export const workbenchItemDetailsSchema = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  classificationAndRarity: z
    .string()
    .min(1, 'Classification and rarity is required'),
  requiresAttunement: z.boolean(),
  flavorDescription: z.string(),
  mechanicalDescription: z
    .string()
    .min(1, 'Mechanical description is required'),
});

export type WorkbenchItemDetailsFormValues = z.infer<
  typeof workbenchItemDetailsSchema
>;
