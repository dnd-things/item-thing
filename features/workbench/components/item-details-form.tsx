'use client';

import { type Control, Controller, type FieldErrors } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

export interface ItemDetailsFormPersistenceProps {
  onPersistSave: () => void;
  onPersistLoad: () => void | Promise<void>;
  isPersistenceLoadPending: boolean;
  persistSaveButtonTitle?: string | undefined;
}

interface ItemDetailsFormProps {
  control: Control<WorkbenchItemDetailsFormValues>;
  formErrors: FieldErrors<WorkbenchItemDetailsFormValues>;
  trigger: (name?: keyof WorkbenchItemDetailsFormValues) => Promise<boolean>;
  persistence: ItemDetailsFormPersistenceProps | undefined;
}

export function ItemDetailsForm({
  control,
  formErrors,
  trigger,
  persistence,
}: ItemDetailsFormProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="font-display text-lg tracking-wide text-foreground/70">
            Item Details
          </CardTitle>
          <div className="mt-2 h-px w-full bg-linear-to-r from-primary/20 via-primary/8 to-transparent" />
        </div>
        {persistence ? (
          <CardAction className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={persistence.onPersistSave}
              title={persistence.persistSaveButtonTitle}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={persistence.isPersistenceLoadPending}
              aria-busy={persistence.isPersistenceLoadPending}
              onClick={() => {
                void persistence.onPersistLoad();
              }}
            >
              Load
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
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
              </Field>
              <Field>
                <FieldLabel htmlFor="item-image">Image *</FieldLabel>
                <Controller
                  control={control}
                  name="imageFile"
                  render={({ field }) => (
                    <Input
                      id="item-image"
                      type="file"
                      accept="image/*"
                      aria-invalid={Boolean(formErrors.imageFile)}
                      aria-required
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0] ?? undefined;
                        field.onChange(nextFile);
                        void trigger('imageFile');
                      }}
                    />
                  )}
                />
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
              </Field>
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
