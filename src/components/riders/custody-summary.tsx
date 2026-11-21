"use client";

import { riderMoney } from "@/lib/riders/format";
import { itemsTotal } from "@/lib/riders/totals";
import type { CustodyItem } from "@/lib/riders/types";

type CustodySummaryProps = {
  items: CustodyItem[];
  cashCustody: number;
  total: number;
  words: string;
  itemCount: number;
};

export function CustodySummary({
  items,
  cashCustody,
  total,
  words,
  itemCount,
}: CustodySummaryProps) {
  const lines = itemsTotal(items);

  return (
    <div className="custody-summary">
      <div className="custody-summary-row">
        <span>بنود العهدة</span>
        <span dir="ltr">{riderMoney(lines)}</span>
      </div>
      <div className="custody-summary-row">
        <span>العهدة النقدية</span>
        <span dir="ltr">{riderMoney(cashCustody)}</span>
      </div>
      <div className="custody-summary-total">
        <div>
          <span>الإجمالي</span>
          <strong dir="ltr">{riderMoney(total)}</strong>
        </div>
        <p>{words}</p>
      </div>
      <p className="custody-summary-count">{itemCount} قطعة داخل العهدة</p>
    </div>
  );
}
