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
    "text-[color:var(--ink)] data-[focus]:bg-purple-50 data-[focus]:text-purple-800 dark:data-[focus]:bg-purple-500/15 dark:data-[focus]:text-purple-100",
  danger:
    "text-red-700 data-[focus]:bg-red-50 data-[focus]:text-red-800 dark:text-red-300 dark:data-[focus]:bg-red-500/15 dark:data-[focus]:text-red-100",
};

/**
 * Branded Headless UI menu.
 *
 * The trigger keeps an explicit foreground in every state, so opening the menu
 * can never pair a light surface with light text. The panel and its items share
 * the same rounded geometry and a soft floating shadow.
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
          "inline-flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3.5 py-1.5 text-xs font-semibold leading-none text-[color:var(--ink)] transition duration-150 ease-out",
          "hover:border-[color:var(--line-strong)] hover:bg-[color:var(--surface-soft)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600/40",
          "data-[open]:border-purple-700 data-[open]:bg-purple-800 data-[open]:text-white data-[open]:shadow-md",
          "active:border-purple-800 active:bg-purple-900 active:text-white",
          "dark:data-[open]:border-purple-500 dark:data-[open]:bg-purple-600 dark:data-[open]:text-white",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          buttonClassName,
        )}
      >
        {label}
      </MenuButton>

      <MenuItems
        transition
        anchor={align === "end" ? "bottom end" : "bottom start"}
        className="z-50 w-48 origin-top [--anchor-gap:6px] rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-1.5 shadow-lg shadow-slate-900/10 ring-1 ring-black/[0.03] transition duration-200 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 dark:border-white/10 dark:shadow-black/50 dark:ring-white/[0.04]"
      >
        {items.map((item) => (
          <MenuItem
            key={item.id}
            as="button"
            type="button"
            disabled={item.disabled}
            onClick={item.onSelect}
            className={cx(
              "flex w-full items-center gap-2 rounded-lg px-3.5 py-2 text-end text-sm font-medium transition duration-150 ease-out",
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
