'use client';

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

import type {
  MagicItemWorkbenchState,
  WorkbenchFieldSetter,
} from '../lib/workbench-options';

interface ItemDetailsFormProps {
  setImageFile: (imageFile: File | null) => Promise<void> | void;
  setWorkbenchField: WorkbenchFieldSetter;
  workbenchState: MagicItemWorkbenchState;
}

export function ItemDetailsForm({
  setImageFile,
  setWorkbenchField,
  workbenchState,
}: ItemDetailsFormProps) {
  return (
    <Card className="h-full border border-border/60 bg-card/65 backdrop-blur-sm">
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="item-name">Item name</FieldLabel>
                <Input
                  id="item-name"
                  placeholder="Moonlit Compass"
                  value={workbenchState.itemName}
                  onChange={(event) => {
                    setWorkbenchField('itemName', event.target.value);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-image">Image</FieldLabel>
                <Input
                  id="item-image"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const nextImageFile = event.target.files?.[0] ?? null;
                    void setImageFile(nextImageFile);
                  }}
                />
                <FieldDescription>
                  Optional source artwork for the future exported card.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="classification-and-rarity">
                  Classification and rarity
                </FieldLabel>
                <Input
                  id="classification-and-rarity"
                  placeholder="Wondrous item, rare"
                  value={workbenchState.classificationAndRarity}
                  onChange={(event) => {
                    setWorkbenchField(
                      'classificationAndRarity',
                      event.target.value,
                    );
                  }}
                />
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="requires-attunement"
                  checked={workbenchState.requiresAttunement}
                  onCheckedChange={(checked) => {
                    setWorkbenchField('requiresAttunement', Boolean(checked));
                  }}
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
                <Textarea
                  id="flavor-description"
                  placeholder="A sentence or two that sells the fiction."
                  className="min-h-32"
                  value={workbenchState.flavorDescription}
                  onChange={(event) => {
                    setWorkbenchField('flavorDescription', event.target.value);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mechanical-description">
                  Mechanical description
                </FieldLabel>
                <Textarea
                  id="mechanical-description"
                  placeholder="Explain the rules text, charges, and edge cases."
                  className="min-h-40"
                  value={workbenchState.mechanicalDescription}
                  onChange={(event) => {
                    setWorkbenchField(
                      'mechanicalDescription',
                      event.target.value,
                    );
                  }}
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
