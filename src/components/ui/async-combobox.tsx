"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import type { ReactNode } from "react";

import { Field } from "@/components/ui/form-inputs";

export type AsyncComboboxOption = {
  value: string;
  label: string;
  hint?: string;
  image?: string | null;
};

export type AsyncComboboxProps = {
  id?: string;
  value: string;
  options: AsyncComboboxOption[];
  onValueChange: (value: string) => void;
  onSelect: (option: AsyncComboboxOption) => void;
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  placeholder?: string;
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  noResultsLabel?: string;
  disabled?: boolean;
  renderLeading?: (option: AsyncComboboxOption) => ReactNode;
};

const CONTROL =
  "block w-full rounded-[var(--radius-control)] border-0 bg-[color:var(--surface-soft)] px-3.5 py-2.5 text-sm text-[color:var(--ink)] ring-1 ring-inset ring-[color:var(--kanjo-field-border)] transition duration-200 ease-out placeholder:text-[color:var(--ink-soft)] hover:ring-[color:var(--kanjo-focus-ring-strong)] focus:bg-[color:var(--kanjo-surface)] focus:outline-none focus:ring-4 focus:ring-[color:var(--kanjo-focus-ring)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55";

const PANEL =
  "z-[100] max-h-72 w-[var(--input-width)] min-w-[18rem] overflow-auto rounded-[var(--radius-lg)] border-0 bg-[color:var(--kanjo-surface)] p-1.5 shadow-[var(--shadow-lg)] ring-1 ring-[color:var(--line)] transition duration-200 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0";

const OPTION =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm text-[color:var(--ink)] transition duration-150 ease-out data-[focus]:bg-[color:var(--kanjo-pastel)] data-[focus]:text-[color:var(--kanjo-pastel-ink)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45";

/**
 * Async autocomplete that keeps free text while offering remote suggestions.
 *
 * Headless UI owns keyboard navigation and the option panel. The caller owns
 * debouncing and fetching, so the same control can search merchants, catalog
 * references or any other paginated source without duplicating ARIA work.
 * The input value is never replaced by an option unless the caller chooses to.
 */
export function AsyncCombobox({
  id,
  value,
  options,
  onValueChange,
  onSelect,
  label,
  hint,
  required = false,
  placeholder,
  loading = false,
  loadingLabel = "جارٍ البحث…",
  emptyLabel,
  noResultsLabel = "لا نتائج مطابقة.",
  disabled = false,
  renderLeading,
}: AsyncComboboxProps) {
  const control = (
    <Combobox<AsyncComboboxOption | null>
      value={null}
      onChange={(option: AsyncComboboxOption | null) => {
        if (option) onSelect(option);
      }}
      by={(left, right) => left?.value === right?.value}
      disabled={disabled}
      immediate
    >
      <ComboboxInput
        id={id}
        className={`${CONTROL} h-11`}
        displayValue={() => value}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        onChange={(event) => onValueChange(event.target.value)}
      />

      <ComboboxOptions anchor="bottom start" transition className={PANEL}>
        {loading ? (
          <p className="px-3 py-2 text-sm text-[color:var(--ink-soft)]">
            {loadingLabel}
          </p>
        ) : options.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[color:var(--ink-soft)]">
            {value.trim().length < 2 && emptyLabel ? emptyLabel : noResultsLabel}
          </p>
        ) : (
          options.map((option) => (
            <ComboboxOption
              key={option.value}
              value={option}
              className={OPTION}
            >
              {renderLeading?.(option)}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-bold">{option.label}</span>
                {option.hint ? (
                  <span className="truncate text-[0.7rem] font-normal text-[color:var(--ink-soft)]">
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </ComboboxOption>
          ))
        )}
      </ComboboxOptions>
    </Combobox>
  );

  if (!label && !hint) return control;

  return (
    <Field label={label} hint={hint} required={required} htmlFor={id}>
      {control}
    </Field>
  );
}
