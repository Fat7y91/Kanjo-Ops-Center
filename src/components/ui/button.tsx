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
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600/40 disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-purple-700 text-white shadow-md shadow-purple-900/20 hover:bg-purple-800 active:scale-[0.98]",
  quiet:
    "border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)] hover:border-[color:var(--line-strong)] hover:bg-[color:var(--surface-soft)]",
  danger:
    "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20",
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
 * Every actionable control in the app should render through this component so
 * focus, disabled and hover behaviour stay identical across modules.
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
