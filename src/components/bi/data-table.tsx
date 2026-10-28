"use client";

import { formatCell } from "@/lib/bi/export";
import type { BiTable } from "@/lib/bi/types";

export function DataTable({ table }: { table: BiTable }) {
  return (
    <div className="table-wrap bi-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th
                key={column.key}
                className={column.align === "end" ? "align-right" : undefined}
                scope="col"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={`${table.id}-${index}`}>
              {table.columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === "end" ? "align-right" : undefined}
                >
                  {formatCell(row[column.key], column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length === 0 ? (
        <p className="bi-empty">لا توجد سجلات مطابقة للفلاتر الحالية.</p>
      ) : null}
    </div>
  );
}
