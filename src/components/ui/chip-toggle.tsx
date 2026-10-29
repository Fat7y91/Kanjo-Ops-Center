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
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[color:var(--kanjo-field-border)] bg-[color:var(--kanjo-surface)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] transition duration-200 ease-out hover:border-[color:var(--kanjo-focus-ring-strong)] hover:text-[color:var(--kanjo-purple-interactive)] data-[checked]:border-[color:var(--kanjo-purple-interactive)] data-[checked]:bg-[color:var(--kanjo-purple-interactive)] data-[checked]:text-white data-[checked]:shadow-[var(--shadow-sm)] data-[focus]:outline-none data-[focus]:ring-4 data-[focus]:ring-[color:var(--kanjo-focus-ring)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
        className,
      )}
      {...props}
    >
      {label}
    </HeadlessCheckbox>
  );
}
