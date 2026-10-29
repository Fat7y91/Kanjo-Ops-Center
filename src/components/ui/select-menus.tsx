"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { useState, type ReactNode } from "react";

import { cx } from "@/components/ui/cx";
import { Field } from "@/components/ui/form-inputs";

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
};

const TRIGGER =
  "flex w-full items-center justify-between gap-2 rounded-xl border border-[color:var(--kanjo-field-border)] bg-[color:var(--kanjo-surface)] px-3.5 py-2.5 text-start text-sm text-[color:var(--ink)] shadow-[var(--shadow-sm)] transition duration-200 ease-out hover:border-[color:var(--kanjo-focus-ring-strong)] focus-visible:border-[color:var(--kanjo-purple-interactive)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55 data-[open]:border-[color:var(--kanjo-purple-interactive)]";

const PANEL =
  "z-50 max-h-64 w-[var(--button-width)] overflow-auto rounded-2xl border border-[color:var(--line)] bg-[color:var(--kanjo-surface)] p-1.5 shadow-[var(--shadow-lg)] transition duration-200 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0";

const OPTION =
  "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-[color:var(--ink)] transition duration-150 ease-out data-[focus]:bg-[color:var(--kanjo-pastel)] data-[focus]:text-[color:var(--kanjo-pastel-ink)] data-[selected]:font-bold data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45";

export type SelectMenuProps<T extends string | number> = {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
};

/**
 * Kanjo single-select built on Headless UI `Listbox`.
 *
 * Replaces native `<select>` so the option panel can carry brand styling,
 * hints and dark-mode tokens while keeping full keyboard support.
 */
export function SelectMenu<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = "اختر…",
  disabled = false,
  label,
  hint,
  required,
  className,
}: SelectMenuProps<T>) {
  const current = options.find((option) => option.value === value);

  const control = (
    <Listbox
      value={value ?? undefined}
      onChange={(next: T) => onChange(next)}
      disabled={disabled}
      by={(left, right) => left === right}
    >
      <ListboxButton className={TRIGGER}>
        <span className={current ? undefined : "text-[color:var(--ink-soft)]"}>
          {current?.label ?? placeholder}
        </span>
        <svg
          viewBox="0 0 16 16"
          className="size-4 shrink-0 text-[color:var(--ink-soft)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </ListboxButton>

      <ListboxOptions anchor="bottom start" transition className={PANEL}>
        {options.map((option) => (
          <ListboxOption
            key={String(option.value)}
            value={option.value}
            disabled={option.disabled}
            className={OPTION}
          >
            <span className="flex flex-col gap-0.5">
              <span>{option.label}</span>
              {option.hint ? (
                <span className="text-[0.7rem] font-normal text-[color:var(--ink-soft)]">
                  {option.hint}
                </span>
              ) : null}
            </span>
            <svg
              viewBox="0 0 16 16"
              className="size-3.5 text-[color:var(--kanjo-purple-interactive)] opacity-0 data-[selected]:opacity-100"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 8.5 6.5 12 13 4.5" />
            </svg>
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );

  if (!label && !hint) return <div className={className}>{control}</div>;

  return (
    <Field label={label} hint={hint} required={required} className={className}>
      {control}
    </Field>
  );
}

export type ComboFieldProps<T extends string | number> = {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
};

/**
 * Kanjo searchable combobox built on Headless UI `Combobox`.
 *
 * The query is local state so the filtered list resets when the panel closes;
 * matching itself stays with the caller-provided option list.
 */
export function ComboField<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = "ابحث…",
  disabled = false,
  label,
  hint,
  required,
  className,
}: ComboFieldProps<T>) {
  const [query, setQuery] = useState("");
  const current = options.find((option) => option.value === value);

  const filtered =
    query === ""
      ? options
      : options.filter((option) =>
          option.label.toLowerCase().includes(query.trim().toLowerCase()),
        );

  const control = (
    <Combobox
      value={value}
      onChange={(next: T | null) => {
        if (next !== null) onChange(next);
      }}
      disabled={disabled}
      by={(left, right) => left === right}
      onClose={() => setQuery("")}
    >
      <div className="relative">
        <ComboboxInput
          className={cx(TRIGGER, "pe-9")}
          displayValue={() => current?.label ?? ""}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        <svg
          viewBox="0 0 16 16"
          className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-[color:var(--ink-soft)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </div>

      <ComboboxOptions anchor="bottom start" transition className={PANEL}>
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[color:var(--ink-soft)]">
            لا نتائج مطابقة.
          </p>
        ) : (
          filtered.map((option) => (
            <ComboboxOption
              key={String(option.value)}
              value={option.value}
              disabled={option.disabled}
              className={OPTION}
            >
              <span className="flex flex-col gap-0.5">
                <span>{option.label}</span>
                {option.hint ? (
                  <span className="text-[0.7rem] font-normal text-[color:var(--ink-soft)]">
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

  if (!label && !hint) return <div className={className}>{control}</div>;

  return (
    <Field label={label} hint={hint} required={required} className={className}>
      {control}
    </Field>
  );
}
