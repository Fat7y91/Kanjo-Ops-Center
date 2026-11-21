"use client";

import { useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { JournalVoucherModal } from "@/components/journal/journal-voucher-modal";
import { useJournalVoucher } from "@/components/journal/use-journal-voucher";
import { Tabs } from "@/components/ui/tabs";
import { operationMoney } from "@/lib/operations/format";
import type {
  ClearingAccountRow,
  OperationSummary,
} from "@/lib/operations/types";

import { BreakdownModal } from "./breakdown-modal";
import { PartyBook } from "./clearinghouse-party-book";
import { AccountRows, OrderRows } from "./clearinghouse-rows";
import { ClearinghouseToolbar } from "./clearinghouse-toolbar";
import { PartyStatementModal } from "./party-statement-modal";
import { QuickSettleModal } from "./quick-settle-modal";
import { useBreakdown } from "./use-breakdown";
import { useClearinghouse } from "./use-clearinghouse";
import { useClearinghouseExport } from "./use-clearinghouse-export";
import { useClearinghouseView } from "./use-clearinghouse-view";
import { usePartyStatement } from "./use-party-statement";

export function ClearinghouseBoard({
  initialAccounts,
  initialPayables,
  initialReceivables,
  initialOperations,
}: {
  initialAccounts: ClearingAccountRow[];
  initialPayables: ClearingAccountRow[];
  initialReceivables: ClearingAccountRow[];
  initialOperations: OperationSummary[];
}) {
  const { hasPermission } = usePermission();
  const canSettle = hasPermission("settle_clearinghouse");
  const canPartial = hasPermission("settle_clearinghouse_partial");

  const {
    accounts,
    busyId,
    error,
    receiptNo,
    setReceiptNo,
    setFile,
    partialAmount,
    setPartialAmount,
    settle,
    submitSettlement,
  } = useClearinghouse(initialAccounts, initialPayables, initialReceivables);

  const view = useClearinghouseView(accounts);
  const breakdown = useBreakdown();
  const statement = usePartyStatement();
  const voucher = useJournalVoucher();
  const exporter = useClearinghouseExport();
  const [quickAccount, setQuickAccount] = useState<ClearingAccountRow | null>(
    null,
  );
  const operations = Array.isArray(initialOperations) ? initialOperations : [];

  const receivablesTotal = view.receivables.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const payablesTotal = view.payables.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const netTotal = receivablesTotal - payablesTotal;
  const summaryCurrency =
    view.receivables[0]?.currency ?? view.payables[0]?.currency ?? "EGP";

  const rowsProps = {
    accounts: view.filtered,
    busyId,
    receiptNo,
    setReceiptNo,
    setFile,
    partialAmount,
    setPartialAmount,
    canPartial,
    canSettle,
    settle,
  };

  function handleExport() {
    void exporter.exportBook({
      periodLabel: view.label,
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      range: view.range,
      totals: {
        receivables: receivablesTotal,
        payables: payablesTotal,
        net: netTotal,
      },
      receivables: view.receivables,
      payables: view.payables,
    });
  }

  return (
    <div className="clearinghouse">
      {error ? <p className="form-error">{error}</p> : null}

      <Tabs
        items={[
          {
            id: "book",
            label: "المستحقات",
            badge: view.filtered.length,
            content: (
              <>
                <ClearinghouseToolbar
                  period={view.period}
                  onPeriod={view.patchPeriod}
                  sort={view.sort}
                  onSort={view.setSort}
                  onExport={handleExport}
                  exportBusy={exporter.busy}
                  exportError={exporter.error}
                />

                <div className="clearing-kpis">
                  <div className="clearing-kpi clearing-kpi-positive">
                    <span>إجمالي مستحق لنا</span>
                    <strong dir="ltr">
                      {operationMoney(receivablesTotal, summaryCurrency)}
                    </strong>
                  </div>
                  <div className="clearing-kpi clearing-kpi-negative">
                    <span>إجمالي مستحق لهم</span>
                    <strong dir="ltr">
                      {operationMoney(payablesTotal, summaryCurrency)}
                    </strong>
                  </div>
                  <div
                    className={`clearing-kpi ${
                      netTotal >= 0
                        ? "clearing-kpi-positive"
                        : "clearing-kpi-negative"
                    }`}
                  >
                    <span>
                      الصافي النهائي{" "}
                      {netTotal >= 0 ? "(مستحق لنا)" : "(مستحق لهم)"}
                    </span>
                    <strong dir="ltr">
                      {operationMoney(Math.abs(netTotal), summaryCurrency)}
                    </strong>
                  </div>
                </div>

                <div className="clearing-book">
                  <article className="panel">
                    <div className="panel-head">
                      <h2>مستحق لهم</h2>
                      <span className="muted">مبالغ على كانجو سدادها</span>
                    </div>
                    <PartyBook
                      accounts={view.payables}
                      emptyLabel="لا توجد مبالغ مستحقة السداد."
                      range={view.range}
                      canSettle={canSettle}
                      onOpenStatement={statement.openFor}
                      onQuickSettle={setQuickAccount}
                    />
                  </article>

                  <article className="panel">
                    <div className="panel-head">
                      <h2>مستحق لنا</h2>
                      <span className="muted">
                        مبالغ على التجار ومناديب التوصيل تحصيلها
                      </span>
                    </div>
                    <PartyBook
                      accounts={view.receivables}
                      emptyLabel="لا توجد مبالغ مستحقة التحصيل."
                      range={view.range}
                      canSettle={canSettle}
                      onOpenStatement={statement.openFor}
                      onQuickSettle={setQuickAccount}
                    />
                  </article>
                </div>
              </>
            ),
          },
          {
            id: "accounts",
            label: "تسديد وتحصيل",
            content: <AccountRows {...rowsProps} />,
          },
          {
            id: "orders",
            label: "العمليات السابقة",
            badge: operations.length,
            content: (
              <OrderRows operations={operations} onOpen={breakdown.openFor} />
            ),
          },
        ]}
      />

      <QuickSettleModal
        open={quickAccount !== null}
        account={quickAccount}
        canPartial={canPartial}
        onClose={() => setQuickAccount(null)}
        onSubmit={submitSettlement}
      />

      <BreakdownModal
        open={breakdown.open}
        loading={breakdown.loading}
        error={breakdown.error}
        breakdown={breakdown.breakdown}
        onClose={breakdown.close}
        onRetry={breakdown.retry}
      />

      <PartyStatementModal
        open={statement.open}
        loading={statement.loading}
        error={statement.error}
        statement={statement.statement}
        onClose={statement.close}
        onRetry={statement.retry}
        onOpenEntry={voucher.openFor}
      />

      <JournalVoucherModal
        open={voucher.open}
        loading={voucher.loading}
        error={voucher.error}
        voucher={voucher.voucher}
        onClose={voucher.close}
        onRetry={voucher.retry}
      />
    </div>
  );
}
