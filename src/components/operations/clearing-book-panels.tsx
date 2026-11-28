"use client";

import { Button } from "@/components/ui/button";
import type { ClearingReportKind } from "@/lib/operations/clearing-report";
import type {
  ClearingAccountRow,
  StatementRange,
} from "@/lib/operations/types";

import { PartyBook } from "./clearinghouse-party-book";

type ClearingBookPanelsProps = {
  payables: ClearingAccountRow[];
  receivables: ClearingAccountRow[];
  range: StatementRange;
  canSettle: boolean;
  exporting: boolean;
  exportError: string;
  onOpenStatement: (accountId: string, range: StatementRange) => void;
  onQuickSettle: (account: ClearingAccountRow) => void;
  onExport: (kind: ClearingReportKind) => void;
  onPrint: (kind: ClearingReportKind) => void;
};

function PanelActions({
  kind,
  exporting,
  onExport,
  onPrint,
}: {
  kind: ClearingReportKind;
  exporting: boolean;
  onExport: (kind: ClearingReportKind) => void;
  onPrint: (kind: ClearingReportKind) => void;
}) {
  return (
    <div className="panel-head-actions">
      <Button
        size="sm"
        variant="quiet"
        disabled={exporting}
        onClick={() => onExport(kind)}
      >
        تصدير Excel
      </Button>
      <Button size="sm" variant="accent" onClick={() => onPrint(kind)}>
        طباعة / PDF
      </Button>
    </div>
  );
}

export function ClearingBookPanels({
  payables,
  receivables,
  range,
  canSettle,
  exporting,
  exportError,
  onOpenStatement,
  onQuickSettle,
  onExport,
  onPrint,
}: ClearingBookPanelsProps) {
  return (
    <>
      <div className="clearing-book">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>مستحق لهم · إجمالي السدادات</h2>
              <span className="muted">مبالغ على كانجو سدادها</span>
            </div>
            <PanelActions
              kind="payables"
              exporting={exporting}
              onExport={onExport}
              onPrint={onPrint}
            />
          </div>
          <PartyBook
            accounts={payables}
            emptyLabel="لا توجد مبالغ مستحقة السداد."
            range={range}
            canSettle={canSettle}
            onOpenStatement={(id) => onOpenStatement(id, range)}
            onQuickSettle={onQuickSettle}
          />
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h2>مستحق على · إجمالي التحصيلات</h2>
              <span className="muted">
                مبالغ على التجار ومناديب التوصيل تحصيلها
              </span>
            </div>
            <PanelActions
              kind="collections"
              exporting={exporting}
              onExport={onExport}
              onPrint={onPrint}
            />
          </div>
          <PartyBook
            accounts={receivables}
            emptyLabel="لا توجد مبالغ مستحقة التحصيل."
            range={range}
            canSettle={canSettle}
            onOpenStatement={(id) => onOpenStatement(id, range)}
            onQuickSettle={onQuickSettle}
          />
        </article>
      </div>
      {exportError ? <p className="form-error">{exportError}</p> : null}
    </>
  );
}
