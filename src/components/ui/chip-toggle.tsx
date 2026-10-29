"use client";

import {
  Checkbox as HeadlessCheckbox,
  type CheckboxProps,
} from "@headlessui/react";

import { cx } from "@/components/ui/cx";

export type ChipToggleProps = CheckboxProps & {
  label: string;
};

/**
 * Multi-select option chip.
 *
 * A Headless UI checkbox dressed as a pill: the taxonomy matrix needs a large
 * tap target, but the semantics are still "toggle this option on/off", not a
 * one-shot button.
 */
export function ChipToggle({ label, className, ...props }: ChipToggleProps) {
  return (
    <HeadlessCheckbox
      className={cx(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] transition duration-150 ease-out data-[checked]:border-purple-700 data-[checked]:bg-purple-700 data-[checked]:text-white data-[focus]:outline-none data-[focus]:ring-2 data-[focus]:ring-purple-600/40 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
        className,
      )}
      {...props}
    >
      {label}
    </HeadlessCheckbox>
  );
}
