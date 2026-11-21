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
 * accounts are in view.
 */
export function useClearinghouseView(accounts: ClearingAccountRow[]) {
  const [period, setPeriodState] =
    useState<ClearingPeriodState>(DEFAULT_CLEARING_PERIOD);
  const [sort, setSort] = useState<ClearingSort>("recent");

  const range = useMemo(() => resolveClearingRange(period), [period]);
  const filtered = useMemo(
    () => sortClearingAccounts(filterClearingAccounts(accounts, range), sort),
    [accounts, range, sort],
  );
  const receivables = useMemo(
    () => filtered.filter((account) => account.balance > 0),
    [filtered],
  );
  const payables = useMemo(
    () => filtered.filter((account) => account.balance < 0),
    [filtered],
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
  };
}
