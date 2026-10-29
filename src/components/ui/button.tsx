"use client";

import {
  Button as HeadlessButton,
  type ButtonProps as HeadlessButtonProps,
} from "@headlessui/react";

import { cx } from "@/components/ui/cx";

export type ButtonVariant = "primary" | "quiet" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

export type ButtonProps = HeadlessButtonProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

/** Interactive purple is the only colour allowed on primary actions. */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-[color:var(--kanjo-purple-interactive)] text-white shadow-[var(--shadow-md)] hover:bg-[color:var(--kanjo-interactive-hover)] active:scale-[0.98] active:bg-[color:var(--kanjo-interactive-active)]",
  quiet:
    "border border-[color:var(--line)] bg-[color:var(--kanjo-surface)] text-[color:var(--ink)] hover:border-[color:var(--kanjo-purple-interactive)] hover:bg-[color:var(--kanjo-pastel)] hover:text-[color:var(--kanjo-pastel-ink)]",
  danger:
    "bg-[color:var(--red-soft)] text-[color:var(--red)] hover:bg-red-100 dark:hover:bg-red-500/20",
  ghost:
    "bg-transparent text-[color:var(--ink-soft)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

/**
 * Kanjo button primitive.
 *
 * Every actionable control in the app renders through this component so the
 * interactive purple, soft geometry and focus ring stay identical everywhere.
 * Primary uses `--kanjo-purple-interactive` (#6D28D9); headings and shell
 * backgrounds own `--kanjo-purple-base` (#230535) instead.
 */
export function Button({
  variant = "quiet",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <HeadlessButton
      type={type}
      className={cx(BASE, VARIANT[variant], SIZE[size], className)}
      {...props}
    />
  );
}
