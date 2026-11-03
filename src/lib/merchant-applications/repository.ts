import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import {
  isMissingSchemaObject,
  isQueryTimeout,
} from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";

import {
  isApplicationStatus,
  type MerchantApplication,
  type MerchantApplicationInput,
} from "./types";

/**
 * Tier 4 repository for `app.merchant_applications`.
 *
 * Created by `20261104000000_merchant_applications.sql`. This is the only
 * module that knows the column names: the public route writes through
 * `submitMerchantApplication` and the review queue reads through
 * `listMerchantApplications`, so a schema change has one place to land.
 *
 * Writes go through the service-role client on purpose. The `anon` insert
 * policy exists for a direct-from-the-browser form, but the landing page posts
 * to our API, and the server must be able to answer "stored" only when a row
 * really exists.
 */

const APPLICATION_COLUMNS =
  "id,store_name,contact_person,phone_number,business_type,status,created_at";

/** A public form submission must answer quickly; a hang is worse than a retry. */
const WRITE_TIMEOUT_MS = 5_000;

/** Review-queue read deadline; the route boundary offers a retry past this. */
const READ_TIMEOUT_MS = 4_000;

/** One page of the queue. Older rows stay reachable through the same table. */
const LIST_LIMIT = 200;

type ApplicationRow = {
  id: string;
  store_name: string;
  contact_person: string;
  phone_number: string;
  business_type: string;
  status: string;
  created_at: string;
};

function toApplication(row: ApplicationRow): MerchantApplication {
  return {
    id: row.id,
    storeName: row.store_name,
    contactPerson: row.contact_person,
    phoneNumber: row.phone_number,
    businessType: row.business_type,
    // A status the SQL check constraint does not allow can only mean the
    // deployment is ahead of this code; the queue still renders the row.
    status: isApplicationStatus(row.status) ? row.status : "pending",
    createdAt: row.created_at,
  };
}

export type ApplicationSubmission =
  | { status: "stored"; application: MerchantApplication }
  | { status: "unavailable" };

export function isMerchantApplicationsDatabaseConfigured(): boolean {
  return hasSupabaseConfig();
}

/**
 * Records one public application.
 *
 * `unavailable` means the database is not configured or the migration is not
 * deployed yet, and the caller must not answer 201: an application that was
 * never stored is a lost merchant.
 */
export async function submitMerchantApplication(
  input: MerchantApplicationInput,
): Promise<ApplicationSubmission> {
  if (!isMerchantApplicationsDatabaseConfigured()) return { status: "unavailable" };

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("merchant_applications")
    .insert({
      store_name: input.storeName,
      contact_person: input.contactPerson,
      phone_number: input.phoneNumber,
      business_type: input.businessType,
    })
    .select(APPLICATION_COLUMNS)
    .abortSignal(AbortSignal.timeout(WRITE_TIMEOUT_MS))
    .single();

  if (error) {
    if (isMissingSchemaObject(error)) return { status: "unavailable" };
    if (isQueryTimeout(error)) {
      throw new Error(
        "MERCHANT_APPLICATION_TIMEOUT: the intake write exceeded its deadline",
      );
    }
    throw error;
  }

  return { status: "stored", application: toApplication(data as ApplicationRow) };
}

/**
 * The review queue, newest first.
 *
 * Returns `null` when the database is not configured or the table is not
 * deployed yet, which is a deployment-ordering problem rather than an empty
 * queue. Every other failure throws so the page shows a retry instead of an
 * empty table that looks like "no merchants applied".
 */
export async function listMerchantApplications(
  limit: number = LIST_LIMIT,
): Promise<MerchantApplication[] | null> {
  if (!isMerchantApplicationsDatabaseConfigured()) return null;

  const client = getSupabaseServerClient();
  const { data, error } = await client
    .schema("app")
    .from("merchant_applications")
    .select(APPLICATION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, LIST_LIMIT)))
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));

  if (error) {
    if (isMissingSchemaObject(error)) return null;
    if (isQueryTimeout(error)) {
      throw new Error(
        "MERCHANT_APPLICATIONS_TIMEOUT: the review queue read exceeded its deadline",
      );
    }
    throw error;
  }

  return ((data ?? []) as ApplicationRow[]).map(toApplication);
}
