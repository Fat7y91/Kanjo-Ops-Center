"use client";

import { useMemo, useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { FilterBar } from "@/components/bi/filter-bar";
import { SlideOver } from "@/components/bi/slide-over";
import { CatalogSection } from "@/components/bi/sections/catalog-section";
import { ComplianceSection } from "@/components/bi/sections/compliance-section";
import { FinanceSection } from "@/components/bi/sections/finance-section";
import { FunnelSection } from "@/components/bi/sections/funnel-section";
import { MarketingSection } from "@/components/bi/sections/marketing-section";
import { NegotiationSection } from "@/components/bi/sections/negotiation-section";
import { resolveDrill, type DrillResolution } from "@/lib/bi/drill";
import {
  buildCatalog,
  buildCompliance,
  buildFinance,
  buildFunnel,
  buildMarketing,
  buildNegotiation,
  scopeDataset,
} from "@/lib/bi/select";
import {
  DEFAULT_BI_FILTERS,
  type BiDataset,
  type BiDealStage,
  type BiFilters,
} from "@/lib/bi/types";

type ExecutiveDashboardProps = {
  dataset: BiDataset;
};

/** Executive clearance is the capability that unlocks finance + marketing. */
const EXECUTIVE_LEVEL = 4;

export function ExecutiveDashboard({ dataset }: ExecutiveDashboardProps) {
  const { hasPermission, clearanceLevel } = usePermission();
  const [filters, setFilters] = useState<BiFilters>(DEFAULT_BI_FILTERS);
  const [drill, setDrill] = useState<DrillResolution | null>(null);
  const [activeStage, setActiveStage] = useState<BiDealStage | null>(null);

  const scoped = useMemo(
    () => scopeDataset(dataset, filters),
    [dataset, filters],
  );

  const funnel = useMemo(() => buildFunnel(scoped.merchants), [scoped]);
  const compliance = useMemo(
    () => buildCompliance(scoped.merchants),
    [scoped],
  );
  const negotiation = useMemo(
    () => buildNegotiation(scoped.merchants),
    [scoped],
  );
  const finance = useMemo(
    () => buildFinance(scoped.merchants, scoped.expenses),
    [scoped],
  );
  const marketing = useMemo(
    () => buildMarketing(scoped.marketing),
    [scoped],
  );
  const catalog = useMemo(() => buildCatalog(scoped.catalog), [scoped]);
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const step of funnel) counts[step.stage] = step.count;
    return counts;
  }, [funnel]);

  const canSeeFinance =
    hasPermission("view_financials") && clearanceLevel >= EXECUTIVE_LEVEL;
  const canSeeMarketing =
    hasPermission("manage_marketing_metrics") &&
    clearanceLevel >= EXECUTIVE_LEVEL;

  function updateFilters(patch: Partial<BiFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function openDrill(id: string) {
    const resolution = resolveDrill(id, scoped);
    if (resolution) setDrill(resolution);
  }

  return (
    <div className="bi-dashboard">
      <FilterBar
        filters={filters}
        cities={dataset.cities}
        teams={dataset.teams}
        resultCount={scoped.merchants.length}
        onChange={updateFilters}
        onReset={() => {
          setFilters(DEFAULT_BI_FILTERS);
          setActiveStage(null);
        }}
      />

      <FunnelSection
        steps={funnel}
        activeStage={activeStage}
        onStageFocus={setActiveStage}
        onDrill={openDrill}
      />

      <NegotiationSection
        rows={negotiation}
        merchantsByStage={stageCounts}
        onDrill={openDrill}
      />

      {canSeeFinance ? (
        <FinanceSection finance={finance} onDrill={openDrill} />
      ) : (
        <LockedSection
          title="الأداء المالي"
          requirement="view_financials"
          level={EXECUTIVE_LEVEL}
        />
      )}

      <div className="bi-row">
        <CatalogSection catalog={catalog} onDrill={openDrill} />

        <ComplianceSection breakdown={compliance} onDrill={openDrill} />
      </div>


      {canSeeMarketing ? (
        <MarketingSection marketing={marketing} onDrill={openDrill} />
      ) : (
        <LockedSection
          title="الوصول التسويقي"
          requirement="manage_marketing_metrics"
          level={EXECUTIVE_LEVEL}
        />
      )}

      <SlideOver
        open={drill !== null}
        title={drill?.title ?? ""}
        eyebrow={drill?.eyebrow}
        description={drill?.description}
        table={drill?.table ?? null}
        onClose={() => setDrill(null)}
      />
    </div>
  );
}

/**
 * Explicit locked state instead of silently hiding the group: executives in
 * training can see that finance exists and what unlocks it.
 */
function LockedSection({
  title,
  requirement,
  level,
}: {
  title: string;
  requirement: string;
  level: number;
}) {
  return (
    <section className="bi-section" aria-label={`${title} — مقفل`}>
      <header className="bi-section-head">
        <div>
          <p className="eyebrow">صلاحية مقيّدة</p>
          <h2>{title}</h2>
        </div>
        <span className="badge badge-red">مقفل</span>
      </header>
      <div className="bi-locked">
        <p>
          يتطلب هذا القسم صلاحية <code>{requirement}</code> ومستوى تصريح{" "}
          {level} على الأقل.
        </p>
      </div>
    </section>
  );
}
