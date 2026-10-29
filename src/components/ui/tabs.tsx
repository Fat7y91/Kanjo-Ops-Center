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
 * state never shows a sharp-cornered button inside a rounded track. Selected
 * tabs switch to the interactive purple with white text for AA contrast; focus
 * rings sit inside the padding, keeping the silhouette intact.
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
              "group inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold leading-none text-[color:var(--ink-soft)] transition duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)] focus-visible:ring-offset-0",
              "hover:rounded-full hover:bg-[color:var(--kanjo-pastel)] hover:text-[color:var(--kanjo-purple-interactive)]",
              "data-[hover]:rounded-full data-[hover]:bg-[color:var(--kanjo-pastel)] data-[hover]:text-[color:var(--kanjo-purple-interactive)]",
              "data-[selected]:rounded-full data-[selected]:bg-[color:var(--kanjo-purple-interactive)] data-[selected]:text-white data-[selected]:shadow-[var(--shadow-md)]",
              "data-[selected]:hover:bg-[color:var(--kanjo-interactive-hover)] data-[selected]:data-[hover]:bg-[color:var(--kanjo-interactive-hover)]",
              "disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[color:var(--ink-soft)] disabled:opacity-45",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined ? (
              <span className="rounded-full bg-[color:var(--surface)] px-2 py-0.5 text-[0.68rem] font-bold leading-none text-[color:var(--ink-soft)] group-data-[selected]:bg-white/20 group-data-[selected]:text-white">
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
