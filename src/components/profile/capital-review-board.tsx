"use client";

import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menus";
import { Tabs } from "@/components/ui/tabs";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import {
  CAPITAL_STATUS_LABEL,
  type CapitalDeposit,
} from "@/lib/profile/capital";
import {
  PAYOUT_METHOD_LABEL,
  REVIEW_STATUS_LABEL,
  payoutDestinationLabel,
  type PayoutMethodRecord,
} from "@/lib/profile/types";

import { useCapitalReview } from "./use-capital-review";

type AccountOption = {
  id: string;
  bankName: string;
  currency: "EGP" | "SAR";
};

const TONE = {
  pending: "badge-gold",
  approved: "badge-green",
  rejected: "badge-red",
} as const;

export function CapitalReviewBoard({
  initialDeposits,
  initialPayouts,
  accounts,
  receiptUrls,
  currentUserId,
}: {
  initialDeposits: CapitalDeposit[];
  initialPayouts: PayoutMethodRecord[];
  accounts: AccountOption[];
  receiptUrls: Record<string, string>;
  currentUserId: string;
}) {
  const {
    deposits,
    payouts,
    error,
    busyId,
    accountByDeposit,
    setAccountByDeposit,
    pendingDeposits,
    pendingPayouts,
    decideDeposit,
    decidePayout,
  } = useCapitalReview(initialDeposits, initialPayouts);

  return (
    <div className="capital-review">
      {error ? <p className="form-error">{error}</p> : null}

      <Tabs
        items={[
          {
            id: "capital",
            label: "الإيداعات الرأسمالية",
            badge: pendingDeposits.length,
            content: (
              <div className="review-list">
                {pendingDeposits.length === 0 ? (
                  <p className="muted">لا توجد إيداعات تنتظر القرار.</p>
                ) : (
                  pendingDeposits.map((deposit) => {
                    const compatible = accounts.filter(
                      (account) => account.currency === deposit.currency,
                    );
                    const selfReview = deposit.founderId === currentUserId;

                    return (
                      <article key={deposit.id} className="review-row">
                        <div className="review-main">
                          <strong>
                            {currencyMoney(
                              deposit.amount / 100,
                              deposit.currency,
                            )}
                          </strong>
                          <span>
                            {deposit.founderName} ·{" "}
                            {shortDate(deposit.createdAt)}
                          </span>
                          {deposit.note ? (
                            <span className="muted">{deposit.note}</span>
                          ) : null}
                          {receiptUrls[deposit.id] ? (
                            <a
                              className="review-receipt"
                              href={receiptUrls[deposit.id]}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              عرض الإيصال
                            </a>
                          ) : (
                            <span className="muted">بلا إيصال</span>
                          )}
                        </div>

                        <div className="review-controls">
                          <SelectMenu
                            label="الحساب البنكي"
                            value={accountByDeposit[deposit.id] ?? null}
                            options={compatible.map((account) => ({
                              value: account.id,
                              label: account.bankName,
                            }))}
                            onChange={(value) =>
                              setAccountByDeposit((current) => ({
                                ...current,
                                [deposit.id]: value,
                              }))
                            }
                          />
                          <div className="review-actions">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={
                                busyId === deposit.id ||
                                selfReview ||
                                !accountByDeposit[deposit.id]
                              }
                              onClick={() => decideDeposit(deposit, "approved")}
                            >
                              اعتماد
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={busyId === deposit.id || selfReview}
                              onClick={() => decideDeposit(deposit, "rejected")}
                            >
                              رفض
                            </Button>
                          </div>
                          {selfReview ? (
                            <span className="form-hint">
                              لا يمكنك اعتماد إيداعك الخاص.
                            </span>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            ),
          },
          {
            id: "payouts",
            label: "بيانات الصرف",
            badge: pendingPayouts.length,
            content: (
              <div className="review-list">
                {pendingPayouts.length === 0 ? (
                  <p className="muted">لا توجد بيانات صرف تنتظر القرار.</p>
                ) : (
                  pendingPayouts.map((payout) => (
                    <article key={payout.id} className="review-row">
                      <div className="review-main">
                        <strong>{PAYOUT_METHOD_LABEL[payout.method]}</strong>
                        <span dir="ltr">{payoutDestinationLabel(payout)}</span>
                        <span className="muted">
                          {shortDate(payout.updatedAt)}
                        </span>
                      </div>
                      <div className="review-actions">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={
                            busyId === payout.id ||
                            payout.userId === currentUserId
                          }
                          onClick={() => decidePayout(payout, "approved")}
                        >
                          اعتماد
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={
                            busyId === payout.id ||
                            payout.userId === currentUserId
                          }
                          onClick={() => decidePayout(payout, "rejected")}
                        >
                          رفض
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ),
          },
          {
            id: "history",
            label: "السجل",
            content: (
              <div className="review-list">
                {deposits.length === 0 ? (
                  <p className="muted">لا توجد إيداعات مسجّلة.</p>
                ) : (
                  deposits.map((deposit) => (
                    <article key={deposit.id} className="review-row">
                      <div className="review-main">
                        <strong>
                          {currencyMoney(deposit.amount / 100, deposit.currency)}
                        </strong>
                        <span>
                          {deposit.founderName} ·{" "}
                          {shortDate(deposit.createdAt)}
                        </span>
                      </div>
                      <span className={`badge ${TONE[deposit.status]}`}>
                        {CAPITAL_STATUS_LABEL[deposit.status]}
                      </span>
                    </article>
                  ))
                )}
                {payouts.map((payout) => (
                  <article key={payout.id} className="review-row">
                    <div className="review-main">
                      <strong>{PAYOUT_METHOD_LABEL[payout.method]}</strong>
                      <span dir="ltr">{payoutDestinationLabel(payout)}</span>
                    </div>
                    <span className={`badge ${TONE[payout.status]}`}>
                      {REVIEW_STATUS_LABEL[payout.status]}
                    </span>
                  </article>
                ))}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
