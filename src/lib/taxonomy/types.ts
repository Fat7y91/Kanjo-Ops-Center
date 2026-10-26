export type TaxonomyKind = "vendor_type" | "category" | "variant";

export type TaxonomyStatus = "pending" | "approved" | "rejected";

export type TaxonomyVendorType = {
  id: number;
  name_ar: string;
  name_en: string;
  active: boolean;
  source: "dashboard" | "request";
  createdAt: string;
  updatedAt: string;
};

export type TaxonomyCategory = {
  key: string;
  id: number;
  vendorTypeId: number;
  parentId: number | null;
  name_ar: string;
  name_en: string;
  sortOrder: number;
  active: boolean;
  source: "dashboard" | "request";
  createdAt: string;
  updatedAt: string;
};

export type TaxonomyVariantOption = {
  option_id: number;
  option_name_ar: string;
  option_name_en: string;
  aliases: string[];
};

export type TaxonomyVariant = {
  variant_id: number;
  name_ar: string;
  name_en: string;
  options: TaxonomyVariantOption[];
  active: boolean;
  source: "dashboard" | "request";
  createdAt: string;
  updatedAt: string;
};

export type TaxonomyRequest = {
  id: string;
  kind: TaxonomyKind;
  name_ar: string;
  name_en: string;
  justification: string;
  vendorTypeId: number | null;
  parentId: number | null;
  status: TaxonomyStatus;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  dashboardId: number | null;
  rejectionReason: string;
  createdEntityKey: string | null;
};

export type TaxonomyVendorTypeSeed = {
  id: number;
  name_ar: string;
  name_en: string;
};

export type TaxonomyCategorySeed = {
  id: number;
  vendor_type_id: number;
  parent_id: number | null;
  name_ar: string;
  name_en: string;
  sort_order: number;
  active: boolean;
};

export type TaxonomyVariantSeed = {
  variant_id: number;
  name_ar: string;
  name_en: string;
  options: TaxonomyVariantOption[];
};

export const TAXONOMY_KIND_META: Record<
  TaxonomyKind,
  { label: string; description: string }
> = {
  vendor_type: {
    label: "نوع التاجر",
    description: "الفئة الجذرية للنشاط التجاري المرتبطة بمعرّف لوحة المستهلك.",
  },
  category: {
    label: "التصنيف",
    description: "تصنيف فرعي داخل نطاق نوع تاجر محدد.",
  },
  variant: {
    label: "المتغير",
    description: "مجموعة خصائص المتغيرات وخياراتها المعتمدة في لوحة المستهلك.",
  },
};

export const TAXONOMY_STATUS_META: Record<
  TaxonomyStatus,
  { label: string; tone: string }
> = {
  pending: { label: "قيد المراجعة", tone: "badge-gold" },
  approved: { label: "معتمد", tone: "badge-green" },
  rejected: { label: "مرفوض", tone: "badge-red" },
};

export function categoryKey(vendorTypeId: number, id: number): string {
  return `${vendorTypeId}-${id}`;
}
