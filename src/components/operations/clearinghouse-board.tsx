"use client";

import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/form-inputs";
import { operationMoney } from "@/lib/operations/format";
import type { ClearingAccountRow } from "@/lib/operations/types";

import { useClearinghouse } from "./use-clearinghouse";

function PartyBook({
  accounts,
  emptyLabel,
}: {
  accounts: ClearingAccountRow[];
  emptyLabel: string;
}) {
  if (accounts.length === 0) return <p className="muted">{emptyLabel}</p>;

  return (
    <ul className="clearing-parties">
      {accounts.map((account) => (
        <li key={account.accountId}>
          <div>
            <strong>{account.partyName}</strong>
            <span className="muted">
              {account.partyType === "merchant" ? "تاجر" : "مندوب"}
            </span>
          </div>
          <strong
            className={
              account.balance > 0 ? "clearing-positive" : "clearing-negative"
            }
          >
            {operationMoney(Math.abs(account.balance), account.currency)}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function AccountRows({
  accounts,
  busyId,
  receiptNo,
  setReceiptNo,
  setFile,
  settle,
}: {
  accounts: ClearingAccountRow[];
  busyId: string;
  receiptNo: Record<string, string>;
  setReceiptNo: (
    update: (current: Record<string, string>) => Record<string, string>,
  ) => void;
  setFile: (
    update: (current: Record<string, File | null>) => Record<string, File | null>,
  ) => void;
  settle: (account: ClearingAccountRow) => void;
}) {
  if (accounts.length === 0) {
    return <p className="muted">لا توجد أرصدة مفتوحة في هذه القائمة.</p>;
  }

  return (
    <ul className="clearing-rows">
      {accounts.map((account) => (
        <li key={account.accountId}>
          <div className="clearing-row-main">
            <strong>{account.partyName}</strong>
            <span>
              {account.partyType === "merchant" ? "تاجر" : "مندوب"}
            </span>
          </div>

          <div className="clearing-row-amount">
            <strong
              className={
                account.balance > 0 ? "clearing-positive" : "clearing-negative"
              }
            >
              {operationMoney(Math.abs(account.balance), account.currency)}
            </strong>
            <span className="badge badge-gold">
              {account.balance > 0 ? "مستحق لنا" : "مستحق لهم"}
            </span>
          </div>

          <div className="clearing-row-actions">
            <TextField
              fieldClassName="clearing-receipt"
              placeholder="رقم الإيصال (اختياري)"
              value={receiptNo[account.accountId] ?? ""}
              onChange={(event) =>
                setReceiptNo((current) => ({
                  ...current,
                  [account.accountId]: event.target.value,
                }))
              }
            />
            <input
              type="file"
              className="clearing-receipt"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) =>
                setFile((current) => ({
                  ...current,
                  [account.accountId]: event.target.files?.[0] ?? null,
                }))
              }
            />
            <Button
              variant="primary"
              size="sm"
              disabled={busyId === account.accountId}
              onClick={() => settle(account)}
            >
              {account.balance > 0 ? "تحصيل" : "سداد"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ClearinghouseBoard({
  initialAccounts,
  initialPayables,
  initialReceivables,
}: {
  initialAccounts: ClearingAccountRow[];
  initialPayables: ClearingAccountRow[];
  initialReceivables: ClearingAccountRow[];
}) {
  const {
    accounts,
    payables,
    receivables,
    busyId,
    error,
    receiptNo,
    setReceiptNo,
    setFile,
    settle,
  } = useClearinghouse(initialAccounts, initialPayables, initialReceivables);

  const rowsProps = {
    accounts,
    busyId,
    receiptNo,
    setReceiptNo,
    setFile,
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
              <div className="clearing-book">
                <article className="panel">
                  <div className="panel-head">
                    <h2>مستحق لهم</h2>
                    <span className="muted">مبالغ على كانجو سدادها</span>
                  </div>
                  <PartyBook
                    accounts={payables}
                    emptyLabel="لا توجد مبالغ مستحقة السداد."
                  />
                </article>

                <article className="panel">
                  <div className="panel-head">
                    <h2>مستحق لنا</h2>
                    <span className="muted">مبالغ على التجار والمناديب تحصيلها</span>
                  </div>
                  <PartyBook
                    accounts={receivables}
                    emptyLabel="لا توجد مبالغ مستحقة التحصيل."
                  />
                </article>
              </div>
            ),
          },
          {
            id: "accounts",
            label: "أرصدة الأطراف",
            content: <AccountRows {...rowsProps} />,
          },
        ]}
      />
    </div>
  );
}
