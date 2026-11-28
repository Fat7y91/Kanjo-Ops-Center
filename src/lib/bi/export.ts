import type { BiCell, BiColumn, BiTable } from "./types";

const CURRENCY_FORMAT = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});

const NUMBER_FORMAT = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  maximumFractionDigits: 0,
});

const DATE_FORMAT = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  dateStyle: "medium",
});

export function formatCell(value: BiCell, column: BiColumn): string {
  if (value == null) return "—";
  switch (column.type) {
    case "currency":
      return CURRENCY_FORMAT.format(Number(value));
    case "percent":
      return `${NUMBER_FORMAT.format(Number(value))}%`;
    case "number":
      return NUMBER_FORMAT.format(Number(value));
    case "date":
      return DATE_FORMAT.format(new Date(String(value)));
    default:
      return String(value);
  }
}

/**
 * Escapes a value for CSV. Quotes are doubled per RFC 4180 and any value that
 * contains a delimiter, quote or newline is wrapped in double quotes.
 */
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Converts a table to CSV.
 *
 * Raw values are exported (not localized strings) so Excel treats numbers and
 * dates as numeric data. A leading UTF-8 BOM keeps Arabic headers readable in
 * Excel on Windows.
 */
export function toCsv(table: BiTable): string {
  const header = table.columns.map((column) => escapeCsv(column.label)).join(",");
  const lines = table.rows.map((row) =>
    table.columns
      .map((column) => escapeCsv(String(row[column.key] ?? "")))
      .join(","),
  );
  return `\uFEFF${[header, ...lines].join("\r\n")}`;
}

/** Triggers a browser download for the given table. */
export function downloadCsv(table: BiTable, fileName?: string): void {
  if (typeof window === "undefined") return;
  const csv = toCsv(table);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileName ?? table.id}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
