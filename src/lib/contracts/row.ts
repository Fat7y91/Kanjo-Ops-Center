import type { Contract, ContractStatus } from "./types";

/**
 * Column list and row→domain mapping for `app.contracts`.
 *
 * Isolated from the repository so the only place that knows database column
 * names stays small and independently testable. The repository still owns
 * query construction.
 *
 * `CONTRACT_COLUMNS` includes the V2 additions (serial/storage/sha256). A
 * deployment that has not yet applied `20261117000000_contracts_v2.sql` would
 * reject that select, so `CONTRACT_BASE_COLUMNS` is the pre-V2 projection the
 * repository falls back to. Reads must never fail just because the migration is
 * pending: the register would otherwise render empty next to real rows.
 */

export const CONTRACT_BASE_COLUMNS = [
  "id",
  "reference",
  "merchant_id",
  "merchant_name",
  "city_id",
  "value_minor",
  "currency",
  "status",
  "signatory",
  "body",
  "signed_at",
  "cancelled_at",
  "created_at",
  "updated_at",
].join(",");

export const CONTRACT_COLUMNS = [
  "id",
  "reference",
  "serial_number",
  "merchant_id",
  "merchant_name",
  "city_id",
  "value_minor",
  "currency",
  "status",
  "signatory",
  "body",
  "storage_path",
  "sha256",
  "signed_at",
  "cancelled_at",
  "created_at",
  "updated_at",
].join(",");

export type ContractRow = {
  id: string;
  reference: string;
  serial_number?: number | string | null;
  merchant_id: string;
  merchant_name: string;
  city_id: string | null;
  value_minor: number | string;
  currency: Contract["currency"];
  status: ContractStatus;
  signatory: string;
  body: string;
  storage_path?: string | null;
  sha256?: string | null;
  signed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export function toContract(row: ContractRow): Contract {
  return {
    id: row.id,
    reference: row.reference,
    serialNumber:
      row.serial_number == null ? null : Number(row.serial_number),
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    cityId: row.city_id,
    value: Number(row.value_minor) / 100,
    currency: row.currency,
    status: row.status,
    signatory: row.signatory,
    body: row.body,
    storagePath: row.storage_path ?? null,
    sha256: row.sha256 ?? null,
    signedAt: row.signed_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
