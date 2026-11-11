import { isQueryTimeout } from "@/lib/db/supabase/errors";

import { OperationsError, fromDatabaseError } from "./errors";
import { isOperationsDatabaseConfigured } from "./repository";

/**
 * Shared guards for the operations service layer.
 *
 * Both the write service and the read-only statement/breakdown service need the
 * same "database present?" check and the same translation of a driver failure
 * into a domain error, so they live here instead of being copied per file.
 */

export function requireOperationsDatabase(): void {
  if (!isOperationsDatabaseConfigured()) {
    throw new OperationsError(
      "STORE_UNAVAILABLE",
      "قاعدة البيانات غير متصلة.",
      503,
    );
  }
}

export function translateOperationError(error: unknown): never {
  if (error instanceof OperationsError) throw error;
  if (isQueryTimeout(error)) {
    // A slow database is a retryable deployment condition, not a bad request:
    // answer 503 so the client keeps the order in the form instead of reading
    // the failure as a validation error it should fix.
    throw new OperationsError(
      "STORE_TIMEOUT",
      "استغرق الخادم وقتاً أطول من المتوقع. لم يُؤكَّد تسجيل العملية؛ أعد المحاولة.",
      503,
    );
  }
  const domain = fromDatabaseError(error);
  if (domain) throw domain;
  throw error;
}
