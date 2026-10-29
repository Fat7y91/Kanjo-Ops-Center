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
 * Used for mutually exclusive views (pipeline states, settings sections) so
 * keyboard navigation and ARIA wiring come from Headless UI, not hand-rolled
 * `role="tab"` buttons.
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
          "flex flex-wrap items-center gap-1 rounded-xl bg-[color:var(--surface-soft)] p-1",
          listClassName,
        )}
      >
        {items.map((item) => (
          <Tab
            key={item.id}
            disabled={item.disabled}
            className={cx(
              "group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold text-[color:var(--ink-soft)] transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600/40 disabled:cursor-not-allowed disabled:opacity-45",
              "data-[selected]:bg-[color:var(--surface)] data-[selected]:text-purple-700 data-[selected]:shadow-sm dark:data-[selected]:text-purple-300",
              "data-[hover]:text-[color:var(--ink)]",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined ? (
              <span className="rounded-full bg-[color:var(--surface-soft)] px-2 py-0.5 text-[0.68rem] font-bold text-[color:var(--ink-soft)] group-data-[selected]:bg-purple-50 group-data-[selected]:text-purple-700 dark:group-data-[selected]:bg-purple-500/20 dark:group-data-[selected]:text-purple-200">
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
