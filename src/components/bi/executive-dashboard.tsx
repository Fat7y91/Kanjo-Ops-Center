"use client";

import { useMemo, useState, type ReactNode } from "react";

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
  /** Title block rendered inside the sticky header above the filter bar. */
  header?: ReactNode;
};

/**
 * Finance and marketing are executive surfaces. Founder (3) and System Admin
 * (4) both see them; city managers and reps do not. The capability check runs
 * alongside the level check, so a demotion removes access even if the level
 * lingers.
 */
const EXECUTIVE_LEVEL = 3;

/**
 * Command center.
 *
 * Each section is rendered only when its own `view_overview_*` grant is held.
 * Revoked sections disappear entirely rather than advertising a locked
 * placeholder, so the grid shows exactly what this operator may read. The
 * `.bi-bento` flex rows keep the half-width widgets paired and stretch a lone
 * survivor to the full row.
 */
export function ExecutiveDashboard({
  dataset,
  header,
}: ExecutiveDashboardProps) {
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

  const canSeeContracts = hasPermission("view_overview_contracts");
  const canSeeNegotiation = hasPermission("view_overview_negotiation");
  const canSeeCatalog = hasPermission("view_overview_catalog");
  const canSeeCompliance = hasPermission("view_overview_compliance");
  const canSeeFinance =
    hasPermission("view_overview_finance") && clearanceLevel >= EXECUTIVE_LEVEL;
  const canSeeMarketing =
    hasPermission("view_campaigns") && clearanceLevel >= EXECUTIVE_LEVEL;

  function updateFilters(patch: Partial<BiFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function openDrill(id: string) {
    const resolution = resolveDrill(id, scoped);
    if (resolution) setDrill(resolution);
  }

  return (
    <div className="bi-dashboard">
      <div className="bi-sticky-head">
        {header}
        <FilterBar
          filters={filters}
          cities={dataset.cities}
          teams={dataset.teams}
          reps={dataset.reps}
          vendorTypes={dataset.vendorTypes}
          resultCount={scoped.merchants.length}
          onChange={updateFilters}
          onReset={() => {
            setFilters(DEFAULT_BI_FILTERS);
            setActiveStage(null);
          }}
        />
      </div>

      <div className="bi-bento">
        {canSeeContracts ? (
          <FunnelSection
            steps={funnel}
            activeStage={activeStage}
            onStageFocus={setActiveStage}
            onDrill={openDrill}
          />
        ) : null}

        {canSeeFinance ? (
          <FinanceSection
            finance={finance}
            treasury={dataset.treasury}
            onDrill={openDrill}
          />
        ) : null}

        {canSeeNegotiation ? (
          <NegotiationSection
            rows={negotiation}
            merchantsByStage={stageCounts}
            onDrill={openDrill}
          />
        ) : null}

        {canSeeCatalog ? (
          <CatalogSection catalog={catalog} onDrill={openDrill} />
        ) : null}

        {canSeeCompliance ? (
          <ComplianceSection breakdown={compliance} onDrill={openDrill} />
        ) : null}

        {canSeeMarketing ? (
          <MarketingSection marketing={marketing} onDrill={openDrill} />
        ) : null}
      </div>

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
