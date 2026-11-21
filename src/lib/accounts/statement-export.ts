import type { AccountStatement, StatementLine } from "./statement";

/**
 * Excel and print export for a bank statement.
 *
 * Mirrors the merchant export route: SpreadsheetML 2003 is written directly, so
 * the project carries no spreadsheet dependency and Excel/LibreOffice open the
 * file natively. The workbook is generated from the same shaped statement the
 * screen renders, so the download can never disagree with the page.
 */

const HEADERS = [
  "التاريخ",
  "البيان",
  "المصدر / الوجهة",
  "وارد",
  "صادر",
  "الرصيد",
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stringCell(value: string): string {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numberCell(value: number): string {
  return `<Cell ss:StyleID="money"><Data ss:Type="Number">${value}</Data></Cell>`;
}

function summaryRow(label: string, value: number): string {
  return `<Row>${stringCell(label)}${numberCell(value)}</Row>`;
}

function statementRow(line: StatementLine): string {
  return [
    "<Row>",
    stringCell(line.date.slice(0, 10)),
    stringCell(line.reference),
    stringCell(line.counterparty || "—"),
    numberCell(line.in),
    numberCell(line.out),
    numberCell(line.running),
    "</Row>",
  ].join("");
}

/**
 * Builds the SpreadsheetML document for one statement.
 *
 * The summary block sits above the movement table so a printed or exported
 * statement reconciles from opening to closing in one view.
 */
export function statementWorkbook(statement: AccountStatement): string {
  const rows = [
    `<Row>${stringCell("الحساب")}${stringCell(statement.accountName)}</Row>`,
    `<Row>${stringCell("رقم الحساب")}${stringCell(statement.accountNumber)}</Row>`,
    `<Row>${stringCell("العملة")}${stringCell(statement.currency)}</Row>`,
    summaryRow("الرصيد الافتتاحي", statement.opening),
    summaryRow("إجمالي الوارد", statement.totalIn),
    summaryRow("إجمالي الصادر", statement.totalOut),
    summaryRow("الرصيد الختامي", statement.closing),
    "<Row/>",
    `<Row>${HEADERS.map(stringCell).join("")}</Row>`,
    ...statement.lines.map(statementRow),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="money">
      <NumberFormat ss:Format="#,##0.00"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Statement">
    <Table>${rows}</Table>
  </Worksheet>
</Workbook>`;
}

/** Triggers a browser download of the statement as an Excel workbook. */
export function downloadStatement(statement: AccountStatement): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([statementWorkbook(statement)], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kanjo-statement-${statement.accountNumber}-${new Date()
    .toISOString()
    .slice(0, 10)}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
