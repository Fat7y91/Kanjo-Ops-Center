/**
 * Contract terms view model and the stored-terms contract.
 *
 * This module is client-safe (no `server-only`, no I/O) so both the editor UI and
 * the persistence layer can share one shape. It covers *everything* the editor
 * manipulates: ordered clauses, commission lines, and narrative section
 * overrides (preamble, copies note, the two party panels, summary, base rate).
 *
 * Clause bodies carry a light `**bold**` convention the editor toolbar produces;
 * it is converted to `<strong>` when the draft is persisted for the PDF parser.
 */

export type DraftClause = {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
};

export type DraftCommissionLine = {
  id: string;
  category: string;
  rate: number;
};

export type DraftPartyRow = {
  id: string;
  label: string;
  value: string;
};

export type ContractDraft = {
  merchantName: string;
  baseCommission: number;
  preamble: string;
  copiesNote: string;
  firstPartyRows: DraftPartyRow[];
  secondPartyRows: DraftPartyRow[];
  summaryNote: string;
  clauses: DraftClause[];
  commissionLines: DraftCommissionLine[];
};

/** Stored section override payloads keyed by section. */
export type StoredSectionContent =
  | { text: string }
  | { rows: { label: string; value: string }[] }
  | { rate: number };

/** Everything persisted for one contract's editable terms. */
export type ContractTerms = {
  baseCommission: number | null;
  preamble: string | null;
  copiesNote: string | null;
  firstPartyRows: DraftPartyRow[] | null;
  secondPartyRows: DraftPartyRow[] | null;
  summaryNote: string | null;
  clauses: { title: string; body: string; enabled: boolean }[];
  commissionLines: { category: string; rate: number }[];
};

export const EMPTY_CONTRACT_TERMS: ContractTerms = {
  baseCommission: null,
  preamble: null,
  copiesNote: null,
  firstPartyRows: null,
  secondPartyRows: null,
  summaryNote: null,
  clauses: [],
  commissionLines: [],
};

/** Generates a stable-enough client id for a freshly added row. */
export function draftId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Seeds the editor for a contract that has no stored terms yet. */
export function seedDraft(merchantName: string, baseCommission = 0): ContractDraft {
  return {
    merchantName,
    baseCommission,
    preamble: "",
    copiesNote: "",
    firstPartyRows: [],
    secondPartyRows: [],
    summaryNote: "",
    clauses: [],
    commissionLines: [],
  };
}

/**
 * Realistic seed for UI review: a base obligations clause with an emphasis run,
 * a commission clause, and a per-category exception, so every editor affordance
 * (bold, reorder, disable, add, commission rows) is exercised on open.
 */
export const MOCK_CONTRACT_DRAFT: ContractDraft = {
  merchantName: "سفير السعادة",
  baseCommission: 12,
  preamble:
    "حيث إن كانچو منصة إلكترونية تجارية وتشغيلية لعرض وطلب وتوصيل المنتجات، وحيث إن الطرف الثاني يرغب في الانضمام إليها؛ فقد اتفق الطرفان على تنظيم العلاقة بما يحفظ حقوق كانچو، ويضمن جودة المنتجات.",
  copiesNote:
    "تحرر هذا العقد من نسختين أصليتين متطابقتين، بِيَد كل طرف نسخة للعمل بموجبها.",
  firstPartyRows: [
    { id: "fp-reg", label: "السجل التجاري", value: "٣٠٨٢٣٤ — استثمار القاهرة" },
    { id: "fp-tax", label: "البطاقة الضريبية", value: "٥١٢-٣٤٥-٦٧٨" },
  ],
  secondPartyRows: [
    { id: "sp-owner", label: "اسم المفوض", value: "" },
    { id: "sp-phone", label: "رقم الهاتف / واتساب", value: "" },
  ],
  summaryNote: "",
  clauses: [
    {
      id: "clause-subject",
      title: "موضوع العقد وطبيعة العلاقة",
      body:
        "تقبل كانچو انضمام الطرف الثاني إلى منظومتها لعرض أو بيع أو توريد منتجاته من خلال المنصة. وتظل **كانچو** مالكة للمنصة وأنظمتها وبياناتها، بينما يظل الطرف الثاني مسؤولًا عن منتجاته وجودتها وتراخيصها.",
      enabled: true,
    },
    {
      id: "clause-commission",
      title: "رسوم تقديم الخدمات والتشغيل",
      body:
        "تحصل كانچو مقابل خدمات المنصة على نسبة **12%** من كل طلب أو عملية بيع تتم من خلال المنصة، وتُعرض بوضوح في كشف الحساب الدوري قبل التسوية.",
      enabled: true,
    },
    {
      id: "clause-delivery",
      title: "المخزون والتجهيز والتغليف",
      body:
        "يلتزم الطرف الثاني بتحديث المخزون فورًا، وتجهيز الطلب بذات الأصناف والكميات الظاهرة في التطبيق، وتغليف الطلب بصورة آمنة مناسبة لطبيعته.",
      enabled: true,
    },
  ],
  commissionLines: [
    { id: "line-default", category: "التصنيف الافتراضي", rate: 12 },
    { id: "line-beverages", category: "مشروبات غازية", rate: 8 },
  ],
};

/** Converts stored terms into an editable draft, falling back to the seed. */
export function draftFromTerms(
  merchantName: string,
  terms: ContractTerms,
): ContractDraft {
  return {
    merchantName,
    baseCommission: terms.baseCommission ?? 0,
    preamble: terms.preamble ?? "",
    copiesNote: terms.copiesNote ?? "",
    firstPartyRows: terms.firstPartyRows ?? [],
    secondPartyRows: terms.secondPartyRows ?? [],
    summaryNote: terms.summaryNote ?? "",
    clauses: terms.clauses.map((clause, index) => ({
      id: `clause-${index}`,
      title: clause.title,
      body: fromClauseHtml(clause.body),
      enabled: clause.enabled,
    })),
    commissionLines: terms.commissionLines.map((line, index) => ({
      id: `line-${index}`,
      category: line.category,
      rate: line.rate,
    })),
  };
}

/** Converts an edited draft into the persisted terms shape. */
export function termsFromDraft(draft: ContractDraft): ContractTerms {
  return {
    baseCommission: draft.baseCommission,
    preamble: draft.preamble.trim(),
    copiesNote: draft.copiesNote.trim(),
    firstPartyRows: draft.firstPartyRows,
    secondPartyRows: draft.secondPartyRows,
    summaryNote: draft.summaryNote.trim(),
    clauses: draft.clauses.map((clause) => ({
      title: clause.title,
      body: toClauseHtml(clause.body),
      enabled: clause.enabled,
    })),
    commissionLines: draft.commissionLines,
  };
}

/**
 * Marker an operator sees for a dashed fill-rule line (a blank handwriting
 * line). It is a line of underscores, which converts back to a fill-rule div on
 * save so the printed blanks are preserved through an edit.
 */
const FILL_RULE_MARKER = "________________________________________";

/** Converts the editor's `**bold**` runs into the HTML the PDF parser reads. */
export function toClauseHtml(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      // A line of underscores (10+) is a blank handwriting rule.
      if (/^_{10,}$/.test(trimmed)) {
        return '<div style="height: 30px; border-bottom: 1px dashed #000; margin-bottom: 8px; width: 100%;"></div>';
      }
      return line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    })
    .join("<br>");
}

/**
 * Converts a stored clause body (light HTML) back into the editor's markup so
 * canonical clauses are readable when the editor is opened. Bold runs become
 * `**…**`, dashed fill-rule lines become underscore markers, line breaks become
 * newlines, and unsupported tags are stripped to their visible text.
 */
export function fromClauseHtml(body: string): string {
  return body
    .replace(/<div[^>]*border-bottom[^>]*>\s*<\/div>/gi, `\n${FILL_RULE_MARKER}\n`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
