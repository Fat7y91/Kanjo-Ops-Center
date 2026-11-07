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
