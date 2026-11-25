import type { ClearingReport, ClearingReportRow } from "./clearing-report";

const PURPLE = "FF230535";
const GOLD = "FFD97434";
const SOFT = "FFF7F2FA";
const LINE = "FFE4D9EC";

export function reportHeaders(report: ClearingReport): string[] {
  const headers = ["الطرف", "النوع", "عدد الطلبات"];
  if (report.rows.some((row) => row.workingDays !== null)) {
    headers.push("أيام العمل");
  }
  return [
    ...headers,
    "إجمالي المدين",
    "إجمالي الدائن",
    "صافي الرصيد",
    "العملة",
  ];
}

export function reportRowValues(
  report: ClearingReport,
  row: ClearingReportRow,
): (string | number)[] {
  const values: (string | number)[] = [
    row.partyName,
    row.partyType === "merchant" ? "تاجر" : "مندوب توصيل",
    row.orderCount,
  ];
  if (report.rows.some((item) => item.workingDays !== null)) {
    values.push(row.workingDays ?? "");
  }
  return [
    ...values,
    row.debit,
    row.credit,
    Math.abs(row.net),
    row.currency,
  ];
}

export function reportFileName(report: ClearingReport): string {
  const kind = report.kind === "collections" ? "collections" : "payables";
  return `kanjo-${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export async function exportClearingReportExcel(
  report: ClearingReport,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kanjo";
  workbook.created = new Date();

  const headers = reportHeaders(report);
  const sheet = workbook.addWorksheet("التقرير", {
    views: [
      {
        rightToLeft: true,
        state: "frozen",
        ySplit: 8,
      },
    ],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  sheet.columns = [
    { width: 36 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 10 },
  ];

  const lastColumn = String.fromCharCode(64 + headers.length);
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell("A1").value = "كانجو للتوصيل والتجارة الإلكترونية";
  sheet.getCell("A1").font = {
    name: "Cairo",
    size: 18,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: PURPLE },
  };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 32;

  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getCell("A2").value = report.title;
  sheet.getCell("A2").font = {
    name: "Cairo",
    size: 14,
    bold: true,
    color: { argb: PURPLE },
  };
  sheet.getCell("A2").alignment = { horizontal: "center" };
  sheet.getRow(2).height = 24;

  const meta: [string, string][] = [
    ["الفترة", report.periodLabel],
    ["تاريخ التصدير", report.generatedAt],
    ["العملة", report.currency],
  ];
  meta.forEach(([label, value], index) => {
    const row = sheet.getRow(3 + index);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = {
      name: "Cairo",
      bold: true,
      color: { argb: PURPLE },
    };
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: SOFT },
    };
    row.getCell(2).font = { name: "Cairo" };
  });

  const tableStart = 7;
  const header = sheet.getRow(tableStart);
  header.values = headers;
  header.eachCell((cell) => {
    cell.font = { name: "Cairo", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PURPLE },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: GOLD } },
    };
  });
  header.height = 30;

  report.rows.forEach((row, index) => {
    const target = sheet.getRow(tableStart + 1 + index);
    target.values = reportRowValues(report, row);
    target.eachCell((cell, column) => {
      cell.font = { name: "Cairo", size: 10 };
      cell.alignment = {
        horizontal: column === 1 ? "right" : "center",
        vertical: "middle",
        wrapText: column === 1,
      };
      if ([4, 5, 6, 7].includes(column) && headers.length > 5) {
        cell.numFmt = "#,##0.00";
      }
      cell.border = {
        bottom: { style: "hair", color: { argb: LINE } },
      };
      if (index % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFAF7FC" },
        };
      }
    });
  });

  const totalValues: (string | number)[] = [
    "الإجمالي",
    "",
    report.totals.orders,
  ];
  if (headers.includes("أيام العمل")) totalValues.push(report.totals.workingDays);
  totalValues.push(
    report.totals.debit,
    report.totals.credit,
    report.totals.net,
    report.currency,
  );

  const totalRow = sheet.getRow(tableStart + 1 + report.rows.length);
  totalRow.values = totalValues;
  totalRow.eachCell((cell, column) => {
    cell.font = { name: "Cairo", bold: true, color: { argb: "FF230535" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3E9D6" },
    };
    cell.alignment = { horizontal: "center" };
    if (column >= 5) cell.numFmt = "#,##0.00";
    cell.border = {
      top: { style: "medium", color: { argb: GOLD } },
      bottom: { style: "double", color: { argb: PURPLE } },
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportFileName(report);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
