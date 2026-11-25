"use client";

import { useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import {
  fetchProfitability,
  useProfitability,
} from "@/components/bi/use-profitability";
import { JournalVoucherModal } from "@/components/journal/journal-voucher-modal";
import { useJournalVoucher } from "@/components/journal/use-journal-voucher";
import { ToggleField } from "@/components/ui/form-inputs";
import { Tabs } from "@/components/ui/tabs";
import { operationMoney } from "@/lib/operations/format";
import type {
  ClearingAccountRow,
  OperationSummary,
} from "@/lib/operations/types";

import { BreakdownModal } from "./breakdown-modal";
import { ClearingBookPanels } from "./clearing-book-panels";
import { ClearingReportModal } from "./clearing-report-modal";
import { AccountRows, OrderRows } from "./clearinghouse-rows";
import { ClearinghouseToolbar } from "./clearinghouse-toolbar";
import { PartyStatementModal } from "./party-statement-modal";
import { ProfitabilityPanel } from "./profitability-panel";
import { ManualAdjustmentModal } from "./manual-adjustment-modal";
import { QuickSettleModal } from "./quick-settle-modal";
import { useBreakdown } from "./use-breakdown";
import { useClearinghouse } from "./use-clearinghouse";
import { useClearinghouseExport } from "./use-clearinghouse-export";
import { useClearingReport } from "./use-clearing-report";
import { useClearinghouseView } from "./use-clearinghouse-view";
import { useInternalStaffFilter } from "./use-internal-staff-filter";
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
  const canAdjust = hasPermission("post_journal_entries") || canSettle;

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
    refresh,
  } = useClearinghouse(initialAccounts, initialPayables, initialReceivables);

  const { excludeInternalStaff, setExcludeInternalStaff } =
    useInternalStaffFilter();
  const view = useClearinghouseView(accounts, excludeInternalStaff);
  const [profitCityId, setProfitCityId] = useState<string | null>(null);
  const profitability = useProfitability(
    view.range.from,
    view.range.to,
    profitCityId,
    excludeInternalStaff,
  );
  const breakdown = useBreakdown();
  const statement = usePartyStatement();
  const voucher = useJournalVoucher();
  const exporter = useClearinghouseExport();
  const report = useClearingReport();
  const [quickAccount, setQuickAccount] = useState<ClearingAccountRow | null>(
    null,
  );
  const [adjustOpen, setAdjustOpen] = useState(false);
  const operations = Array.isArray(initialOperations) ? initialOperations : [];

  const receivablesTotal = view.openReceivables.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const payablesTotal = view.openPayables.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const netTotal = receivablesTotal - payablesTotal;
  const summaryCurrency =
    view.openReceivables[0]?.currency ??
    view.openPayables[0]?.currency ??
    "EGP";

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

  async function handleExport() {
    const summary =
      profitability.status === "ready"
        ? profitability.data
        : await fetchProfitability(
            view.range.from,
            view.range.to,
            profitCityId,
            excludeInternalStaff,
          );

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
      profitability: summary,
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

                <ProfitabilityPanel
                  state={profitability}
                  cityId={profitCityId}
                  onCityChange={setProfitCityId}
                  periodLabel={view.label}
                  excludeInternalStaff={excludeInternalStaff}
                  onExcludeInternalStaffChange={setExcludeInternalStaff}
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

                <ClearingBookPanels
                  payables={view.payables}
                  receivables={view.receivables}
                  range={view.range}
                  canSettle={canSettle}
                  exporting={report.exporting}
                  exportError={report.exportError}
                  onOpenStatement={statement.openFor}
                  onQuickSettle={setQuickAccount}
                  onExport={(kind) => void report.exportFor(kind, view.range)}
                  onPrint={(kind) => report.openFor(kind, view.range)}
                />
              </>
            ),
          },
          {
            id: "accounts",
            label: "تسديد وتحصيل",
            content: (
              <>
                <div className="clearing-scope-toggle">
                  <ToggleField
                    label="استبعاد مستحقات المناديب الداخليين (ZEMBAWY)"
                    hint="يبقي طلباتهم وعمولات التجار، ويستبعد أجرهم من المستحقات."
                    checked={excludeInternalStaff}
                    onChange={setExcludeInternalStaff}
                  />
                </div>
                <AccountRows {...rowsProps} />
              </>
            ),
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
        canAdjust={canAdjust}
        onAdjust={() => setAdjustOpen(true)}
      />
      <ManualAdjustmentModal
        open={adjustOpen}
        statement={statement.statement}
        onClose={() => setAdjustOpen(false)}
        onPosted={() => {
          statement.retry();
          void refresh();
        }}
      />
      <ClearingReportModal
        open={report.open}
        loading={report.loading}
        error={report.error}
        report={report.report}
        onClose={report.close}
        onRetry={report.retry}
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
