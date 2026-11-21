"use client";

import { formatPrice } from "@/lib/catalog/format";
import type { ParsedPosSheet } from "@/lib/catalog/autopilot/types";

const COLUMN_LABELS: Record<string, string> = {
  name: "الاسم",
  price: "السعر",
  barcode: "الباركود",
  unit: "الوحدة",
  company: "الشركة",
  quantity: "الكمية",
};

export function AutopilotPreview({
  sheet,
  fileName,
}: {
  sheet: ParsedPosSheet;
  fileName: string;
}) {
  const columns = Object.entries(sheet.columns)
    .filter(([, index]) => index !== null)
    .map(([field]) => COLUMN_LABELS[field] ?? field);
  const rows = sheet.items.slice(0, 6);
  const hasCompany = rows.some((item) => item.company);
  const hasQuantity = rows.some((item) => item.quantity !== null);

  return (
    <div className="autopilot-preview">
      <div className="autopilot-file-line">
        <strong>{fileName}</strong>
        <span>{sheet.items.length.toLocaleString("ar-EG")} صف صالح</span>
        {sheet.mergedDuplicates > 0 ? (
          <span>
            دُمج {sheet.mergedDuplicates.toLocaleString("ar-EG")} صف مكرر
          </span>
        ) : null}
      </div>
      <p className="autopilot-note">
        {sheet.sheetName} · الأعمدة المكتشفة: {columns.join("، ") || "—"}
      </p>

      <div className="autopilot-table-wrap">
        <table className="autopilot-table">
          <thead>
            <tr>
              <th>الاسم</th>
              {hasCompany ? <th>الشركة</th> : null}
              <th>الباركود</th>
              <th>السعر</th>
              <th>الوحدة</th>
              {hasQuantity ? <th>الكمية</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.row}>
                <td>{item.name}</td>
                {hasCompany ? <td>{item.company || "—"}</td> : null}
                <td>{item.barcode || "—"}</td>
                <td>{formatPrice(item.priceMinor / 100)}</td>
                <td>{item.unit || "—"}</td>
                {hasQuantity ? (
                  <td>
                    {item.quantity === null
                      ? "—"
                      : item.quantity.toLocaleString("ar-EG")}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sheet.skipped.length > 0 ? (
        <div className="autopilot-skipped">
          <p>
            سيتم تجاهل {sheet.skipped.length.toLocaleString("ar-EG")} صف بدون
            سعر صالح.
          </p>
          <ul>
            {sheet.skipped.slice(0, 3).map((row) => (
              <li key={row.row}>
                صف {row.row}: {row.name || "بدون اسم"} — {row.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
