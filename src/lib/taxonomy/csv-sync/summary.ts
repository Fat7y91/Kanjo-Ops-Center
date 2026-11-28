import type { CategoryPlanResult, VariantPlanResult } from "./plan";
import type { CsvSyncIssue } from "./parse";
import type { CategoryWriteResult, VariantWriteResult } from "./repository";
import type { VendorTypePlan } from "./vendor-types";

/** Detailed, name-first sync receipt rendered by the taxonomy modal. */

export type TaxonomySyncSummary = {
  vendorTypesParsed: number;
  createdVendorTypes: { id: number; nameAr: string; nameEn: string }[];
  vendorTypesUpdated: number;
  vendorTypeDuplicates: number;

  categoriesParsed: number;
  createdCategories: { nameAr: string; nameEn: string; vendorType: string }[];
  created: number;
  updated: number;
  duplicates: number;
  unresolvedParents: number;
  unresolvedVendors: number;

  variantGroupsParsed: number;
  variantOptionsParsed: number;
  createdVariantGroups: { id: number; nameAr: string; nameEn: string }[];
  createdVariantOptions: { id: number; nameAr: string; groupName: string }[];
  variantGroupsCreated: number;
  variantGroupsUpdated: number;
  variantOptionsCreated: number;
  variantOptionsUpdated: number;
  variantDuplicates: number;
  unresolvedVariantGroups: number;

  unknownVendors: number[];
  issues: CsvSyncIssue[];
};

export function buildTaxonomySyncSummary(input: {
  vendorPlan: VendorTypePlan;
  categoryPlan: CategoryPlanResult;
  categoryWrite: CategoryWriteResult;
  variantPlan: VariantPlanResult;
  variantWrite: VariantWriteResult;
  issues: CsvSyncIssue[];
}): TaxonomySyncSummary {
  const {
    vendorPlan,
    categoryPlan,
    categoryWrite,
    variantPlan,
    variantWrite,
  } = input;

  return {
    vendorTypesParsed: vendorPlan.rows.length,
    createdVendorTypes: vendorPlan.created.map((row) => ({
      id: row.id,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
    })),
    vendorTypesUpdated: vendorPlan.updated.length,
    vendorTypeDuplicates: vendorPlan.duplicates,

    categoriesParsed: categoryPlan.rows.length,
    createdCategories: categoryWrite.createdRows,
    created: categoryWrite.created,
    updated: categoryWrite.updated,
    duplicates: categoryPlan.duplicates,
    unresolvedParents: categoryPlan.unresolvedParents,
    unresolvedVendors: categoryPlan.unresolvedVendors,

    variantGroupsParsed: variantPlan.attributes.length,
    variantOptionsParsed: variantPlan.options.length,
    createdVariantGroups: variantWrite.createdGroups,
    createdVariantOptions: variantWrite.createdOptions,
    variantGroupsCreated: variantWrite.groupsCreated,
    variantGroupsUpdated: variantWrite.groupsUpdated,
    variantOptionsCreated: variantWrite.optionsCreated,
    variantOptionsUpdated: variantWrite.optionsUpdated,
    variantDuplicates: variantPlan.duplicates,
    unresolvedVariantGroups: variantPlan.unresolvedGroups,

    unknownVendors: [],
    issues: input.issues,
  };
}
