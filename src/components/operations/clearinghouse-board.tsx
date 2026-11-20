"use client";

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
import {
  AccountRows,
  OrderRows,
  PartyBook,
} from "./clearinghouse-rows";
import { PartyStatementModal } from "./party-statement-modal";
import { useBreakdown } from "./use-breakdown";
import { useClearinghouse } from "./use-clearinghouse";
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
    payables,
    receivables,
    busyId,
    error,
    receiptNo,
    setReceiptNo,
    setFile,
    partialAmount,
    setPartialAmount,
    settle,
  } = useClearinghouse(initialAccounts, initialPayables, initialReceivables);

  const breakdown = useBreakdown();
  const statement = usePartyStatement();
  const voucher = useJournalVoucher();
  const operations = Array.isArray(initialOperations) ? initialOperations : [];

  const receivablesTotal = receivables.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const payablesTotal = payables.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const netTotal = receivablesTotal - payablesTotal;
  const summaryCurrency =
    receivables[0]?.currency ?? payables[0]?.currency ?? "EGP";

  const rowsProps = {
    accounts,
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

  return (
    <div className="clearinghouse">
      {error ? <p className="form-error">{error}</p> : null}

      <Tabs
        items={[
          {
            id: "book",
            label: "المستحقات",
            badge: accounts.length,
            content: (
              <>
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
                      accounts={payables}
                      emptyLabel="لا توجد مبالغ مستحقة السداد."
                      onOpenStatement={statement.openFor}
                    />
                  </article>

                  <article className="panel">
                    <div className="panel-head">
                      <h2>مستحق لنا</h2>
                      <span className="muted">مبالغ على التجار ومناديب التوصيل تحصيلها</span>
                    </div>
                    <PartyBook
                      accounts={receivables}
                      emptyLabel="لا توجد مبالغ مستحقة التحصيل."
                      onOpenStatement={statement.openFor}
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
