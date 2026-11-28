import {
  riderDate,
  riderMoney,
  riderStatusLabel,
} from "@/lib/riders/format";
import { totalItemCount } from "@/lib/riders/totals";
import type { RiderCustodyReceipt } from "@/lib/riders/types";

type CustodyReceiptPrintProps = {
  receipt: RiderCustodyReceipt;
  locationLabel: string;
};

function CutMark() {
  return (
    <div className="custody-cut" aria-hidden="true">
      <span className="custody-cut-line" />
      <span className="custody-cut-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M8.1 8.1 20 20M8.1 15.9 20 4" />
        </svg>
        خط القص
      </span>
      <span className="custody-cut-line" />
    </div>
  );
}

export function CustodyReceiptPrint({
  receipt,
  locationLabel,
}: CustodyReceiptPrintProps) {
  const items = receipt.items.filter((item) => item.quantity > 0);
  const itemCount = totalItemCount(receipt.items);
  const date = riderDate(receipt.deliveryDate);

  return (
    <article className="custody-sheet">
      <section className="custody-receipt">
        <header className="custody-head">
          <div className="custody-brand">
            <span className="custody-logo-plate">
              <img src="/logo.png" alt="" className="custody-logo" />
            </span>
            <div>
              <strong>كانجو</strong>
              <span>منظومة مناديب التوصيل</span>
            </div>
          </div>

          <div className="custody-title">
            <p>KANJO · CUSTODY RECEIPT</p>
            <h1>إيصال عهدة مندوب</h1>
            <span dir="ltr">{receipt.custodyNumber}</span>
          </div>

          <div className="custody-meta">
            <div>
              <span>تاريخ التسليم</span>
              <strong>{date}</strong>
            </div>
            <div>
              <span>الحالة</span>
              <strong>{riderStatusLabel(receipt.rider.status)}</strong>
            </div>
          </div>
        </header>

        <div className="custody-hero">
          <div className="custody-hero-id">
            <span className="custody-hero-label">المندوب المسلَّم إليه</span>
            <strong>{receipt.rider.fullName}</strong>
            <span className="custody-hero-code" dir="ltr">
              {receipt.rider.riderCode || "—"}
            </span>
          </div>
          <div className="custody-hero-stats">
            <div>
              <span>الرقم القومي</span>
              <strong dir="ltr">{receipt.rider.nationalId || "—"}</strong>
            </div>
            <div>
              <span>الهاتف</span>
              <strong dir="ltr">{receipt.rider.phone}</strong>
            </div>
            <div>
              <span>منطقة العمل</span>
              <strong>{receipt.rider.workArea || "—"}</strong>
            </div>
            <div>
              <span>الموقع</span>
              <strong>{locationLabel}</strong>
            </div>
          </div>
        </div>

        <table className="custody-table">
          <thead>
            <tr>
              <th>#</th>
              <th>البند</th>
              <th>السيريال</th>
              <th>الحالة</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="custody-table-empty">
                  لا توجد أدوات مسلّمة، العهدة نقدية فقط.
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={`${item.key}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{item.label}</td>
                  <td dir="ltr">{item.serial ?? "—"}</td>
                  <td>{item.condition}</td>
                  <td>{item.quantity}</td>
                  <td dir="ltr">{riderMoney(item.unitPrice)}</td>
                  <td dir="ltr">{riderMoney(item.lineTotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="custody-totals">
          <div className="custody-total-row">
            <span>العهد النقدية</span>
            <strong dir="ltr">{riderMoney(receipt.cashCustody)}</strong>
          </div>
          <div className="custody-total-row is-grand">
            <span>إجمالي العهدة</span>
            <strong dir="ltr">{riderMoney(receipt.totalAmount)}</strong>
          </div>
          <p className="custody-words">فقط {receipt.totalAmountWords}</p>
        </div>

        {receipt.notes ? (
          <p className="custody-notes">
            <strong>ملاحظات:</strong> {receipt.notes}
          </p>
        ) : null}

        <p className="custody-acknowledge">
          أقر أنا الموقّع أدناه باستلام العهدة الموضّحة أعلاه بكامل بنودها
          وقيمتها، وألتزم بالحفاظ عليها وإعادتها أو تسويتها عند الطلب.
        </p>

        <div className="custody-signatures">
          <div>
            <span>توقيع المندوب</span>
            <span className="custody-sign-line" />
            <small>{receipt.rider.fullName}</small>
          </div>
          <div>
            <span>مسؤول التسليم</span>
            <span className="custody-sign-line" />
            <small>{receipt.handoverOfficer}</small>
          </div>
        </div>

        <footer className="custody-foot">
          <span>عدد القطع: {itemCount}</span>
          <span>أُصدر بتاريخ {riderDate(receipt.createdAt)}</span>
        </footer>
      </section>

      <CutMark />

      <section className="wallet-card">
        <div className="wallet-card-head">
          <div className="wallet-card-brand">
            <span className="wallet-card-logo">
              <img src="/logo.png" alt="" />
            </span>
            <div>
              <strong>كانجو</strong>
              <span>بطاقة عهدة مندوب توصيل</span>
            </div>
          </div>
          <span className="wallet-card-chip" aria-hidden="true" />
        </div>

        <div className="wallet-card-body">
          <div className="wallet-card-name">
            <span>اسم المندوب</span>
            <strong>{receipt.rider.fullName}</strong>
          </div>
          <div className="wallet-card-grid">
            <div>
              <span>كود المندوب</span>
              <strong dir="ltr">{receipt.rider.riderCode || "—"}</strong>
            </div>
            <div>
              <span>رقم العهدة</span>
              <strong dir="ltr">{receipt.custodyNumber}</strong>
            </div>
            <div>
              <span>الهاتف</span>
              <strong dir="ltr">{receipt.rider.phone}</strong>
            </div>
            <div>
              <span>تاريخ التسليم</span>
              <strong>{date}</strong>
            </div>
            <div>
              <span>عدد القطع</span>
              <strong>{itemCount}</strong>
            </div>
            <div>
              <span>إجمالي العهدة</span>
              <strong dir="ltr">{riderMoney(receipt.totalAmount)}</strong>
            </div>
          </div>
        </div>

        <footer className="wallet-card-foot">
          <span>{locationLabel}</span>
          <span>{receipt.handoverOfficer}</span>
        </footer>
      </section>
    </article>
  );
}
