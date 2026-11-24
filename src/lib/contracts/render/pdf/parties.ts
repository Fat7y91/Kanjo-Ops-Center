/**
 * Parties section for the contract document.
 *
 * A date preamble followed by two crisp, bordered key-value tables: the first
 * party is Kanjo's fixed registration data, the second is the merchant's legal
 * identity. Labels sit in the right column and values in the left so every row
 * aligns on the reading start, and optional fields render as an em dash instead
 * of an empty cell.
 */

import { TEXT, type DocumentWriter } from "@/lib/pdf";

import { KANJO_FIRST_PARTY } from "../constants";
import { BRANCH_SCOPE_SUFFIX } from "../data/clauses";
import type { ContractDocumentInput } from "../input";
import { drawPartyTable, type PartyTableRow } from "./party-table";

function datePreamble(writer: DocumentWriter): void {
  writer.ensure(40);
  const { canvas } = writer;
  const top = writer.y;
  canvas.text(
    [
      {
        text: "إنه في يوم: ............................ الموافق: ...... / ...... / ............ م، تم الاتفاق والتراضي بين كل من:",
      },
    ],
    {
      x: writer.left,
      y: top - TEXT.body.size,
      size: TEXT.body.size,
      maxWidth: writer.contentWidth,
      align: "start",
      direction: "rtl",
      color: TEXT.body.color,
    },
  );
  writer.commit(TEXT.body.size + 12, 14);
}

function firstPartyRows(input: ContractDocumentInput): PartyTableRow[] {
  if (input.firstPartyRows && input.firstPartyRows.length > 0) {
    return input.firstPartyRows.map((row) => ({
      label: row.label || "بيان",
      value: row.value,
    }));
  }
  return [
    {
      label: "الاسم القانوني",
      value: KANJO_FIRST_PARTY.tradeName,
    },
    {
      label: "السجل التجاري",
      value: `${KANJO_FIRST_PARTY.commercialRegister} — ${KANJO_FIRST_PARTY.commercialRegisterOffice}`,
    },
    {
      label: "البطاقة الضريبية",
      value: `${KANJO_FIRST_PARTY.taxCard} — ${KANJO_FIRST_PARTY.taxOffice}`,
    },
    {
      label: "المقر",
      value: KANJO_FIRST_PARTY.address,
    },
    {
      label: "يمثلها",
      value: "م/ محمود الجمل — مدير التشغيل والتعاقدات",
    },
  ];
}

function secondPartyRows(input: ContractDocumentInput): PartyTableRow[] {
  if (input.secondPartyRows && input.secondPartyRows.length > 0) {
    return input.secondPartyRows.map((row) => ({
      label: row.label || "بيان",
      value: row.value,
    }));
  }

  const legalName = input.legalName?.trim();
  const entity = legalName
    ? `${legalName}${BRANCH_SCOPE_SUFFIX}`
    : input.merchantName;

  return [
    { label: "اسم المنشأة / المحل", value: entity },
    {
      label: "اسم المفوض / صاحب النشاط",
      value: input.legalRepresentativeName?.trim() || input.contactName || "",
    },
    {
      label: "صفة المفوض",
      value: input.legalRepresentativeTitle?.trim() || "",
    },
    {
      label: "الرقم القومي للمنشأة",
      value: input.legalRepresentativeNationalId?.trim() || "",
    },
    { label: "رقم السجل التجاري", value: input.commercialRegisterNo?.trim() || "" },
    { label: "رقم التسجيل الضريبي", value: input.taxCardNo?.trim() || "" },
    { label: "رقم الهاتف / واتساب", value: input.contactPhone || "" },
    { label: "البريد الإلكتروني", value: "" },
    {
      label: "العنوان",
      value: input.legalAddress?.trim() || input.address || "",
    },
  ];
}

/** Draws the preamble date and both identification tables. */
export function drawParties(writer: DocumentWriter, input: ContractDocumentInput): void {
  datePreamble(writer);
  drawPartyTable(
    writer,
    "royal",
    "الطرف الأول: شركة كاند جوو",
    KANJO_FIRST_PARTY.tradeName,
    firstPartyRows(input),
  );
  drawPartyTable(
    writer,
    "gold",
    "الطرف الثاني: التاجر",
    `${input.businessType}: ${input.merchantName}`,
    secondPartyRows(input),
  );
}
