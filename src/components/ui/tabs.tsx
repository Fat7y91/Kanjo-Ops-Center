"use client";

import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

export type TabsItem = {
  id: string;
  label: string;
  content: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  items: TabsItem[];
  selectedIndex?: number;
  defaultIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
  listClassName?: string;
  /** Hide the panel region when the tabs only drive external content. */
  showPanels?: boolean;
};

/**
 * Kanjo tabs.
 *
 * The list and every tab share one pill geometry (`rounded-full`) so the active
 * state never shows a sharp-cornered button inside a rounded track. Focus rings
 * sit inside the padding, keeping the silhouette intact.
 */
export function Tabs({
  items,
  selectedIndex,
  defaultIndex = 0,
  onChange,
  className,
  listClassName,
  showPanels = true,
}: TabsProps) {
  return (
    <TabGroup
      selectedIndex={selectedIndex}
      defaultIndex={defaultIndex}
      onChange={onChange}
      className={className}
    >
      <TabList
        className={cx(
          "inline-flex flex-wrap items-center gap-1 rounded-full border border-[color:var(--line)] bg-[color:var(--surface-soft)] p-1",
          listClassName,
        )}
      >
        {items.map((item) => (
          <Tab
            key={item.id}
            disabled={item.disabled}
            className={cx(
              "group inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold leading-none text-[color:var(--ink-soft)] transition duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)] focus-visible:ring-offset-0",
              "data-[hover]:text-[color:var(--kanjo-purple-interactive)]",
              "data-[selected]:bg-[color:var(--kanjo-pastel)] data-[selected]:text-[color:var(--kanjo-pastel-ink)] data-[selected]:shadow-[var(--shadow-sm)] data-[selected]:ring-1 data-[selected]:ring-inset data-[selected]:ring-[color:var(--kanjo-focus-ring)]",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined ? (
              <span className="rounded-full bg-[color:var(--surface)] px-2 py-0.5 text-[0.68rem] font-bold leading-none text-[color:var(--ink-soft)] group-data-[selected]:bg-[color:var(--kanjo-surface)] group-data-[selected]:text-[color:var(--kanjo-pastel-ink)]">
                {item.badge}
              </span>
            ) : null}
          </Tab>
        ))}
      </TabList>

      {showPanels ? (
        <TabPanels className="mt-4">
          {items.map((item) => (
            <TabPanel key={item.id} className="focus:outline-none">
              {item.content}
            </TabPanel>
          ))}
        </TabPanels>
      ) : null}
    </TabGroup>
  );
}
