import type {
  KpiAgent,
  KpiDataset,
  KpiMetric,
  KpiVaultFacts,
} from "@/lib/kpi/types";
import type { VaultRate } from "@/lib/kpi/vault";

/**
 * Pure KPI arithmetic over the SQL Vault inputs (Tier 3).
 *
 * No React, no persistence: every function takes the dataset and an agent and
 * returns derived numbers. Live salary is priced from the active
 * `app.commission_rates` row for the rep's city — override first, then the
 * global fallback — exactly like `app.commission_rates_for()`.
 */

export const ZERO_RATES: VaultRate = {
  activationFee: 50,
  photoFee: 1,
  baseFee: 100,
};

export function emptyVaultFacts(): KpiVaultFacts {
  return {
    activations: 0,
    itemsAdded: 0,
    contractsClosed: 0,
    marginRatio: 0,
    salary: 0,
    source: "unavailable",
    status: null,
  };
}

export function rateForCity(
  ratesByCity: Map<string | null, VaultRate>,
  cityId: string,
): VaultRate {
  return ratesByCity.get(cityId) ?? ratesByCity.get(null) ?? ZERO_RATES;
}

/** Salary priced from the city's active fee schedule. */
export function computeLiveSalary(
  activations: number,
  itemsAdded: number,
  contractsClosed: number,
  marginRatio: number,
  rate: VaultRate,
): number {
  const contracting =
    contractsClosed * rate.baseFee * (marginRatio / 100);
  return (
    activations * rate.activationFee +
    itemsAdded * rate.photoFee +
    contracting
  );
}

/** Vault facts for one agent; team contracting credit is shared by the team. */
export function factsFor(dataset: KpiDataset, agent: KpiAgent): KpiVaultFacts {
  const { vault } = dataset;

  if (vault.source === "snapshot") {
    const snapshot = vault.snapshotsByRep.get(agent.id);
    if (snapshot) {
      return {
        activations: snapshot.activations,
        itemsAdded: snapshot.itemsAdded,
        contractsClosed: snapshot.contractsClosed,
        marginRatio: snapshot.marginRatio,
        salary: snapshot.salary,
        source: "snapshot",
        status: snapshot.status,
      };
    }
    return emptyVaultFacts();
  }

  if (vault.source !== "live") return emptyVaultFacts();

  const activations = vault.activationsByRep.get(agent.id) ?? 0;
  const itemsAdded = vault.itemsByRep.get(agent.id) ?? 0;
  const teamContracting = agent.teamId
    ? vault.contractsByTeam.get(agent.teamId)
    : undefined;
  const contractsClosed = teamContracting?.count ?? 0;
  const marginRatio = teamContracting?.marginRatio ?? 0;
  const rate = rateForCity(vault.ratesByCity, agent.cityId);

  return {
    activations,
    itemsAdded,
    contractsClosed,
    marginRatio,
    salary: computeLiveSalary(
      activations,
      itemsAdded,
      contractsClosed,
      marginRatio,
      rate,
    ),
    source: "live",
    status: null,
  };
}

/* ── Presentation metrics ──────────────────────────────────────────────── */

const metric = (
  key: string,
  label: string,
  value: number,
  unit: KpiMetric["unit"],
  hint: string,
  direction: KpiMetric["direction"] = "higher",
): KpiMetric => ({ key, label, value, unit, hint, direction });

export function vaultMetrics(facts: KpiVaultFacts): KpiMetric[] {
  return [
    metric(
      "activations",
      "تفعيل تجار",
      facts.activations,
      "count",
      "تجار سُجّل أول إدخال لهم هذا الشهر",
    ),
    metric(
      "itemsAdded",
      "منتجات مضافة",
      facts.itemsAdded,
      "count",
      "منتجات أُضيفت للكتالوج هذا الشهر",
    ),
    metric(
      "contractsClosed",
      "تعاقدات مغلقة",
      facts.contractsClosed,
      "count",
      "عقود نهائية أو موقعة منسوبة للفريق",
    ),
    metric(
      "marginRatio",
      "نسبة تحقيق الهامش",
      Math.round(facts.marginRatio * 10) / 10,
      "percent",
      "متوسط الهامش المتفق عليه مقابل المستهدف",
    ),
    metric(
      "salary",
      "الراتب الشهري",
      Math.round(facts.salary * 100) / 100,
      "currency",
      facts.source === "snapshot"
        ? "مجمّد من أسعار شهر الإقفال"
        : "محسوب من أسعار العمولات النشطة",
    ),
  ];
}

/* ── Scoring ───────────────────────────────────────────────────────────── */

const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

/** Vault score 0–100: activations, data entry, contracting and margin. */
export function scoreVaultFacts(facts: KpiVaultFacts): number {
  return clamp(
    clamp(facts.activations * 12, 0, 35) +
      clamp(facts.itemsAdded, 0, 20) +
      clamp(facts.contractsClosed * 12, 0, 35) +
      clamp(facts.marginRatio, 0, 10),
  );
}
