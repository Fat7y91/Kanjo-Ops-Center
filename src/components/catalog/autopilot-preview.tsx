"use client";

import { formatPrice } from "@/lib/catalog/format";
import type { ParsedPosSheet } from "@/lib/catalog/autopilot/types";

const COLUMN_LABELS: Record<string, string> = {
  name: "الاسم",
  price: "السعر",
  barcode: "الباركود",
  unit: "الوحدة",
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

  return (
    <div className="autopilot-preview">
      <div className="autopilot-file-line">
        <strong>{fileName}</strong>
        <span>{sheet.items.length.toLocaleString("ar-EG")} صف صالح</span>
      </div>
      <p className="autopilot-note">
        {sheet.sheetName} · الأعمدة المكتشفة: {columns.join("، ") || "—"}
      </p>

      <div className="autopilot-table-wrap">
        <table className="autopilot-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الباركود</th>
              <th>السعر</th>
              <th>الوحدة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.row}>
                <td>{item.name}</td>
                <td>{item.barcode || "—"}</td>
                <td>{formatPrice(item.priceMinor / 100)}</td>
                <td>{item.unit || "—"}</td>
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
