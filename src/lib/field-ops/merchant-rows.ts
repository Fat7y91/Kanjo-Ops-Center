import { effectiveCityIds } from "@/lib/city-scope-query";
import type { ActiveSession } from "@/lib/rbac/types";

import type { MerchantRow } from "./payload";
import { loadMerchantStates } from "./state-source";
import { listCities, listMerchants } from "./store";
import { CONTRACT_STATE_META, teamLabel } from "./types";

const currency = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

/**
 * Rows for every merchant in the viewer's cities.
 *
 * The page and `GET /api/merchants` answer with the same projection, so the
 * directory cannot disagree with itself depending on which path rendered it.
 * The row type and its wire schema live in `payload.ts`, because the island
 * validates them and this module — which reaches the stores — is `server-only`
 * by proxy.
 *
 * The badge state comes from `loadMerchantStates()` — the newest visit outcome
 * or a manager override — not from the stored column, because the profile and
 * the visit form already read the rollup: a directory that echoed the raw column
 * would contradict both.
 */
export async function buildMerchantRows(
  session: ActiveSession,
): Promise<MerchantRow[]> {
  const [cities, allowedCityIds, merchants] = await Promise.all([
    listCities(),
    effectiveCityIds(session),
    listMerchants(),
  ]);
  const cityMap = new Map(cities.map((city) => [city.id, city]));
  const allowedCities = new Set(allowedCityIds);
  const scoped = merchants.filter((merchant) =>
    allowedCities.has(merchant.cityId),
  );

  const states = await loadMerchantStates(scoped);

  return scoped.map((merchant) => {
    const meta =
      CONTRACT_STATE_META[states.get(merchant.id)?.state ?? merchant.contractState];
    return {
      id: merchant.id,
      name: merchant.name,
      vendorType: merchant.vendorType,
      vendorTypeId: merchant.vendorTypeId,
      cityName: cityMap.get(merchant.cityId)?.name ?? "—",
      teamLabel: teamLabel(merchant.team),
      stateLabel: meta.label,
      stateTone: meta.tone,
      commissionLabel: currency.format(merchant.commissionAmount),
    };
  });
}
