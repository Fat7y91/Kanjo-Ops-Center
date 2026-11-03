"use client";

import {
  Button as HeadlessButton,
  type ButtonProps as HeadlessButtonProps,
} from "@headlessui/react";

import { cx } from "@/components/ui/cx";

export type ButtonVariant = "primary" | "quiet" | "danger" | "ghost" | "accent";
export type ButtonSize = "sm" | "md";

export type ButtonProps = HeadlessButtonProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-bold transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

/** Interactive purple is the only colour allowed on primary actions. */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-[image:var(--gradient-primary)] text-white shadow-[0_8px_22px_-12px_rgba(35,5,53,0.7)] hover:brightness-110 active:scale-[0.98]",
  quiet:
    "border-0 bg-[color:var(--surface-soft)] text-[color:var(--kanjo-purple-base)] hover:bg-[color:var(--kanjo-pastel)] hover:text-[color:var(--kanjo-pastel-ink)]",
  danger:
    "border-0 bg-[color:var(--red-soft)] text-[color:var(--red)] hover:bg-red-100 dark:hover:bg-red-500/20",
  ghost:
    "border-0 bg-transparent text-[color:var(--ink-soft)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--ink)]",
  accent:
    "border-0 bg-[color:var(--orange-soft)] text-[color:var(--orange-deep)] hover:bg-[color:var(--kanjo-orange-soft)] active:scale-[0.98]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

/**
 * Kanjo button primitive.
 *
 * Every actionable control in the app renders through this component so the
 * interactive purple, control radius and focus ring stay identical everywhere.
 * Primary uses `--kanjo-purple-interactive` (#6C35B6); headings and shell
 * backgrounds own `--kanjo-purple-base` (#230535) instead. Controls are
 * borderless by design: elevation and background carry the affordance, so no
 * variant introduces a 1px outline.
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
