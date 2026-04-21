'use client';

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import type { SelectionOption } from '../lib/workbench-options';

interface ToolbarSelectFieldProps<TValue extends string> {
  fieldDescription?: string;
  fieldLabel: string;
  labelClassName?: string;
  options: ReadonlyArray<SelectionOption<TValue>>;
  triggerId: string;
  value: TValue;
  onValueChange: (value: TValue) => void;
}

interface ToggleFieldProps<TValue extends string> {
  fieldDescription?: string;
  fieldLabel: string;
  labelHidden?: boolean;
  options: ReadonlyArray<SelectionOption<TValue>>;
  value: TValue;
  disabled?: boolean;
  onValueChange: (value: TValue) => void;
}

export function ToolbarSelectField<TValue extends string>({
  fieldDescription,
  fieldLabel,
  labelClassName,
  options,
  triggerId,
  value,
  onValueChange,
}: ToolbarSelectFieldProps<TValue>) {
  return (
    <Field>
      <FieldLabel htmlFor={triggerId} className={labelClassName}>
        {fieldLabel}
      </FieldLabel>
      {fieldDescription ? (
        <FieldDescription>{fieldDescription}</FieldDescription>
      ) : null}
      <Select
        items={options}
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue) {
            onValueChange(nextValue as TValue);
          }
        }}
      >
        <SelectTrigger id={triggerId} className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ToggleField<TValue extends string>({
  fieldDescription,
  fieldLabel,
  labelHidden = false,
  options,
  value,
  disabled = false,
  onValueChange,
}: ToggleFieldProps<TValue>) {
  return (
    <Field>
      {labelHidden ? (
        <FieldLabel className="sr-only">{fieldLabel}</FieldLabel>
      ) : (
        <FieldLabel>{fieldLabel}</FieldLabel>
      )}
      {fieldDescription ? (
        <FieldDescription>{fieldDescription}</FieldDescription>
      ) : null}
      <ToggleGroup
        className="w-full flex-wrap"
        value={[value]}
        variant="outline"
        onValueChange={(nextValue) => {
          if (disabled) {
            return;
          }

          const nextSelectedValue = nextValue[0];

          if (nextSelectedValue) {
            onValueChange(nextSelectedValue as TValue);
          }
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className="flex-1"
            disabled={disabled}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
