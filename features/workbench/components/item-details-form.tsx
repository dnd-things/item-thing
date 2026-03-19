'use client';

import { type Control, Controller, type FieldErrors } from 'react-hook-form';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import type { WorkbenchItemDetailsFormValues } from '../lib/workbench-form-schema';

interface ItemDetailsFormProps {
  control: Control<WorkbenchItemDetailsFormValues>;
  formErrors: FieldErrors<WorkbenchItemDetailsFormValues>;
  dirtyFields: Partial<Record<keyof WorkbenchItemDetailsFormValues, boolean>>;
  setImageFile: (imageFile: File | null) => Promise<void> | void;
  imageDirty: boolean;
  imageError: string | null;
}

export function ItemDetailsForm({
  control,
  formErrors,
  dirtyFields,
  setImageFile,
  imageDirty,
  imageError,
}: ItemDetailsFormProps) {
  return (
    <Card className="h-full border border-border/60 bg-card/65 backdrop-blur-sm">
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="item-name">Item name *</FieldLabel>
                <Controller
                  control={control}
                  name="itemName"
                  render={({ field }) => (
                    <Input
                      id="item-name"
                      placeholder="Moonlit Compass"
                      aria-invalid={Boolean(formErrors.itemName)}
                      aria-required
                      {...field}
                    />
                  )}
                />
                {dirtyFields.itemName && formErrors.itemName?.message ? (
                  <p className="text-sm text-destructive">
                    {formErrors.itemName.message}
                  </p>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="item-image">Image *</FieldLabel>
                <Input
                  id="item-image"
                  type="file"
                  accept="image/*"
                  aria-invalid={Boolean(imageError)}
                  aria-required
                  onChange={(event) => {
                    const nextImageFile = event.target.files?.[0] ?? null;
                    void setImageFile(nextImageFile);
                  }}
                />
                {imageDirty && imageError ? (
                  <p className="text-sm text-destructive">{imageError}</p>
                ) : null}
                <FieldDescription>
                  Source artwork for the exported card.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="classification-and-rarity">
                  Classification and rarity *
                </FieldLabel>
                <Controller
                  control={control}
                  name="classificationAndRarity"
                  render={({ field }) => (
                    <Input
                      id="classification-and-rarity"
                      placeholder="Wondrous item, rare"
                      aria-invalid={Boolean(formErrors.classificationAndRarity)}
                      aria-required
                      {...field}
                    />
                  )}
                />
                {dirtyFields.classificationAndRarity &&
                formErrors.classificationAndRarity?.message ? (
                  <p className="text-sm text-destructive">
                    {formErrors.classificationAndRarity.message}
                  </p>
                ) : null}
              </Field>
              <Field orientation="horizontal">
                <Controller
                  control={control}
                  name="requiresAttunement"
                  render={({ field }) => (
                    <Checkbox
                      id="requires-attunement"
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(Boolean(checked));
                      }}
                    />
                  )}
                />
                <FieldContent>
                  <FieldLabel htmlFor="requires-attunement">
                    Requires attunement
                  </FieldLabel>
                  <FieldDescription>
                    Shows a badge in the preview shell for now.
                  </FieldDescription>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="flavor-description">
                  Flavor description
                </FieldLabel>
                <Controller
                  control={control}
                  name="flavorDescription"
                  render={({ field }) => (
                    <Textarea
                      id="flavor-description"
                      placeholder="A sentence or two that sells the fiction."
                      className="min-h-32"
                      {...field}
                    />
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mechanical-description">
                  Mechanical description *
                </FieldLabel>
                <Controller
                  control={control}
                  name="mechanicalDescription"
                  render={({ field }) => (
                    <Textarea
                      id="mechanical-description"
                      placeholder="Explain the rules text, charges, and edge cases."
                      className="min-h-40"
                      aria-invalid={Boolean(formErrors.mechanicalDescription)}
                      aria-required
                      {...field}
                    />
                  )}
                />
                {dirtyFields.mechanicalDescription &&
                formErrors.mechanicalDescription?.message ? (
                  <p className="text-sm text-destructive">
                    {formErrors.mechanicalDescription.message}
                  </p>
                ) : null}
              </Field>
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
