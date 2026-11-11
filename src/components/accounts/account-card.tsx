import { Button } from "@/components/ui/button";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import type { AccountSummary } from "@/lib/accounts/ledger";
import { LEDGER_KIND_META, type LedgerEntry } from "@/lib/accounts/types";

type AccountCardProps = {
  summary: AccountSummary;
  entries: LedgerEntry[];
  /** Full viewers see balances and expenses; deposit-only viewers do not. */
  full: boolean;
  canRecord: boolean;
  /**
   * The primary treasury card (the Egyptian bank, EGP). It is rendered larger
   * than the secondary card because it is where every operational settlement
   * posts, and it sits first in the RTL grid.
   */
  primary?: boolean;
  onRecord: () => void;
  /** Opens the voucher for a row when the viewer may read transactions. */
  onOpenEntry?: (entryId: string) => void;
};

export function AccountCard({
  summary,
  entries,
  full,
  canRecord,
  primary = false,
  onRecord,
  onOpenEntry,
}: AccountCardProps) {
  const recent = entries
    .filter((entry) => entry.accountId === summary.account.id)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, primary ? 8 : 4);

  return (
    <article
      className={`account-card${primary ? " account-card-primary" : " account-card-secondary"}`}
      data-currency={summary.account.currency}
    >
      <header className="account-card-head">
        <div>
          <span className="badge">{summary.account.currency}</span>
          <h3>{summary.account.bankName}</h3>
          <span className="account-iban" dir="ltr">
            {summary.account.iban}
          </span>
        </div>
        {full ? (
          <strong className="account-balance">
            {currencyMoney(summary.balance, summary.account.currency)}
          </strong>
        ) : null}
      </header>

      <dl className="account-metrics">
        {full ? (
          <>
            <div>
              <dt>الإيداعات</dt>
              <dd>
                {currencyMoney(summary.deposits, summary.account.currency)}
              </dd>
            </div>
            <div>
              <dt>المصروفات</dt>
              <dd>
                {currencyMoney(summary.expenses, summary.account.currency)}
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>رقم الحساب</dt>
          <dd dir="ltr">{summary.account.accountNumber}</dd>
        </div>
      </dl>

      <ul className="account-ledger">
        {recent.length === 0 ? (
          <li className="account-ledger-empty">لا توجد حركات مسجّلة.</li>
        ) : (
          recent.map((entry) => {
            const content = (
              <>
                <span className={`badge ${LEDGER_KIND_META[entry.kind].tone}`}>
                  {LEDGER_KIND_META[entry.kind].label}
                </span>
                <span className="account-ledger-label">{entry.label}</span>
                <span className="account-ledger-date">
                  {shortDate(entry.occurredAt)}
                </span>
                <strong>
                  {entry.kind === "expense" ? "−" : "+"}
                  {currencyMoney(entry.amount, entry.currency)}
                </strong>
              </>
            );

            return onOpenEntry ? (
              <li key={entry.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="account-ledger-row"
                  onClick={() => onOpenEntry(entry.entryId)}
                  aria-label={`عرض تفاصيل حركة ${entry.label}`}
                >
                  {content}
                </Button>
              </li>
            ) : (
              <li key={entry.id}>{content}</li>
            );
          })
        )}
      </ul>

      {canRecord ? (
        <Button size="sm" variant="quiet" onClick={onRecord}>
          تسجيل حركة
        </Button>
      ) : null}
    </article>
  );
}
