import type {
  ContractState,
  MerchantDocument,
  RepOpinion,
  VisitContact,
} from "./types";

/**
 * camelCase → column mapping for merchant updates.
 *
 * Split out of the repository so the class-to-column translation lives next to
 * the read-side mapping in `merchant-mapping.ts`, and the repository keeps only
 * I/O. Pure and safe to unit-test.
 */

/**
 * Columns the domain mutates after creation. Kept as a camelCase patch so the
 * call sites stay in domain terms; the mapping to snake_case lives here only.
 */
export type MerchantPatch = Partial<{
  name: string;
  normalizedName: string;
  vendorTypeId: number;
  vendorType: string;
  cityId: string;
  targetCommission: number;
  strategicNotes: string;
  phone: string | null;
  address: string | null;
  team: string | null;
  contractState: ContractState;
  commissionAmount: number;
  agreedCommission: number | null;
  editUnlocked: boolean;
  documents: MerchantDocument[];
  contact: VisitContact | null;
  opinions: RepOpinion[];
  contactUpdatedAt: string | null;
  lastVisitAt: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
}>;

export function toPatchColumns(
  patch: MerchantPatch,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.normalizedName !== undefined) {
    row.normalized_name = patch.normalizedName;
  }
  if (patch.vendorTypeId !== undefined) row.vendor_type_id = patch.vendorTypeId;
  if (patch.vendorType !== undefined) row.vendor_type = patch.vendorType;
  if (patch.cityId !== undefined) row.city_id = patch.cityId;
  if (patch.targetCommission !== undefined) {
    row.target_commission = patch.targetCommission;
  }
  if (patch.strategicNotes !== undefined) {
    row.strategic_notes = patch.strategicNotes;
  }
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.team !== undefined) row.team = patch.team;
  if (patch.contractState !== undefined) {
    row.contract_state = patch.contractState;
  }
  if (patch.commissionAmount !== undefined) {
    row.commission_amount = patch.commissionAmount;
  }
  if (patch.agreedCommission !== undefined) {
    row.agreed_commission = patch.agreedCommission;
  }
  if (patch.editUnlocked !== undefined) row.edit_unlocked = patch.editUnlocked;
  if (patch.documents !== undefined) row.documents = patch.documents;
  if (patch.contact !== undefined) row.contact = patch.contact;
  if (patch.opinions !== undefined) row.opinions = patch.opinions;
  if (patch.contactUpdatedAt !== undefined) {
    row.contact_updated_at = patch.contactUpdatedAt;
  }
  if (patch.lastVisitAt !== undefined) row.last_visit_at = patch.lastVisitAt;
  if (patch.logoUrl !== undefined) row.logo_url = patch.logoUrl;
  if (patch.coverUrl !== undefined) row.cover_url = patch.coverUrl;
  return row;
}
