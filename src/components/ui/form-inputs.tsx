"use client";

import {
  Checkbox as HeadlessCheckbox,
  Input as HeadlessInput,
  Label as HeadlessLabel,
  Switch as HeadlessSwitch,
  Textarea as HeadlessTextarea,
  type CheckboxProps,
  type InputProps,
  type SwitchProps,
  type TextareaProps,
} from "@headlessui/react";
import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

const CONTROL =
  "block w-full rounded-xl border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3.5 py-2.5 text-sm text-[color:var(--ink)] transition duration-150 ease-out placeholder:text-[color:var(--ink-soft)] focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/25 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55";

export type FieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

/** Label + hint wrapper shared by every form control. */
export function Field({
  label,
  hint,
  required = false,
  htmlFor,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <HeadlessLabel
          htmlFor={htmlFor}
          className="text-[0.78rem] font-bold text-[color:var(--ink)]"
        >
          {label}
          {required ? (
            <span className="ms-1 text-[0.66rem] font-bold text-red-600">
              مطلوب
            </span>
          ) : null}
        </HeadlessLabel>
      ) : null}
      {children}
      {hint ? (
        <span className="text-[0.72rem] text-[color:var(--ink-soft)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Bare Kanjo input for layouts that own their own label/row. */
export function InputControl({ className, ...props }: InputProps) {
  return <HeadlessInput className={cx(CONTROL, className)} {...props} />;
}

/** Bare Kanjo textarea for layouts that own their own label/row. */
export function TextareaControl({ className, ...props }: TextareaProps) {
  return <HeadlessTextarea className={cx(CONTROL, className)} {...props} />;
}

export type TextFieldProps = InputProps & {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  fieldClassName?: string;
};

export function TextField({
  label,
  hint,
  required,
  fieldClassName,
  className,
  id,
  ...props
}: TextFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      required={required}
      htmlFor={id}
      className={fieldClassName}
    >
      <HeadlessInput
        id={id}
        className={cx(CONTROL, "h-11", className)}
        {...props}
      />
    </Field>
  );
}

export type TextAreaFieldProps = TextareaProps & {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  fieldClassName?: string;
};

export function TextAreaField({
  label,
  hint,
  required,
  fieldClassName,
  className,
  id,
  ...props
}: TextAreaFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      required={required}
      htmlFor={id}
      className={fieldClassName}
    >
      <HeadlessTextarea
        id={id}
        className={cx(CONTROL, "min-h-[76px] resize-y", className)}
        {...props}
      />
    </Field>
  );
}

export type CheckboxFieldProps = CheckboxProps & {
  label: ReactNode;
  hint?: ReactNode;
};

export function CheckboxField({
  label,
  hint,
  className,
  ...props
}: CheckboxFieldProps) {
  return (
    <HeadlessLabel className="flex cursor-pointer items-start gap-2.5">
      <HeadlessCheckbox
        className={cx(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-white transition duration-150 ease-out data-[checked]:border-purple-700 data-[checked]:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600/40 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
          className,
        )}
        {...props}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 opacity-0 data-[checked]:opacity-100"
          aria-hidden="true"
        >
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      </HeadlessCheckbox>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[color:var(--ink)]">
          {label}
        </span>
        {hint ? (
          <span className="text-[0.72rem] text-[color:var(--ink-soft)]">
            {hint}
          </span>
        ) : null}
      </span>
    </HeadlessLabel>
  );
}

export type ToggleFieldProps = SwitchProps & {
  label: ReactNode;
  hint?: ReactNode;
};

export function ToggleField({
  label,
  hint,
  className,
  ...props
}: ToggleFieldProps) {
  return (
    <HeadlessSwitch.Group
      as="div"
      className="flex items-center justify-between gap-4"
    >
      <span className="flex flex-col gap-0.5">
        <HeadlessSwitch.Label className="text-sm font-semibold text-[color:var(--ink)]">
          {label}
        </HeadlessSwitch.Label>
        {hint ? (
          <HeadlessSwitch.Description className="text-[0.72rem] text-[color:var(--ink-soft)]">
            {hint}
          </HeadlessSwitch.Description>
        ) : null}
      </span>
      <HeadlessSwitch
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-[color:var(--line-strong)] transition duration-200 ease-out data-[checked]:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600/40 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
          className,
        )}
        {...props}
      >
        <span className="inline-block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition duration-200 ease-out data-[checked]:translate-x-[1.375rem]" />
      </HeadlessSwitch>
    </HeadlessSwitch.Group>
  );
}
