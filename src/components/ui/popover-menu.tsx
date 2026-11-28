"use client";

import {
  Popover,
  PopoverButton,
  PopoverPanel,
  type PopoverButtonProps,
} from "@headlessui/react";
import type { ReactElement, ReactNode } from "react";

import { cx } from "@/components/ui/cx";

export type PopoverMenuProps = {
  /** Trigger content (an icon, an icon plus label, …). */
  trigger: ReactNode;
  /** Accessible name for the trigger; the panel is labelled by it. */
  triggerLabel: string;
  /** Panel side. Panels inside the topbar open towards the inline end. */
  align?: "start" | "end";
  buttonClassName?: string;
  panelClassName?: string;
  buttonProps?: Omit<PopoverButtonProps, "children" | "className">;
  /** Panel body, or a render prop receiving the panel's close handler. */
  children: ReactNode | ((close: () => void) => ReactElement);
};

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-bold leading-none text-[color:var(--ink)] transition duration-200 ease-out hover:border-[color:var(--gold)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)] data-[open]:border-[color:var(--kanjo-purple-interactive)] data-[open]:shadow-[var(--shadow-sm)]";

const PANEL =
  "z-[100] w-[min(23rem,calc(100vw-1.5rem))] origin-top [--anchor-gap:10px] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[color:var(--kanjo-surface)] p-0 text-start shadow-[var(--shadow-lg)] transition duration-200 ease-out focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0";

/**
 * Anchored disclosure panel.
 *
 * A menu (`DropdownMenu`) is a list of commands; this primitive is for a richer
 * surface that keeps its trigger visible — an inbox preview, a filter summary.
 * Brand geometry lives here so call sites pass content, never colour.
 */
export function PopoverMenu({
  trigger,
  triggerLabel,
  align = "end",
  buttonClassName,
  panelClassName,
  buttonProps,
  children,
}: PopoverMenuProps) {
  return (
    <Popover as="div" className="relative inline-block text-start">
      <PopoverButton
        {...buttonProps}
        aria-label={triggerLabel}
        title={triggerLabel}
        className={cx(BUTTON, buttonClassName)}
      >
        {trigger}
      </PopoverButton>

      <PopoverPanel
        transition
        anchor={align === "end" ? "bottom end" : "bottom start"}
        className={cx(PANEL, panelClassName)}
      >
        {({ close }) => {
          if (typeof children === "function") return children(close);
          return <>{children}</>;
        }}
      </PopoverPanel>
    </Popover>
  );
}
