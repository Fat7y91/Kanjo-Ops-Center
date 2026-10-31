"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountCard } from "@/components/accounts/account-card";
import { AccountForm } from "@/components/accounts/account-form";
import { LedgerEntryForm } from "@/components/accounts/ledger-entry-form";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { Widget, WidgetDivider, WidgetStat } from "@/components/bi/widget";
import { currencyMoney } from "@/lib/accounts/format";
import type { LedgerTotals } from "@/lib/accounts/ledger";
import type { AccountSummary } from "@/lib/accounts/ledger";
import type { LedgerEntry } from "@/lib/accounts/types";

type AccountsViewProps = {
  summaries: AccountSummary[];
  entries: LedgerEntry[];
  totals: Record<"EGP" | "SAR", LedgerTotals>;
  /**
   * Full viewers see the derived balance and expense totals. Deposit-only
   * viewers do not: their remit is moving cash in, not reading the books, so
   * the API never sends them those numbers in the first place.
   */
  full: boolean;
  canRecordDeposits: boolean;
  canRecordExpenses: boolean;
  canAddAccount: boolean;
};

export function AccountsView({
  summaries,
  entries,
  totals,
  full,
  canRecordDeposits,
  canRecordExpenses,
  canAddAccount,
}: AccountsViewProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [entryFor, setEntryFor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const active = summaries.filter((summary) => summary.account.active);
  const canRecord = canRecordDeposits || canRecordExpenses;

  return (
    <div className="accounts-view">
      {notice ? (
        <p className="accounts-notice" role="status">
          {notice}
        </p>
      ) : null}

      {full ? (
        <Widget
          eyebrow="المالية"
          title="أرصدة الحسابات"
          span={12}
          badge={
            canAddAccount ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                إضافة حساب
              </Button>
            ) : undefined
          }
        >
          <div className="accounts-totals">
            {(["SAR", "EGP"] as const).map((currency) => (
              <div className="accounts-total" key={currency}>
                <WidgetStat
                  label={`الرصيد (${currency})`}
                  value={currencyMoney(totals[currency].balance, currency)}
                  detail={`إيداعات ${currencyMoney(
                    totals[currency].deposits,
                    currency,
                  )} · مصروفات ${currencyMoney(
                    totals[currency].expenses,
                    currency,
                  )}`}
                  tone={totals[currency].balance >= 0 ? "green" : "red"}
                />
                <WidgetDivider />
              </div>
            ))}
          </div>
        </Widget>
      ) : (
        <Widget eyebrow="المالية" title="حسابات الإيداع" span={12}>
          <p className="accounts-scope-note">
            تُسجّل هنا إيداعات الحسابات المصرية فقط. لا تُعرض الأرصدة أو المصروفات.
          </p>
        </Widget>
      )}

      <div className="accounts-grid">
        {active.map((summary) => (
          <AccountCard
            key={summary.account.id}
            summary={summary}
            entries={entries}
            full={full}
            canRecord={canRecord}
            onRecord={() => setEntryFor(summary.account.id)}
          />
        ))}
      </div>

      <Modal
        open={addOpen}
        title="إضافة حساب بنكي"
        eyebrow="المالية"
        onClose={() => setAddOpen(false)}
      >
        <AccountForm
          onDone={(message) => {
            setNotice(message);
            setAddOpen(false);
            router.refresh();
          }}
        />
      </Modal>

      <Modal
        open={entryFor !== null}
        title="تسجيل حركة مالية"
        eyebrow="دفتر الحسابات"
        onClose={() => setEntryFor(null)}
      >
        {entryFor ? (
          <LedgerEntryForm
            accountId={entryFor}
            defaultKind="deposit"
            allowExpense={canRecordExpenses}
            onDone={(message) => {
              setNotice(message);
              setEntryFor(null);
              router.refresh();
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
