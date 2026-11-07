import { getContractAssets } from "./assets";
import {
  DESOUK_MERCHANT_IDS,
  FINANCIAL_EXCEPTION_MERCHANT,
  KANJO_FIRST_PARTY,
  isRestaurantCafeCategoryExact,
} from "./constants";
import { buildClauses, clauseNumberLabel, type ClauseRenderInput } from "./clauses";
import { escapeHtml, ltrNumber, safeString, toArabicNumerals } from "./format";

export type ContractDocumentInput = ClauseRenderInput & {
  merchantId: string;
  merchantName: string;
  businessType: string;
  titleBusinessType?: string;
  displayRate: number;
  baseCommission: number | null;
  exceptions: { category: string; rate: number }[];
  vipPreContract?: boolean;
  contactName?: string;
  contactPhone?: string;
  address?: string;
  merchantLogo?: string;
};

const SOCIAL_ICONS = {
  facebook:
    '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" fill="#1877F2"/></svg>',
  instagram:
    '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="#E4405F" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#E4405F" stroke-width="2"/><circle cx="17" cy="7" r="1.3" fill="#E4405F"/></svg>',
  tiktok:
    '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3c.3 2.2 1.8 3.9 4 4.2v2.6c-1.5 0-2.9-.5-4-1.3v6.4a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v2.7a2.7 2.7 0 1 0 1.9 2.6V3h2.6z" fill="#111"/></svg>',
};

const socialIcon = (label: string, svg: string) =>
  `<div style="font-size: 12px; color: #4B0082; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">${svg}<span dir="ltr">${label}</span></div>`;

/* The body content (no <html> shell): header logo row, parties, clauses,
 * commission table, signatures. Extracted to keep the document shell separate. */
export function buildContractBody(input: ContractDocumentInput): string {
  const { logoDataUri } = getContractAssets();

  const merchantName = input.merchantName;
  const businessType = input.businessType;
  const isRestCafe = isRestaurantCafeCategoryExact(input.category);
  const titleBusinessType =
    isRestCafe && input.titleBusinessType
      ? input.titleBusinessType
      : businessType;

  const merchantNameKey = String(merchantName ?? "").replace(/\s+/g, " ").trim();
  const financialSpecialException = merchantNameKey.includes(
    FINANCIAL_EXCEPTION_MERCHANT,
  )
    ? " استثناء خاص: يتم تصفية الحسابات وإجراء التسويات المالية كل شهر أو شهرين بناءً على طلب الطرف الثاني."
    : "";

  const isDesoukMerchant = (DESOUK_MERCHANT_IDS as readonly string[]).includes(
    String(input.merchantId ?? "").trim(),
  );
  const jurisdictionClause = isDesoukMerchant
    ? "ثم تختص محكمة دسوق."
    : "ثم تختص المحكمة المختصة في نطاق مقر كانجو ما لم يتفق على خلاف ذلك.";

  const displayRate = input.baseCommission !== null ? input.baseCommission : input.displayRate;
  const exceptions = input.exceptions ?? [];
  const vipPreContract = input.vipPreContract === true;
  const address = input.address || "........................";
  const phone = input.contactPhone || "........................";
  const merchantLogo = input.merchantLogo || "";

  const clauses = buildClauses({
    category: input.category,
    achievedPercent: input.displayRate,
    financialSpecialException,
    jurisdictionClause,
  });

  const headerHtml = merchantLogo
    ? `
            <div class="contract-header" style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; direction: rtl; border-bottom: 3px solid #4B0082; padding-bottom: 10px; margin-bottom: 16px;">
                <div><img src="${logoDataUri}" alt="Kanjo Logo" style="max-height: 55px; max-width: 110px; object-fit: contain;"></div>
                <div><img src="${merchantLogo}" alt="Merchant Logo" style="max-height: 55px; max-width: 90px; object-fit: contain;"></div>
            </div>
        `
    : `
            <div class="contract-header" style="display: flex; flex-direction: row; justify-content: center; align-items: center; direction: rtl; border-bottom: 3px solid #4B0082; padding-bottom: 10px; margin-bottom: 16px;">
                <div><img src="${logoDataUri}" alt="Kanjo Logo" style="max-height: 55px; max-width: 110px; object-fit: contain;"></div>
            </div>
        `;

  const clauseHtml = clauses
    .map((clause, idx) => {
      const numberLabel = clauseNumberLabel(idx);
      return `<div class="contract-clause-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 20px;">
    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 10px 15px; border-right: 4px solid #F59E0B; margin-bottom: 12px;">البند ${numberLabel}: ${clause.title}</div>
    <div class="contract-text" style="font-size: 14px; line-height: 1.9; text-align: justify; color: #1e293b; font-weight: bold;">${clause.body}</div>
</div>`;
    })
    .join("\n\n");

  const printBorderAndWatermark = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 500px; max-width: 70vw; opacity: 0.06; z-index: 9999999; pointer-events: none; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
            <img src="${logoDataUri}" style="width: 100%; height: auto; display: block; filter: grayscale(100%);">
        </div>
    `;

  const hasMerchantLogo = !!merchantLogo;

  const tableHeader = `
        <thead>
            <tr><th style="padding: 5px 0;">
                ${
                  hasMerchantLogo
                    ? `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4B0082; padding-bottom: 10px; margin-top: 10px; margin-bottom: 15px;">
                    <div style="width: 100px; text-align: right;"><img src="${logoDataUri}" style="max-height: 65px; object-fit: contain;"></div>
                    <div style="font-size: 24px; font-weight: 900; color: #4B0082; text-align: center;">عقد انضمام ${titleBusinessType} ${merchantName}</div>
                    <div style="width: 100px; text-align: left;"><img src="${merchantLogo}" style="max-height: 65px; max-width: 90px; object-fit: contain;"></div>
                </div>`
                    : `
                <div style="border-bottom: 2px solid #4B0082; padding-bottom: 10px; margin-top: 10px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: center; align-items: center;"><img src="${logoDataUri}" style="max-height: 65px; object-fit: contain;"></div>
                    <div style="font-size: 24px; font-weight: 900; color: #4B0082; text-align: center; margin-top: 10px;">عقد انضمام ${titleBusinessType} ${merchantName}</div>
                </div>`
                }
            </th></tr>
        </thead>
    `;

  const tableFooter = `
        <tfoot>
            <tr><td style="padding: 0;">
                <div style="border-top: 2px solid #E2E8F0; margin-top: 15px; padding-top: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: #4B0082;">
                    <span>توقيع الطرف الأول (كانجو): ..............................</span>
                    <span>توقيع الطرف الثاني (${merchantName}): ..............................</span>
                </div>
            </td></tr>
        </tfoot>
    `;

  let commissionTableHtml = "";
  if (input.baseCommission !== null || exceptions.length > 0) {
    let rateRows = "";
    if (input.baseCommission !== null) {
      rateRows += `<tr><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">العمولة الأساسية (جميع المنتجات)</td><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">${toArabicNumerals(input.baseCommission)}%</td></tr>`;
    }
    rateRows += exceptions
      .map(
        (ex) =>
          `<tr><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">${safeString(ex.category)}</td><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">${toArabicNumerals(ex.rate)}%</td></tr>`,
      )
      .join("");

    commissionTableHtml = `
            <div style="page-break-inside: avoid; break-inside: avoid; margin: 15px 0;">
                <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 10px;">ملحق العمولات: نسبة مقابل خدمات المنصة والتشغيل</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; font-weight: bold; color: #1e293b;">
                    <thead>
                        <tr style="background-color: #4B0082; color: #FFFFFF;">
                            <th style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">الفئة / النشاط</th>
                            <th style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">نسبة مقابل خدمات المنصة</th>
                        </tr>
                    </thead>
                    <tbody>${rateRows}</tbody>
                </table>
            </div>`;
  }

  const nationalIdBoxes =
    '<span style="display: inline-block; white-space: nowrap; direction: ltr; unicode-bidi: isolate;" dir="ltr">' +
    Array.from({ length: 14 })
      .map(
        () =>
          '<span style="display: inline-block; width: 20px; height: 28px; border: 1.5px solid #4B0082; border-radius: 4px; margin: 0 1px; vertical-align: middle; background: #fff;"></span>',
      )
      .join("") +
    "</span>";

  const fillBlank = "....................................";

  const firstPartyBlockHtml = `
                <div class="contract-parties" style="background-color: #F8F9FA; border: 1px solid #E2E8F0; border-right: 4px solid #4B0082; padding: 12px; border-radius: 8px; margin-bottom: 18px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                    <strong>الطرف الأول:</strong> ${KANJO_FIRST_PARTY.tradeName}
                    <div style="margin-top: 8px;">السجل التجاري رقم (${ltrNumber(KANJO_FIRST_PARTY.commercialRegister)}) — ${KANJO_FIRST_PARTY.commercialRegisterOffice}</div>
                    <div>البطاقة الضريبية رقم (${ltrNumber(KANJO_FIRST_PARTY.taxCard)}) — ${KANJO_FIRST_PARTY.taxOffice}</div>
                    <div>المقر: ${KANJO_FIRST_PARTY.address}</div>
                    <div>ويمثلها م/ محمود الجمل بصفته مدير التشغيل والتعاقدات.</div>
                </div>`;

  const secondPartyBlockHtml = `
                <div class="contract-parties" style="background-color: #F8F9FA; border: 1px solid #E2E8F0; border-right: 4px solid #F59E0B; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                    <strong>الطرف الثاني:</strong> ${titleBusinessType}: ${merchantName}
                    <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px;">
                        <tr><td style="padding: 5px 0; width: 42%; vertical-align: top;">اسم المنشأة / المحل:</td><td style="padding: 5px 0;">${merchantName}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">اسم المفوض / صاحب النشاط:</td><td style="padding: 5px 0;">${safeString(input.contactName) || fillBlank}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">بطاقة الرقم القومي (١٤ رقمًا):</td><td style="padding: 5px 0;">${nationalIdBoxes}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">رقم السجل التجاري:</td><td style="padding: 5px 0;">${fillBlank}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">رقم التسجيل الضريبي:</td><td style="padding: 5px 0;">${fillBlank}</td></tr>
                        <tr><td colspan="2" style="padding: 5px 0; vertical-align: top;">
                            <div style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 18px;">
                                <span>رقم الهاتف / واتساب: <span dir="ltr">${safeString(phone)}</span></span>
                                <span>رقم إضافي (إن وجد): ........................................</span>
                            </div>
                        </td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">البريد الإلكتروني:</td><td style="padding: 5px 0;">..................................................</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">العنوان:</td><td style="padding: 5px 0;">${safeString(address)}</td></tr>
                    </table>
                </div>`;

  const preambleDateLine =
    "إنه في يوم: ............................ الموافق: ...... / ...... / ............ م، تم الاتفاق والتراضي بين كل من:";

  const tableBody = `
        <tbody>
            <tr><td style="padding: 0;">
                <div class="contract-text" style="font-size: 14px; margin-bottom: 20px; line-height: 1.8; font-weight: bold;">${preambleDateLine}</div>
                ${firstPartyBlockHtml}
                ${secondPartyBlockHtml}
                <div class="contract-clause-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 20px;">
                    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 8px;">التمهيد</div>
                    <div class="contract-text" style="font-size: 14px; line-height: 1.8; text-align: justify; font-weight: bold;">حيث إن كانجو منصة إلكترونية تجارية وتشغيلية لعرض وطلب وتوصيل المنتجات، وحيث إن الطرف الثاني يرغب في الانضمام إليها؛ فقد اتفق الطرفان على تنظيم العلاقة بما يحفظ حقوق كانجو، ويضمن جودة المنتجات. ويعد هذا التمهيد وملاحق العقد جزءًا لا يتجزأ منه.</div>
                </div>
                ${clauseHtml}
                ${commissionTableHtml}
                <div style="page-break-inside: avoid; break-inside: avoid; margin: 15px 0; text-align: center; font-size: 13px; line-height: 1.9; font-weight: bold; color: #4B0082; background-color: #F8F9FA; border: 1px solid #E2E8F0; border-right: 4px solid #F59E0B; border-radius: 6px; padding: 12px 15px;">تحرر هذا العقد من نسختين أصليتين متطابقتين، بِيَد كل طرف نسخة للعمل بموجبها، ويتكون العقد من البنود والملاحق المذكورة أعلاه.</div>
                <div style="page-break-inside: avoid; break-inside: avoid; margin-top: 20px;">
                    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 10px;">ملحق مختصر: البيانات والتوقيعات النهائية</div>
                    <div class="contract-text" style="font-size: 14px; margin-bottom: 15px; font-weight: bold; color: #1e293b;">الفئة التجارية: ${safeString(input.category)} | نسبة مقابل خدمات المنصة: <strong>[ ${toArabicNumerals(displayRate)}% ]</strong></div>
                    ${vipPreContract ? `<div class="contract-text" style="font-size: 13px; margin-bottom: 15px; font-weight: bold; color: #92400e; background-color: #fffbeb; border: 1px solid #fcd34d; border-right: 4px solid #F59E0B; border-radius: 6px; padding: 10px 12px;">حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي ولا يترتب عليه أي التزام تعاقدي أو عمولة.</div>` : ""}
                    ${exceptions.length ? `<div class="contract-text" style="font-size: 14px; margin-bottom: 15px; font-weight: bold; color: #1e293b;">استثناءات النسب: ${exceptions.map((ex) => `${safeString(ex.category)}: [ ${toArabicNumerals(ex.rate)}% ]`).join(" — ")}</div>` : ""}
                    <div class="contract-signatures" style="display: flex; align-items: stretch; gap: 12px; width: 100%; margin-bottom: 15px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                        <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; background: #fff;">
                            <div style="color: #4B0082; margin-bottom: 10px; font-weight: bold;">الطرف الأول: ${KANJO_FIRST_PARTY.tradeName}</div>
                            <div>الاسم: م/ محمود الجمل</div>
                            <div>الصفة: مدير التشغيل والتعاقدات</div>
                            <div style="margin-top: auto; padding-top: 18px;">
                                <div style="font-weight: bold;">توقيع المفوض: ..............................</div>
                                <div style="margin-top: 14px; font-weight: bold;">الختم:</div>
                                <div style="min-height: 80px; background: #fff;"></div>
                            </div>
                        </div>
                        <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; background: #fff;">
                            <div style="color: #4B0082; margin-bottom: 10px; font-weight: bold;">الطرف الثاني: ${merchantName}</div>
                            <div>الاسم: ${safeString(input.contactName) || "...................."}</div>
                            <div>الصفة: صاحب النشاط</div>
                            <div style="margin-top: auto; padding-top: 18px;">
                                <div style="font-weight: bold;">توقيع صاحب النشاط: ..............................</div>
                                <div style="margin-top: 14px; font-weight: bold;">الختم:</div>
                                <div style="min-height: 80px; background: #fff;"></div>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #E2E8F0; display: flex; justify-content: center; gap: 20px; align-items: center; flex-wrap: wrap; direction: ltr;">
                        ${socialIcon("kanjo.app.eg", SOCIAL_ICONS.facebook)}
                        ${socialIcon("kanjo.app.eg", SOCIAL_ICONS.instagram)}
                        ${socialIcon("@kanjo.app.eg", SOCIAL_ICONS.tiktok)}
                    </div>
                    <div style="text-align: center; margin-top: 10px; font-size: 11px; color: #64748b; font-weight: bold; direction: rtl;">شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية - جميع الحقوق محفوظة © ٢٠٢٦</div>
                </div>
            </td></tr>
        </tbody>
    `;

  return (
    printBorderAndWatermark +
    '<table style="width: 100%; border-collapse: collapse;">' +
    headerHtml +
    tableHeader +
    tableBody +
    tableFooter +
    "</table>"
  );
}

export function contractDocumentTitle(input: ContractDocumentInput): string {
  const isRestCafe = isRestaurantCafeCategoryExact(input.category);
  const titleBusinessType =
    isRestCafe && input.titleBusinessType
      ? input.titleBusinessType
      : input.businessType;
  return `عقد انضمام ${titleBusinessType} ${input.merchantName}`;
}

export { escapeHtml };
