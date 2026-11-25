import "server-only";

import { insertAuditLog } from "@/lib/audit/repository";
import {
  getMerchantRow,
  updateMerchantRow,
} from "@/lib/field-ops/merchant-repository";
import type { ContractState } from "@/lib/field-ops/types";

import { listContractRows, setContractStatusRow } from "./repository";
import { setContractBaseCommission } from "./terms-repository";
import type { Contract } from "./types";

/**
 * Two-way reconciliation between the contract register and the merchant profile.
 *
 * The merchant profile (`app.merchants`) is the single source of truth for the
 * current agreement; the contract is its paperwork. Either side may move first
 * (a manager edits the target rate, or an executive amends the executed
 * contract), so each write reconciles the other and records why in the audit
 * log. Reconciliation is best-effort: the originating action is the fact the
 * operator asked for and must not be rolled back because the mirror write or the
 * audit insert failed.
 */

type Actor = { id: string; name: string };
type Identity = { id: string; reference: string };

export async function logContractAudit(args: {
  actor: Actor;
  actionType: string;
  contract: Identity;
  description: string;
  previousData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  changes?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await insertAuditLog({
      actorId: args.actor.id,
      actorName: args.actor.name,
      actorRole: "contracts",
      actionType: args.actionType,
      targetEntity: "contract",
      targetId: args.contract.id,
      targetName: args.contract.reference,
      entityKind: "contract",
      description: args.description,
      collection: "contracts",
      source: "web",
      previousData: args.previousData ?? null,
      newData: args.newData ?? null,
      changes: args.changes ?? null,
    });
  } catch (error) {
    console.error("Contract governance audit failed", {
      contractId: args.contract.id,
      error,
    });
  }
}

async function signedContracts(merchantId: string): Promise<Contract[]> {
  return (await listContractRows(merchantId)).filter(
    (contract) => contract.status === "signed",
  );
}

/**
 * Merchant target rate changed → rewrite each active signed contract's headline
 * rate so Clause 5 and the annex agree with the profile.
 */
export async function reconcileContractsFromMerchantRate(args: {
  merchantId: string;
  rate: number;
  actor: Actor;
}): Promise<void> {
  for (const contract of await signedContracts(args.merchantId)) {
    await setContractBaseCommission(contract.id, args.rate);
    await logContractAudit({
      actor: args.actor,
      actionType: "contract.rate.synced_from_merchant",
      contract,
      description: `تم تحديث نسبة العمولة إلى ${args.rate}% من ملف التاجر.`,
      changes: { commissionRate: args.rate },
    });
  }
}

/**
 * Merchant downgraded out of an agreement → terminate the now-stale signed
 * contract rather than leaving executed paperwork describing a dead deal.
 */
export async function reconcileContractsFromMerchantState(args: {
  merchantId: string;
  nextState: ContractState;
  actor: Actor;
}): Promise<void> {
  if (args.nextState !== "no_agreement" && args.nextState !== "provisional") {
    return;
  }
  for (const contract of await signedContracts(args.merchantId)) {
    const updated = await setContractStatusRow(
      contract.id,
      "cancelled",
      args.actor.id,
      undefined,
      "signed",
    );
    if (!updated) continue;
    await logContractAudit({
      actor: args.actor,
      actionType: "contract.terminated.stale_merchant_state",
      contract,
      description:
        "أُلغي العقد تلقائياً لتراجع حالة التاجر إلى بدون اتفاق أو اتفاق مبدئي.",
      previousData: { status: contract.status },
      newData: { status: "cancelled", merchantState: args.nextState },
    });
  }
}

/** Contract amount amended → persist the negotiated rate back to the profile. */
export async function reconcileMerchantFromContractRate(args: {
  contract: Contract;
  rate: number;
  actor: Actor;
}): Promise<void> {
  const merchant = await getMerchantRow(args.contract.merchantId);
  if (merchant && merchant.agreedCommission !== args.rate) {
    await updateMerchantRow(merchant.id, { agreedCommission: args.rate });
  }
  await logContractAudit({
    actor: args.actor,
    actionType: "contract.rate.amended",
    contract: args.contract,
    description: `تعديل نسبة العمولة إلى ${args.rate}% ومزامنتها مع ملف التاجر.`,
    previousData: merchant ? { agreedCommission: merchant.agreedCommission } : null,
    newData: { agreedCommission: args.rate, commissionRate: args.rate },
    changes: { agreedCommission: args.rate },
  });
}

/** Contract terminal transition → move the merchant profile to match. */
export async function reconcileMerchantFromContractState(args: {
  contract: Contract;
  nextState: ContractState;
  actor: Actor;
  actionType: string;
  description: string;
}): Promise<void> {
  const merchant = await getMerchantRow(args.contract.merchantId);
  if (merchant && (merchant.contractState !== args.nextState || !merchant.editUnlocked)) {
    await updateMerchantRow(merchant.id, {
      contractState: args.nextState,
      editUnlocked: true,
    });
  }
  await logContractAudit({
    actor: args.actor,
    actionType: args.actionType,
    contract: args.contract,
    description: args.description,
    previousData: merchant ? { contractState: merchant.contractState } : null,
    newData: { contractState: args.nextState },
  });
}
