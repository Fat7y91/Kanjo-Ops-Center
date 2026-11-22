"use client";

import { useMemo, useState } from "react";

import {
  clearingPeriodLabel,
  DEFAULT_CLEARING_PERIOD,
  filterClearingAccounts,
  resolveClearingRange,
  sortClearingAccounts,
  type ClearingPeriodState,
  type ClearingSort,
} from "@/lib/operations/clearinghouse-view";
import type { ClearingAccountRow } from "@/lib/operations/types";

/**
 * Period + sort state for the settlement book.
 *
 * The slice is derived from the same account list the server returned, so the
 * KPI cards, the two party books and the export can never disagree about which
 * accounts are in view. The KPI totals are deliberately not period-filtered:
 * they answer "what is still unpaid right now?", while the books below can be
 * narrowed to a period.
 */
export function useClearinghouseView(
  accounts: ClearingAccountRow[],
  excludeInternalStaff = false,
) {
  const [period, setPeriodState] =
    useState<ClearingPeriodState>(DEFAULT_CLEARING_PERIOD);
  const [sort, setSort] = useState<ClearingSort>("recent");

  const scoped = useMemo(
    () =>
      excludeInternalStaff
        ? accounts.filter(
            (account) =>
              !(account.partyType === "courier" && account.isInternalStaff),
          )
        : accounts,
    [accounts, excludeInternalStaff],
  );

  const range = useMemo(() => resolveClearingRange(period), [period]);
  const filtered = useMemo(
    () => sortClearingAccounts(filterClearingAccounts(scoped, range), sort),
    [scoped, range, sort],
  );
  const receivables = useMemo(
    () => filtered.filter((account) => account.balance > 0),
    [filtered],
  );
  const payables = useMemo(
    () => filtered.filter((account) => account.balance < 0),
    [filtered],
  );
  const openReceivables = useMemo(
    () => scoped.filter((account) => account.balance > 0),
    [scoped],
  );
  const openPayables = useMemo(
    () => scoped.filter((account) => account.balance < 0),
    [scoped],
  );
  const label = useMemo(
    () => clearingPeriodLabel(period, range),
    [period, range],
  );

  function patchPeriod(patch: Partial<ClearingPeriodState>) {
    setPeriodState((current) => ({ ...current, ...patch }));
  }

  return {
    period,
    patchPeriod,
    sort,
    setSort,
    range,
    label,
    filtered,
    receivables,
    payables,
    openReceivables,
    openPayables,
  };
}
