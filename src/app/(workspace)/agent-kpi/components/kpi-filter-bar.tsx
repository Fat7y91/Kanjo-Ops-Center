"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SelectMenu, type SelectOption } from "@/components/ui/select-menus";
import {
  KPI_WINDOW_OPTIONS,
  windowLabel,
} from "@/lib/kpi/format";

export type KpiFilterOption = SelectOption<string>;

export type KpiFilterBarProps = {
  cities: KpiFilterOption[];
  teams: KpiFilterOption[];
  agents: KpiFilterOption[];
  cityId: string | null;
  team: string | null;
  agentId: string | null;
  windowDays: number;
  /** Reps cannot widen scope; the bar renders read-only context instead. */
  lockedToSelf: boolean;
  /** False when the viewer manages a city but is not a field rep themselves. */
  selfAgent: boolean;
  selfLabel: string;
};

const ALL = "__all__";

/**
 * Global filter bar (Tier 1 client controller).
 *
 * Writes the selection into the URL so the server container re-runs the Tier 3
 * service with the new scope. No metric math happens here.
 */
export function KpiFilterBar({
  cities,
  teams,
  agents,
  cityId,
  team,
  agentId,
  windowDays,
  lockedToSelf,
  selfAgent,
  selfLabel,
}: KpiFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const allOption = useMemo<KpiFilterOption>(
    () => ({ value: ALL, label: "كل الفرق والمدن" }),
    [],
  );

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  if (lockedToSelf) {
    return (
      <section className="kpi-filter-bar" data-readonly="true">
        <p className="kpi-filter-note">
          {selfAgent
            ? "تُعرض مؤشراتك الشخصية فقط داخل مدينتك. المقارنة والترتيب محصوران في مناديب نفس المدينة."
            : "تُعرض مؤشرات مناديب مدينتك فقط. الترتيب محصور داخل نفس المدينة ولا يقارن بين مدن مختلفة."}
        </p>
        <p className="kpi-filter-note">
          <strong>{selfLabel}</strong> · {windowLabel(windowDays)}
        </p>
      </section>
    );
  }

  return (
    <section
      className="kpi-filter-bar"
      aria-busy={pending}
      aria-label="تصفية مؤشرات المناديب"
    >
      <SelectMenu
        label="المدينة"
        value={cityId}
        options={[allOption, ...cities]}
        placeholder="كل المدن"
        onChange={(value) =>
          push({
            city: value === ALL ? null : value,
            team: null,
            agent: null,
          })
        }
      />
      <SelectMenu
        label="الفريق"
        value={team}
        options={[allOption, ...teams]}
        placeholder="كل الفرق"
        onChange={(value) =>
          push({ team: value === ALL ? null : value, agent: null })
        }
      />
      <SelectMenu
        label="المندوب"
        value={agentId}
        options={agents}
        placeholder="كل المناديب"
        onChange={(value) => push({ agent: value })}
      />
      <SelectMenu
        label="الفترة"
        value={windowDays}
        options={KPI_WINDOW_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        onChange={(value) => push({ window: String(value) })}
      />
    </section>
  );
}
