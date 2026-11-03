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
 * The track and every tab share the same control radius, and neither carries a
 * border: the track is a soft neutral wash and the selected tab is a solid
 * purple plate. That flat treatment replaces the old outlined pill track, which
 * drew a 1px frame around a rounded-full track and read as a bordered control.
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
          "inline-flex flex-wrap items-center gap-1 rounded-[var(--radius-control)] bg-[color:var(--surface-soft)] p-1",
          listClassName,
        )}
      >
        {items.map((item) => (
          <Tab
            key={item.id}
            disabled={item.disabled}
            className={cx(
              "group inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] px-3.5 py-1.5 text-xs font-bold leading-none text-[color:var(--ink-soft)] transition duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--kanjo-focus-ring)] focus-visible:ring-offset-0",
              "hover:bg-[color:var(--kanjo-pastel)] hover:text-[color:var(--kanjo-purple-base)]",
              "data-[hover]:bg-[color:var(--kanjo-pastel)] data-[hover]:text-[color:var(--kanjo-purple-base)]",
              "data-[selected]:bg-[image:var(--gradient-primary)] data-[selected]:text-white data-[selected]:shadow-[0_8px_20px_-12px_rgba(35,5,53,0.8)]",
              "data-[selected]:hover:brightness-110 data-[selected]:data-[hover]:brightness-110",
              "disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[color:var(--ink-soft)] disabled:opacity-45",
            )}
          >
            <span>{item.label}</span>
            {item.badge !== undefined ? (
              <span className="rounded-[var(--radius-control)] bg-[color:var(--surface)] px-2 py-0.5 text-[0.68rem] font-bold leading-none text-[color:var(--ink-soft)] group-data-[selected]:bg-[color:var(--kanjo-gold)] group-data-[selected]:text-[color:var(--kanjo-purple-base)]">
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
