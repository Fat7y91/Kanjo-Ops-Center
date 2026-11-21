import {
  isCheckViolation,
  isForeignKeyViolation,
  isGuardViolation,
  isMissingSchemaObject,
  isUniqueViolation,
} from "@/lib/db/supabase/errors";

import { ContractRepositoryError } from "./errors";

/**
 * Maps a PostgREST/Postgres write error onto the contract domain vocabulary.
 *
 * The register's writes can fail for reasons that are legitimate client
 * outcomes, not server defects: another operator closed the row first and the
 * `contracts_terminal_guard` raised `55000`, a check constraint rejected an
 * inconsistent patch, or the acting user id no longer exists (`signed_by` FK).
 * Left unmapped these surfaced as opaque 500s. Each branch answers with the HTTP
 * status the UI already knows how to render.
 */
export function contractWriteError(error: unknown): never {
  if (isMissingSchemaObject(error)) {
    throw new ContractRepositoryError(
      "STORE_UNAVAILABLE",
      "سجل العقود غير مُفعّل على هذا النشر بعد.",
      503,
    );
  }
  if (isGuardViolation(error)) {
    throw new ContractRepositoryError(
      "CONTRACT_TRANSITION",
      "لا يمكن تنفيذ هذا الإجراء على حالة العقد الحالية.",
      409,
    );
  }
  if (isCheckViolation(error)) {
    throw new ContractRepositoryError(
      "CONTRACT_INVALID_STATE",
      "تعارضت بيانات العقد مع قواعد السجل. أعد تحميل السجل ثم حاول مجدداً.",
      422,
    );
  }
  if (isForeignKeyViolation(error)) {
    throw new ContractRepositoryError(
      "CONTRACT_ACTOR_UNKNOWN",
      "تعذر تسجيل منفّذ الإجراء على العقد. أعد تسجيل الدخول ثم حاول مجدداً.",
      409,
    );
  }
  if (isUniqueViolation(error)) {
    throw new ContractRepositoryError(
      "DUPLICATE_REFERENCE",
      "تعذر حفظ العقد بسبب تكرار في البيانات. أعد المحاولة.",
      409,
    );
  }
  throw new ContractRepositoryError(
    "CONTRACT_WRITE_FAILED",
    "تعذر تحديث حالة العقد. حاول لاحقاً.",
    500,
  );
}
