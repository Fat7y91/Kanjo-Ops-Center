"use client";

import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  type MenuButtonProps,
} from "@headlessui/react";
import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

export type DropdownMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  icon?: ReactNode;
};

export type DropdownMenuProps = {
  label: ReactNode;
  items: DropdownMenuItem[];
  align?: "start" | "end";
  buttonClassName?: string;
  buttonProps?: Omit<MenuButtonProps, "children" | "className">;
  className?: string;
};

const ITEM_TONE: Record<"default" | "danger", string> = {
  default:
    "text-[color:var(--ink)] hover:bg-[color:var(--kanjo-pastel)] hover:text-[color:var(--kanjo-pastel-ink)] data-[focus]:bg-[color:var(--kanjo-pastel)] data-[focus]:text-[color:var(--kanjo-pastel-ink)]",
  danger:
    "text-[color:var(--red)] hover:bg-[color:var(--red-soft)] data-[focus]:bg-[color:var(--red-soft)] data-[focus]:text-[color:var(--red)]",
};

/**
 * Branded Headless UI menu.
 *
 * The trigger keeps an explicit foreground in every state: hover and open both
 * paint the interactive purple with white text, so the label never disappears
 * into a white surface. The panel and its items share soft rounded geometry.
 */
export function DropdownMenu({
  label,
  items,
  align = "end",
  buttonClassName,
  buttonProps,
  className,
}: DropdownMenuProps) {
  return (
    <Menu as="div" className={cx("relative inline-block text-start", className)}>
      <MenuButton
        {...buttonProps}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--kanjo-surface)] px-3.5 py-1.5 text-xs font-bold leading-none text-[color:var(--ink)] transition duration-200 ease-out",
          "hover:border-[color:var(--kanjo-purple-interactive)] hover:bg-[color:var(--kanjo-interactive-hover)] hover:text-white",
          "data-[hover]:border-[color:var(--kanjo-purple-interactive)] data-[hover]:bg-[color:var(--kanjo-interactive-hover)] data-[hover]:text-white",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)]",
          "data-[open]:border-[color:var(--kanjo-interactive-active)] data-[open]:bg-[color:var(--kanjo-interactive-active)] data-[open]:text-white data-[open]:shadow-[var(--shadow-md)]",
          "active:bg-[color:var(--kanjo-interactive-active)] active:text-white",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          buttonClassName,
        )}
      >
        {label}
      </MenuButton>

      <MenuItems
        transition
        anchor={align === "end" ? "bottom end" : "bottom start"}
        className="z-[100] w-48 origin-top [--anchor-gap:6px] rounded-2xl border border-[color:var(--line)] bg-[color:var(--kanjo-surface)] p-1.5 shadow-[var(--shadow-lg)] ring-1 ring-[color:var(--kanjo-focus-ring)] transition duration-200 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0"
      >
        {items.map((item) => (
          <MenuItem
            key={item.id}
            as="button"
            type="button"
            disabled={item.disabled}
            onClick={item.onSelect}
            className={cx(
              "flex w-full items-center gap-2 rounded-lg px-3.5 py-2 text-end text-sm font-semibold transition duration-150 ease-out",
              "focus:outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45",
              ITEM_TONE[item.tone ?? "default"],
            )}
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
