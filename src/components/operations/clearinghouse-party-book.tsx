"use client";

import { Button } from "@/components/ui/button";
import { operationMoney } from "@/lib/operations/format";
import { clearingWorkingDays, type ClearingRange } from "@/lib/operations/clearinghouse-view";
import type { ClearingAccountRow } from "@/lib/operations/types";

/**
 * The party book: one fixed-grid list of account balances, shared by the
 * payable and receivable panels.
 */

export function RoleBadge({
  partyType,
}: {
  partyType: ClearingAccountRow["partyType"];
}) {
  return (
    <span
      className={
        partyType === "merchant" ? "badge badge-blue" : "badge badge-orange"
      }
    >
      {partyType === "merchant" ? "تاجر" : "مندوب توصيل"}
    </span>
  );
}

type PartyBookProps = {
  accounts: ClearingAccountRow[];
  emptyLabel: string;
  range: ClearingRange;
  onOpenStatement: (accountId: string) => void;
  onQuickSettle?: (account: ClearingAccountRow) => void;
  /** Closing a balance outright requires the settlement grant. */
  canSettle: boolean;
};

export function PartyBook({
  accounts,
  emptyLabel,
  range,
  onOpenStatement,
  onQuickSettle,
  canSettle,
}: PartyBookProps) {
  if (accounts.length === 0) return <p className="muted">{emptyLabel}</p>;

  const total = accounts.reduce(
    (sum, account) => sum + Math.abs(account.balance),
    0,
  );
  const currency = accounts[0]?.currency ?? "EGP";

  return (
    <div className="clearing-party-table">
      <div className="clearing-party-head" aria-hidden="true">
        <span>الطرف</span>
        <span className="clearing-party-amount">المبلغ</span>
        <span />
      </div>

      <ul className="clearing-parties">
        {accounts.map((account) => {
          const days =
            account.partyType === "courier"
              ? clearingWorkingDays(account, range)
              : null;
          return (
            <li key={account.accountId} className="clearing-party-row">
              <div className="clearing-party-id">
                <strong title={account.partyName}>{account.partyName}</strong>
                <RoleBadge partyType={account.partyType} />
                {days !== null ? (
                  <span className="badge badge-gold">{days} أيام عمل</span>
                ) : null}
              </div>
              <strong
                className={`clearing-party-amount ${
                  account.balance > 0 ? "clearing-positive" : "clearing-negative"
                }`}
              >
                {operationMoney(Math.abs(account.balance), account.currency)}
              </strong>
              <div className="clearing-party-actions">
                {canSettle && onQuickSettle ? (
                  <Button
                    variant={account.balance > 0 ? "primary" : "accent"}
                    size="sm"
                    onClick={() => onQuickSettle(account)}
                  >
                    {account.balance > 0 ? "تحصيل" : "تسديد"}
                  </Button>
                ) : null}
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => onOpenStatement(account.accountId)}
                >
                  كشف حساب
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="clearing-party-total">
        <strong>الإجمالي</strong>
        <strong className="clearing-party-amount">
          {operationMoney(total, currency)}
        </strong>
        <span />
      </div>
    </div>
  );
}
