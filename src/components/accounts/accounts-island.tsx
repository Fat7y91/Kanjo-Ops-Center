"use client";

import { AccountsView } from "@/components/accounts/accounts-view";
import { useEndpointData } from "@/components/data/use-endpoint-data";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatGridSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import {
  accountsPayloadSchema,
  type AccountsPayload,
} from "@/lib/accounts/payload";

/** Module-level so the hook's dependency list stays stable. */
const parseAccounts = (input: unknown): AccountsPayload =>
  accountsPayloadSchema.parse(input);

/**
 * Treasury island.
 *
 * The page resolves the session and the tier; the balances, movements and totals
 * arrive from `/api/accounts`. The header stays mounted in all three states, so
 * the operator sees the screen they navigated to while the numbers load, and the
 * account count appears with the first payload rather than a placeholder.
 *
 * `description` is the one thing the island cannot derive: it states the tier in
 * words, and the tier is decided on the server before the request is made.
 */
export function AccountsIsland({ description }: { description: string }) {
  const { status, data, error, reload } = useEndpointData(
    "/api/accounts",
    parseAccounts,
  );

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="ارصدة حسابات كانجو البنكية"
        description={description}
        actions={
          data ? (
            <span className="badge badge-gold">{data.accounts.length} حساب</span>
          ) : undefined
        }
      />

      {status === "loading" ? (
        <div aria-busy="true">
          <StatGridSkeleton count={2} />
          <TableSkeleton rows={6} columns={5} />
        </div>
      ) : null}

      {status === "failed" ? (
        <ErrorPanel
          error={error}
          reset={reload}
          title="تعذر تحميل الحسابات البنكية"
          description="لم تكتمل قراءة الأرصدة والحركات. أعد المحاولة دون مغادرة الصفحة."
        />
      ) : null}

      {status === "ready" ? (
        <AccountsView
          summaries={data.accounts}
          entries={data.entries}
          totals={data.totals}
          full={data.full}
          canViewTransactions={data.canViewTransactions}
          canRecordDeposits={data.canRecordDeposits}
          canRecordExpenses={data.canRecordExpenses}
          canAddAccount={data.canAddAccount}
          onRefresh={reload}
        />
      ) : null}
    </>
  );
}
