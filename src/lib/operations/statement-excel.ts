import { excelFileName, statementFileBase } from "@/lib/exports/file-names";

import type { PartyStatement } from "./types";
import { buildStatementSheet } from "./statement-sheet-model";

export type { StatementSheetModel } from "./statement-sheet-model";
export { buildStatementSheet } from "./statement-sheet-model";

const PURPLE = "FF230535";
const GOLD = "FFD97434";
const SOFT = "FFF7F2FA";
const LINE = "FFE4D9EC";

const MERCHANT_WIDTHS = [22, 40, 22, 16, 16, 18];
const COURIER_WIDTHS = [22, 52, 16, 16, 18];

export async function exportStatementExcel(
  statement: PartyStatement,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const model = buildStatementSheet(statement);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kanjo";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("كشف الحساب", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 9 }],
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  const widths = model.headers.length === 6 ? MERCHANT_WIDTHS : COURIER_WIDTHS;
  sheet.columns = widths.map((width) => ({ width }));

  const lastColumn = String.fromCharCode(64 + model.headers.length);
  const courierColumn = model.headers.indexOf("مندوب التوصيل") + 1;

  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.getCell("A1").value = "كانچو للتوصيل والتجارة الإلكترونية";
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
  sheet.getCell("A2").value = model.title;
  sheet.getCell("A2").font = {
    name: "Cairo",
    size: 14,
    bold: true,
    color: { argb: PURPLE },
  };
  sheet.getCell("A2").alignment = { horizontal: "center" };
  sheet.getRow(2).height = 24;

  const meta: [string, string | number][] = [
    ["اسم الجهة", model.partyName],
    ["نوع الشريك", model.partyTypeLabel],
    ["العملة", model.currency],
    ["الفترة", model.periodLabel],
    ["عدد الطلبات", model.orderCountLabel],
  ];
  if (model.workingDays !== null) {
    meta.push(["أيام العمل", model.workingDays]);
  }
  meta.forEach(([label, value], index) => {
    const row = sheet.getRow(3 + index);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { name: "Cairo", bold: true, color: { argb: PURPLE } };
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: SOFT },
    };
    row.getCell(2).font = { name: "Cairo" };
    row.getCell(1).border = row.getCell(2).border = {
      top: { style: "thin", color: { argb: LINE } },
      bottom: { style: "thin", color: { argb: LINE } },
      left: { style: "thin", color: { argb: LINE } },
      right: { style: "thin", color: { argb: LINE } },
    };
  });

  const summaryRow = 3 + meta.length;
  const summary: [string, string | number][] = [
    ["إجمالي المدين", model.debit],
    ["إجمالي الدائن", model.credit],
    ["عدد الطلبات", model.orderCountLabel],
    ["الرصيد الختامي", model.closing],
  ];
  summary.forEach(([label, value], index) => {
    const row = sheet.getRow(summaryRow + index);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(1).font = { name: "Cairo", bold: true, color: { argb: PURPLE } };
    row.getCell(2).font = { name: "Cairo", bold: true };
    if (label !== "عدد الطلبات") row.getCell(2).numFmt = "#,##0.00";
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: label === "الرصيد الختامي" ? "FFFDF3DC" : SOFT },
    };
    row.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: label === "الرصيد الختامي" ? "FFFDF3DC" : SOFT },
    };
  });

  const tableStart = summaryRow + summary.length + 1;
  const header = sheet.getRow(tableStart);
  header.values = model.headers;
  header.eachCell((cell) => {
    cell.font = {
      name: "Cairo",
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PURPLE },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      bottom: { style: "medium", color: { argb: GOLD } },
    };
  });
  header.height = 24;

  model.rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(tableStart + 1 + rowIndex);
    row.values = values;
    row.eachCell((cell, column) => {
      const isAmount = column >= model.amountStart;
      cell.font = { name: "Cairo", size: 10 };
      cell.alignment = {
        horizontal: isAmount ? "left" : "right",
        vertical: "middle",
        wrapText: column === model.referenceColumn || column === courierColumn,
      };
      if (isAmount) cell.numFmt = "#,##0.00";
      cell.border = {
        bottom: { style: "hair", color: { argb: LINE } },
      };
      if (rowIndex % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFAF7FC" },
        };
      }
    });
  });

  const totalRow = sheet.getRow(tableStart + model.rows.length + 1);
  totalRow.values = model.totals;
  totalRow.eachCell((cell, column) => {
    const isAmount = column >= model.amountStart;
    cell.font = { name: "Cairo", bold: true, color: { argb: "FF230535" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3E9D6" },
    };
    cell.alignment = { horizontal: isAmount ? "left" : "right" };
    if (isAmount) cell.numFmt = "#,##0.00";
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
  anchor.download = excelFileName(
    statementFileBase(statement.partyType, statement.partyName),
  );
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
