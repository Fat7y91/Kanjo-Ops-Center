/**
 * Draft-terms view model for the contract editor UI.
 *
 * This is the shape the editor manipulates before a contract is rendered. It is
 * deliberately client-safe (no `server-only`, no I/O) so the UI can be built and
 * reviewed against mocked data ahead of the persistence layer. Clauses carry a
 * light markup convention (`**bold**`) that the editor toolbar produces and the
 * PDF clause parser already understands once converted to `<strong>`.
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

export type ContractDraft = {
  merchantName: string;
  baseCommission: number;
  clauses: DraftClause[];
  commissionLines: DraftCommissionLine[];
};

/** Generates a stable-enough client id for a freshly added row. */
export function draftId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Realistic seed for UI review: a base obligations clause with an emphasis run,
 * a commission clause, and a per-category exception, so every editor affordance
 * (bold, reorder, disable, add, commission rows) is exercised on open.
 */
export const MOCK_CONTRACT_DRAFT: ContractDraft = {
  merchantName: "سفير السعادة",
  baseCommission: 12,
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
    {
      id: "clause-custom-discount",
      title: "خصم استثنائي متفق عليه",
      body:
        "يمنح الطرف الثاني خصمًا استثنائيًا بنسبة **5%** على فئة المشروبات الغازية لمدة ثلاثة أشهر من تاريخ التوقيع، ويُعتمد هذا الخصم ضمن ملحق العمولات.",
      enabled: true,
    },
  ],
  commissionLines: [
    { id: "line-default", category: "التصنيف الافتراضي", rate: 12 },
    { id: "line-beverages", category: "مشروبات غازية", rate: 8 },
    { id: "line-fresh", category: "خضروات وفواكه", rate: 6 },
  ],
};
