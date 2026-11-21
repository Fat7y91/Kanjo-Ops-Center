"use client";

import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { currencyMoney, fullDateTime } from "@/lib/accounts/format";
import type { JournalEntryDetail, JournalLineDetail } from "@/lib/journal/types";
import {
  lineLabel,
  splitSides,
  voucherAmount,
  voucherParties,
} from "@/lib/journal/voucher";

type JournalVoucherModalProps = {
  open: boolean;
  loading: boolean;
  error: string;
  voucher: JournalEntryDetail | null;
  onClose: () => void;
  onRetry: () => void;
};

const SIDE_LABEL: Record<JournalLineDetail["side"], string> = {
  debit: "مدين",
  credit: "دائن",
};

const SOURCE_LABEL: Record<string, string> = {
  operation: "عملية توصيل",
  merchant_settlement: "تسوية تاجر",
  courier_payout: "سداد مندوب",
  coupon_budget: "تمويل كوبون",
  capital: "إيداع رأس مال",
  manual: "حركة يدوية",
  fx_transfer: "تحويل عملة",
  opening: "رصيد افتتاحي",
  reversal: "قيد عكسي",
};

function Detail({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="voucher-detail">
      <dt>{label}</dt>
      <dd dir={ltr ? "ltr" : undefined}>{value}</dd>
    </div>
  );
}

function ReceiptBlock({ voucher }: { voucher: JournalEntryDetail }) {
  const receipt = voucher.receipt;
  if (!receipt) return null;

  const isImage = receipt.mimeType.startsWith("image/");
  const isPdf = receipt.mimeType === "application/pdf";

  return (
    <section className="voucher-section">
      <h3>الإيصال</h3>
      <div className="voucher-receipt-meta">
        <span>
          رقم الإيصال: <strong dir="ltr">{receipt.receiptNo}</strong>
        </span>
        <span>{fullDateTime(receipt.uploadedAt)}</span>
      </div>

      {receipt.url === null ? (
        <p className="muted">تعذر إرفاق رابط الإيصال. أعد المحاولة لاحقاً.</p>
      ) : isImage ? (
        <img
          className="voucher-receipt-image"
          src={receipt.url}
          alt={`إيصال ${receipt.receiptNo}`}
        />
      ) : isPdf ? (
        <Button as="a" href={receipt.url} target="_blank" rel="noopener noreferrer">
          فتح الإيصال (PDF)
        </Button>
      ) : (
        <Button as="a" href={receipt.url} target="_blank" rel="noopener noreferrer">
          فتح المرفق
        </Button>
      )}
    </section>
  );
}

/**
 * Digital voucher for one journal entry.
 *
 * A ledger row is one leg of a balanced entry; this dialog shows both legs, the
 * resolved party, the reason, the reference and the attached receipt, so every
 * movement can be traced without leaving the screen.
 */
export function JournalVoucherModal({
  open,
  loading,
  error,
  voucher,
  onClose,
  onRetry,
}: JournalVoucherModalProps) {
  const currency = voucher?.currency ?? "EGP";
  const money = (value: number) => currencyMoney(value, currency);

  const sides = splitSides(voucher?.lines ?? []);
  const partyNames = voucher ? voucherParties(voucher) : [];
  const amount = voucher ? voucherAmount(voucher) : 0;

  return (
    <Modal
      open={open}
      title="تفاصيل الحركة"
      eyebrow="سند قيد"
      onClose={onClose}
      wide
    >
      {loading ? <p className="muted">جارٍ تحميل تفاصيل الحركة…</p> : null}

      {!loading && error ? (
        <div className="breakdown-error" role="alert">
          <p className="form-error">{error}</p>
          <div className="form-actions">
            <Button variant="primary" size="sm" onClick={onRetry}>
              إعادة المحاولة
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && !error && voucher ? (
        <div className="voucher" dir="rtl">
          <header className="voucher-head">
            <div>
              <h3 dir="ltr">{voucher.entryNo}</h3>
              <p className="muted">{fullDateTime(voucher.createdAt)}</p>
            </div>
            <strong className="voucher-amount" dir="ltr">
              {money(amount)}
            </strong>
          </header>

          <section className="voucher-section">
            <h3>بيانات الحركة</h3>
            <dl className="voucher-details">
              <Detail label="التاريخ" value={fullDateTime(voucher.createdAt)} />
              <Detail
                label="الرقم المرجعي"
                value={voucher.entryId}
                ltr
              />
              <Detail
                label="نوع المصدر"
                value={SOURCE_LABEL[voucher.sourceType] ?? voucher.sourceType}
              />
              <Detail
                label="المرجع الخارجي"
                value={voucher.sourceId ?? "—"}
                ltr
              />
              <Detail
                label="الطرف"
                value={
                  partyNames.length > 0 ? partyNames.join(" · ") : "بدون طرف"
                }
              />
              <Detail
                label="البيان"
                value={voucher.memo.trim() === "" ? "—" : voucher.memo}
              />
            </dl>
          </section>

          <section className="voucher-section">
            <h3>من وإلى</h3>
            <div className="voucher-sides">
              <div className="voucher-side voucher-side-debit">
                <span className="voucher-side-tag">مدين</span>
                <ul>
                  {sides.debits.map((line) => (
                    <li key={line.id}>
                      <strong>{lineLabel(line)}</strong>
                      <span dir="ltr">{money(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="voucher-side voucher-side-credit">
                <span className="voucher-side-tag">دائن</span>
                <ul>
                  {sides.credits.map((line) => (
                    <li key={line.id}>
                      <strong>{lineLabel(line)}</strong>
                      <span dir="ltr">{money(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="voucher-section">
            <h3>أطراف القيد</h3>
            <table className="breakdown-journal voucher-lines">
              <thead>
                <tr>
                  <th>الحساب</th>
                  <th>الجانب</th>
                  <th>المبلغ</th>
                  <th>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {voucher.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{lineLabel(line)}</td>
                    <td>{SIDE_LABEL[line.side]}</td>
                    <td dir="ltr">{money(line.amount)}</td>
                    <td>{line.memo || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>الإجمالي</td>
                  <td dir="ltr">{money(amount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>

          <ReceiptBlock voucher={voucher} />

          <div className="breakdown-foot">
            <Button variant="quiet" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
