#!/usr/bin/env node
/**
 * V1 (Firebase / Firestore, branch `main`)  →  V2 (Supabase Postgres,
 * branch `feat/v2-enterprise-architecture`) data migration.
 *
 * Reads the Firestore collections the V1 app wrote and writes the normalised
 * shape into the `app` schema described by `docs/V2_DATABASE_SCHEMA.md`
 * (commit f8ffec0).
 *
 * Rules enforced here (see V1_TO_V2_MIGRATION_GAP_ANALYSIS.md):
 *   • Money → bigint minor units `Math.round(units * 100)`, EXCEPT the
 *     merchant / contract columns that stay `numeric` currency units
 *     (`target_commission`, `agreed_commission`, `commission_amount`, margins).
 *   • Merchant ids and city ids stay text (`KJ-XXXXXX`, `city-desouk`).
 *   • `visit_reports.rep_id` / `merchant_id` stay text with no FK; only
 *     `logged_by` / `created_by` are UUID FKs and fall back to null.
 *   • Contract state is the closed ladder
 *     no_agreement → provisional → final_contract → signed_contract.
 *   • Append-only / trigger-guarded tables (`visit_reports`, `contracts`,
 *     `kpi_snapshots`, `merchant_applications`) are INSERT-missing-only: they
 *     are never UPDATEd, so the DB immutability guards cannot fire on re-run.
 *   • Every other write is an idempotent upsert keyed on the table's natural
 *     key, so a re-run repairs a partial load instead of duplicating rows.
 *   • `app.users.id` FKs to `auth.users(id)` and `app.users.phone` is
 *     NOT NULL / unique / E.164. Operators are resolved from
 *     MIGRATION_OPERATOR_PHONES (JSON name→phone), the V1 user doc's own phone
 *     or their `financial_profiles` wallet phone. Operators with no resolvable
 *     phone are skipped and reported — this is the documented hard blocker.
 *
 * Directives wired here:
 *   • Phone identity provisioning (above).
 *   • `kpi_snapshots.legacy_metrics` carries the V1 products/vendors/photos
 *     metrics and `rep_kpis` time tracking verbatim.
 *   • Audit log, notifications, archived reports and campaign leads import into
 *     their new tables, keyed on `legacy_id` so a re-run is idempotent.
 *   • The single live city is FETCHED from the database (env only bootstraps an
 *     empty one); a multi-city database is a hard error.
 *   • V1 free text maps ONTO the seeded V2 taxonomy. It never recreates vendor
 *     types/categories, and unmapped labels stay null and are reported.
 *   • V1 `post` payouts import as `egypt_post` with the 14-digit national id.
 *   • Image QA / lock / delete-request provenance imports into
 *     `catalog_products.qa_metadata`.
 *   • Spinwheel `campaign_leads` import into `app.marketing_leads`.
 *
 * The ETL is committed READY but must be run in the planned downtime window.
 * Running it against a partially-deployed schema fails loudly at the first
 * missing table instead of writing half a history.
 *
 * Usage (on the V2 branch, Node >= 20):
 *   npm i -D tsx
 *   npx tsx scripts/migrate-v1-to-v2.ts --dry-run
 *   npx tsx scripts/migrate-v1-to-v2.ts
 *   npx tsx scripts/migrate-v1-to-v2.ts --only=cities,teams,users,user_permissions
 *
 * Environment:
 *   FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS  (required)
 *   FIREBASE_PROJECT_ID                        (default kanjo-desouk)
 *   SUPABASE_URL                               (required)
 *   SUPABASE_SERVICE_ROLE_KEY                  (required)
 *   MIGRATION_DEFAULT_CITY_ID                  (default city-desouk)
 *   MIGRATION_DEFAULT_CITY_NAME                (default دسوق)
 *   MIGRATION_OPERATOR_PHONES                  (path to { "<name>": "+2010..." })
 *   MIGRATION_DRY_RUN=1                        (same as --dry-run)
 */

import { readFileSync } from "node:fs";

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* V2 taxonomy is already seeded from the dashboard contract; the ETL only maps
 * V1 free-text labels onto it. It never recreates vendor types or categories. */
import {
  CATEGORY_SEED,
  VARIANT_SEED,
  VENDOR_TYPE_SEED,
} from "../src/lib/taxonomy/data.generated";

/* ─────────────────────────────── config ─────────────────────────────── */

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string): string => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : "";
};
const only = new Set(
  valueOf("--only")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const dryRun = flag("--dry-run") || process.env.MIGRATION_DRY_RUN === "1";

const PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || "kanjo-desouk").trim();
/**
 * The single city V2 runs. Directive 4 requires the ETL to FETCH this at
 * runtime instead of hardcoding `city-desouk`: the production database is the
 * authority on its own city id. The env values only bootstrap an empty database
 * or seed a dry run.
 */
const ENV_CITY_ID = String(process.env.MIGRATION_DEFAULT_CITY_ID || "city-desouk").trim();
const ENV_CITY_NAME = String(process.env.MIGRATION_DEFAULT_CITY_NAME || "دسوق").trim();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || !value.trim()) throw new Error(`Missing required env: ${key}`);
  return value.trim();
}

const adminApp = process.env.FIREBASE_SERVICE_ACCOUNT
  ? initializeApp(
      { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), projectId: PROJECT_ID },
      "migrate-v1-to-v2",
    )
  : initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }, "migrate-v1-to-v2");

const db = getFirestore(adminApp);

const sb: SupabaseClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* ──────────────────────────── primitives ───────────────────────────── */

type Doc = Record<string, any>;
type V1Doc = Doc & { _id: string };

const log = (msg: string) => console.log(msg);
const warn = (msg: string) => console.warn(`  ! ${msg}`);

const summary: Record<string, number> = {};
function count(step: string, n = 1) {
  summary[step] = (summary[step] || 0) + n;
}

const chunk = <T,>(rows: T[], size = 400): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const firstStr = (...vals: unknown[]): string => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
};
const num = (v: unknown): number => {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** currency units → bigint minor units */
const toMinor = (v: unknown): number => Math.round(num(v) * 100);
/** percent field, DB checks 0–100 */
const pct = (v: unknown): number => Math.min(100, Math.max(0, num(v)));

function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "object" && typeof (v as any).toDate === "function") {
    const d = (v as any).toDate() as Date;
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function toMonthStart(v: unknown): string | null {
  const iso = toIso(v);
  if (iso) return `${iso.slice(0, 7)}-01`;
  const s = str(v);
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return null;
}

function toDateOnly(v: unknown): string {
  const iso = toIso(v);
  if (iso) return iso.slice(0, 10);
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10);
}

/** Mirrors public/js/utils/helpers.js getBaseName */
function baseName(v: unknown): string {
  let s = str(v).replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u061C]/g, "");
  while (s.includes("(متابعة)") || s.includes("(متابعه)")) {
    s = s.replace(/\s*\(متابعة\)\s*/g, "").replace(/\s*\(متابعه\)\s*/g, "").trim();
  }
  return s.trim();
}

function normalizeName(v: unknown): string {
  return baseName(v)
    .normalize("NFKC")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizePhone(raw: unknown): string | null {
  let digits = str(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = "+" + digits.slice(1).replace(/\D/g, "");
  else digits = digits.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("20")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+20${digits.slice(1)}`;
  if (digits.length >= 8) return `+${digits}`;
  return null;
}

/**************************************************************************
 * Directive 5 — map V1 free text onto the EXISTING V2 taxonomy.
 *
 * V2 already owns the dashboard taxonomy (`src/lib/taxonomy/data.generated.ts`,
 * generated from `public/js/config/qemaTaxonomy.js`). The ETL must never create
 * vendor types or categories; it only resolves the labels V1 stored onto the
 * seeded ids. Anything that cannot be resolved stays null and is reported, so a
 * bad label never silently lands in the wrong scope.
 **************************************************************************/

/** V1 merchant activity label → Qema vendor type label (qemaTaxonomy mapping). */
const V1_VENDOR_TYPE_MAPPING: Record<string, string> = {
  حلويات: "الحلو",
  مطعم: "مطعم",
  كافيه: "قهوة وعصاير",
  عطارة: "محمصة وعطارة",
  خضار: "خضار وفاكهة",
  "سوبر ماركت": "سوبر ماركت",
  صيدلية: "صيدلية",
  مكتبة: "مكتبات وهدايا",
  بيطري: "ادوية بيطرية",
  كهرباء: "أدوات كهربائية",
  مخبز: "مخبز",
  جزارة: "جزارة ودواجن وأسماك",
  تجميل: "مستحضرات التجميل",
  منظفات: "منظفات",
  موبايلات: "موبايلات واكسسوارات",
};

/** Emoji / plural / combined labels actually present on V1 merchant docs. */
const V1_VENDOR_TYPE_ALIASES: Record<string, string> = {
  "🍔 مطاعم وكافيهات": "مطعم",
  "مطاعم وكافيهات": "مطعم",
  مطاعم: "مطعم",
  كافيهات: "كافيه",
  "🍰 حلويات": "حلويات",
  "💄 كوزماتكس": "تجميل",
  كوزماتكس: "تجميل",
  "🥐 مخبوزات": "مخبز",
  مخبوزات: "مخبز",
  "🐟 أسماك": "جزارة",
  أسماك: "جزارة",
  "🥩 جزارة": "جزارة",
  "📱 إكسسوارات موبايل": "موبايلات",
  "إكسسوارات موبايل": "موبايلات",
  "🐾 مستلزمات الحيوانات الأليفة": "بيطري",
  "مستلزمات الحيوانات الأليفة": "بيطري",
  "💊 صيدليات وعناية شخصية": "صيدلية",
  "صيدليات وعناية شخصية": "صيدلية",
};

/** V1 category shorthands/brand names → canonical dashboard category name. */
const V1_CATEGORY_ALIASES: Record<string, string> = {
  "ميلك شيك": "ميلك شيك",
  ميرندا: "صودا",
  پيبسي: "صودا",
  كوكاكولا: "صودا",
  سبرايت: "صودا",
  صودا: "صودا",
  رضعات: "كوكتيل",
  "عصير اطفال": "كوكتيل",
};

type TaxonomyIndex = {
  vendorByName: Map<string, number>;
  categoriesByVendor: Map<number, Map<string, { id: number; name: string }>>;
};

function buildTaxonomyIndex(): TaxonomyIndex {
  const vendorByName = new Map<string, number>();
  for (const vendor of VENDOR_TYPE_SEED) {
    vendorByName.set(normalizeName(vendor.name_ar), vendor.id);
    vendorByName.set(normalizeName(vendor.name_en), vendor.id);
  }
  const categoriesByVendor = new Map<number, Map<string, { id: number; name: string }>>();
  for (const category of CATEGORY_SEED) {
    let scoped = categoriesByVendor.get(category.vendor_type_id);
    if (!scoped) {
      scoped = new Map();
      categoriesByVendor.set(category.vendor_type_id, scoped);
    }
    const entry = { id: category.id, name: category.name_ar };
    scoped.set(normalizeName(category.name_ar), entry);
    if (category.name_en) scoped.set(normalizeName(category.name_en), entry);
  }
  return { vendorByName, categoriesByVendor };
}

const taxonomy: TaxonomyIndex = buildTaxonomyIndex();

/** Merges `system_config/dynamic_taxonomy` (`{[vendor]: {[name]: 'ID:n'}}`). */
function mergeDynamicTaxonomy(doc: Doc | undefined): void {
  if (!doc || typeof doc !== "object") return;
  let merged = 0;
  for (const [vendorLabel, mapping] of Object.entries(doc)) {
    if (!mapping || typeof mapping !== "object") continue;
    const vendorTypeId = resolveVendorTypeId(vendorLabel);
    if (!vendorTypeId) {
      warn(`dynamic_taxonomy: unknown vendor type "${vendorLabel}" — ignored`);
      continue;
    }
    let scoped = taxonomy.categoriesByVendor.get(vendorTypeId);
    if (!scoped) {
      scoped = new Map();
      taxonomy.categoriesByVendor.set(vendorTypeId, scoped);
    }
    for (const [name, raw] of Object.entries(mapping as Record<string, unknown>)) {
      const id = Number(String(raw).replace(/^ID:/i, ""));
      if (!Number.isFinite(id) || id <= 0) continue;
      const key = normalizeName(name);
      if (!key || scoped.has(key)) continue;
      scoped.set(key, { id, name: str(name) });
      merged += 1;
    }
  }
  if (merged) log(`  dynamic taxonomy: +${merged} category aliases merged`);
}

/** V1 labels are emoji-prefixed ("🍔 مطاعم وكافيهات"); strip decoration so the
 * Arabic words can be matched against the seeded taxonomy labels. */
function stripDecoration(raw: unknown): string {
  return str(raw)
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, " ")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, " ")
    .trim();
}

/** V1 activity label → V2 vendor type id (exact alias, then longest key). */
function resolveVendorTypeId(raw: unknown): number | null {
  const cleaned = stripDecoration(raw);
  const key = normalizeName(cleaned);
  if (!key) return null;

  const direct = taxonomy.vendorByName.get(key);
  if (direct) return direct;

  const aliasLabel =
    V1_VENDOR_TYPE_ALIASES[cleaned] ||
    V1_VENDOR_TYPE_ALIASES[str(raw).trim()] ||
    Object.entries(V1_VENDOR_TYPE_ALIASES).find(([label]) => normalizeName(label) === key)?.[1];
  if (aliasLabel) {
    const mapped = V1_VENDOR_TYPE_MAPPING[aliasLabel] || aliasLabel;
    const id = taxonomy.vendorByName.get(normalizeName(mapped));
    if (id) return id;
  }

  const mappedLabel =
    V1_VENDOR_TYPE_MAPPING[cleaned] ||
    V1_VENDOR_TYPE_MAPPING[str(raw).trim()] ||
    Object.entries(V1_VENDOR_TYPE_MAPPING).find(([label]) => normalizeName(label) === key)?.[1];
  if (mappedLabel) {
    const id = taxonomy.vendorByName.get(normalizeName(mappedLabel));
    if (id) return id;
  }

  // Longest vendor label contained in the free text ("مطاعم وكافيهات" → مطعم).
  const contained = [...taxonomy.vendorByName.keys()]
    .filter((vendorKey) => vendorKey.length > 2 && key.includes(vendorKey))
    .sort((left, right) => right.length - left.length)[0];
  return contained ? taxonomy.vendorByName.get(contained)! : null;
}

/** Resolves a category name to `{id, name}` inside a vendor's scope only. */
function resolveCategory(
  vendorTypeId: number | null,
  raw: unknown,
): { id: number; name: string } | null {
  if (vendorTypeId == null) return null;
  const scoped = taxonomy.categoriesByVendor.get(vendorTypeId);
  if (!scoped) return null;

  const key = normalizeName(raw);
  if (!key) return null;

  const aliasName = V1_CATEGORY_ALIASES[str(raw).trim()];
  const aliasKey = aliasName ? normalizeName(aliasName) : "";
  return scoped.get(key) || (aliasKey ? scoped.get(aliasKey) || null : null);
}

/** Reads the official category ids V1 persisted in `kanjo_categories`. */
function storedCategoryIds(product: Doc): number[] {
  const raw = product.kanjo_categories;
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.trim()
      ? raw.split(",")
      : [];
  const ids: number[] = [];
  for (const value of values) {
    const match = String(value).match(/^ID:(\d+)/);
    if (match) ids.push(Number(match[1]));
  }
  return ids;
}

function resolveStoredCategory(
  vendorTypeId: number | null,
  ids: number[],
): { id: number; name: string } | null {
  if (vendorTypeId == null || !ids.length) return null;
  const scoped = taxonomy.categoriesByVendor.get(vendorTypeId);
  if (!scoped) return null;
  for (const entry of scoped.values()) {
    if (ids.includes(entry.id)) return entry;
  }
  return null;
}

/** Deterministic fake uuid for dry-run bookkeeping only. */
function fakeUuid(seed: string): string {
  let h = 0x811c9dc5;
  const out: string[] = [];
  for (let block = 0; block < 4; block++) {
    let hex = "";
    for (let i = 0; i < 8; i++) {
      h ^= seed.charCodeAt((block * 8 + i) % Math.max(1, seed.length)) + block + i;
      h = Math.imul(h, 0x01000193) >>> 0;
      hex += (h & 0xf).toString(16);
    }
    out.push(hex);
  }
  return `${out[0]}-${out[1].slice(0, 4)}-4${out[1].slice(5, 8)}-a${out[2].slice(1, 4)}-${out[2]}${out[3]}`;
}

/* ───────────────────────── Supabase write helpers ───────────────────── */

function table(name: string) {
  return sb.schema("app").from(name);
}

/** Strips synthetic bookkeeping keys (leading `_`) from a row payload. */
function payload(row: Doc): Doc {
  const out: Doc = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

async function pgUpsert(step: string, tableName: string, rows: Doc[], onConflict: string, size = 400): Promise<number> {
  if (!rows.length) return 0;
  if (dryRun) {
    log(`  [dry-run] upsert ${rows.length} → app.${tableName}`);
    count(step, rows.length);
    return rows.length;
  }
  let written = 0;
  for (const part of chunk(rows, size)) {
    const { error } = await table(tableName).upsert(part.map(payload), { onConflict });
    if (error) {
      throw new Error(`upsert app.${tableName} (${step}) failed: ${error.message} | sample=${JSON.stringify(payload(part[0]))}`);
    }
    written += part.length;
  }
  count(step, written);
  return written;
}

/**
 * Append-only / trigger-guarded tables: insert rows whose synthetic key is not
 * already present, never UPDATE.
 */
async function pgInsertMissing(step: string, tableName: string, rows: Doc[], keyOf: (row: Doc) => string, existing: Set<string>): Promise<number> {
  const fresh = rows.filter((row) => {
    const key = keyOf(row);
    if (existing.has(key)) return false;
    existing.add(key);
    return true;
  });
  if (!fresh.length) return 0;
  if (dryRun) {
    log(`  [dry-run] insert ${fresh.length} → app.${tableName}`);
    count(step, fresh.length);
    return fresh.length;
  }
  let written = 0;
  for (const part of chunk(fresh, 400)) {
    const { error } = await table(tableName).insert(part.map(payload));
    if (error) {
      throw new Error(`insert app.${tableName} (${step}) failed: ${error.message} | sample=${JSON.stringify(payload(part[0]))}`);
    }
    written += part.length;
  }
  count(step, written);
  return written;
}

async function readAll(collectionName: string): Promise<V1Doc[]> {
  const out: V1Doc[] = [];
  const snap = await db.collection(collectionName).get();
  snap.forEach((doc: any) => out.push({ ...(doc.data() as Doc), _id: doc.id }));
  return out;
}

async function selectColumns(tableName: string, columns: string): Promise<Doc[]> {
  if (dryRun) return [];
  const { data, error } = await table(tableName).select(columns);
  if (error) throw new Error(`select app.${tableName} failed: ${error.message}`);
  return (data || []) as Doc[];
}

/* ─────────────────────────── V1 normalisers ─────────────────────────── */

type ContractState = "no_agreement" | "provisional" | "final_contract" | "signed_contract";
const STATE_RANK: Record<ContractState, number> = {
  no_agreement: 0,
  provisional: 1,
  final_contract: 2,
  signed_contract: 3,
};

function contractStateOf(task: Doc): ContractState {
  const achieved = num(task.achieved);
  if (task.isSigned === true && achieved > 0) return "signed_contract";
  if (task.isProvisional === true) return "provisional";
  if (task.isSigned === true) return "final_contract";
  return "no_agreement";
}

function mergeContractState(a: ContractState, b: ContractState): ContractState {
  return STATE_RANK[b] > STATE_RANK[a] ? b : a;
}

function productStateOf(status: unknown): "pending_review" | "completed" | "published" {
  const s = str(status).toLowerCase();
  // V1 never wrote `published`; `done` is the image-QA completion state.
  if (s === "done" || s === "completed" || s === "published") return "completed";
  return "pending_review";
}

function pickImage(p: Doc): string | null {
  const enhanced = Array.isArray(p.enhancedImageUrls) ? p.enhancedImageUrls : [];
  const raw = Array.isArray(p.rawImageUrls) ? p.rawImageUrls : [];
  const value = firstStr(enhanced[0], p.enhancedImageUrl, raw[0], p.rawImageUrl, p.image_url, p.imageUrl);
  return value || null;
}

function merchantDocuments(raw: unknown): Doc[] {
  if (Array.isArray(raw)) return raw.filter(Boolean) as Doc[];
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Doc).map(([kind, value]) => {
      if (value && typeof value === "object") return { kind, ...(value as Doc) };
      return { kind, url: str(value) };
    });
  }
  return [];
}

/* V1 capability key → V2 `app.permissions.key` (one V1 key can grant several). */
const PERMISSION_MAP: Record<string, string[]> = {
  canCreateTasks: ["assign_tasks"],
  canApproveTasks: ["approve_tasks"],
  canViewTasks: ["view_field_ops"],
  canManageTransferQueue: ["request_transfers", "approve_transfers"],
  canArchiveReports: ["view_all_teams_visits"],
  canBrowseCatalog: ["view_catalog"],
  canViewAllCatalogProducts: ["view_catalog"],
  canAddProducts: ["create_products"],
  canEditProducts: ["edit_catalog"],
  canReviewImages: ["review_catalog_images"],
  canDeleteProducts: ["delete_products"],
  canExportExcel: ["export_merchant_data"],
  canUseDataEntryTools: ["add_catalog"],
  canImportProductsExcel: ["add_catalog"],
  canEditMerchant: ["edit_merchants"],
  canManageContracts: ["create_contracts", "edit_contract", "sign_contract"],
  canViewFinance: ["view_finance"],
  canViewFinancialProfile: ["view_financials"],
  canViewKpi: ["view_rep_kpi", "view_global_kpi"],
  canViewFounderAudit: ["view_overview_compliance"],
  canViewAnalytics: ["view_city_analytics"],
  canViewNotifications: ["view_overview"],
  canViewMarketing: ["view_campaigns"],
  canViewBlackBox: ["view_overview_compliance"],
  canIssueAuthorization: ["create_contracts"],
  canImportMenu: ["manage_catalog"],
  canManageUsers: ["manage_system_users"],
};

const ROLE_CLEARANCE: Record<string, number> = {
  super_admin: 4,
  admin: 4,
  founder: 3,
  accounting: 3,
  marketing: 3,
  rep: 1,
  data_entry: 2,
  product_audit: 2,
};

const ROLE_BASELINE_V2: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  founder: ["view_overview", "view_merchants", "view_catalog", "view_finance", "view_global_kpi", "manage_system_users"],
  accounting: ["view_finance", "view_financials", "view_payroll", "manage_payroll", "view_accounts"],
  marketing: ["view_campaigns", "manage_marketing_metrics", "record_campaign_results", "create_campaign"],
  rep: ["view_field_ops", "start_end_visit", "write_report", "view_catalog", "view_rep_kpi", "request_ownership_transfer"],
  data_entry: ["add_catalog", "edit_catalog", "view_catalog"],
  product_audit: ["view_catalog", "edit_catalog", "review_catalog_images"],
};

/* ─────────────────────────── runtime state ──────────────────────────── */

const operatorPhones: Record<string, string> = (() => {
  const path = String(process.env.MIGRATION_OPERATOR_PHONES || "").trim();
  if (!path) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  } catch (err) {
    warn(`MIGRATION_OPERATOR_PHONES unreadable (${path}): ${(err as Error).message}`);
    return {};
  }
})();

/** V1 operator name → app.users.id (uuid) */
const userIdByName = new Map<string, string>();
/** V1 Firestore task id → merchantId */
const merchantIdByTaskId = new Map<string, string>();
/** V1 merchant base name → merchantId */
const merchantIdByBase = new Map<string, string>();
/** Every merchantId that exists in app.merchants after the merchants step */
const knownMerchantIds = new Set<string>();
/** merchantId → resolved V2 vendor type id (from the merchant's activity) */
const merchantVendorTypeId = new Map<string, number | null>();
/** V1 team name → app.field_teams.id */
const teamIdByName = new Map<string, string>();
/** V2 catalogue permission keys, loaded once */
let v2PermissionKeys: string[] | null = null;

/** The single city every V1 record is attached to, resolved at runtime. */
let cityId = ENV_CITY_ID;

let v1Users: V1Doc[] = [];
let v1FinancialProfiles: V1Doc[] = [];
let v1Tasks: V1Doc[] = [];

function resolveUserId(name: unknown): string | null {
  const key = str(name);
  if (!key) return null;
  return userIdByName.get(key) || userIdByName.get(baseName(key)) || null;
}

async function permissionKeys(): Promise<string[]> {
  if (v2PermissionKeys) return v2PermissionKeys;
  if (dryRun) {
    // No database read in dry-run: assume every key the ETL can emit exists.
    const keys = new Set<string>();
    for (const list of Object.values(ROLE_BASELINE_V2)) {
      for (const key of list) if (key !== "*") keys.add(key);
    }
    for (const list of Object.values(PERMISSION_MAP)) {
      for (const key of list) keys.add(key);
    }
    v2PermissionKeys = [...keys];
    return v2PermissionKeys;
  }
  const rows = await selectColumns("permissions", "key");
  v2PermissionKeys = rows.map((r) => str(r.key)).filter(Boolean);
  return v2PermissionKeys;
}

/* ─────────────────────────────── steps ──────────────────────────────── */

/**
 * Resolves the single city V2 runs (directive 4).
 *
 * Reads the city the database already holds. Only an empty database — or a
 * dry run, which cannot read — falls back to the env bootstrap, and then the
 * row is created from it. The ETL never invents a second city.
 */
async function migrateCities() {
  log("\n[app.cities → resolve the single live city]");

  if (!dryRun) {
    const existing = await selectColumns("cities", "id,name");
    if (existing.length === 1) {
      cityId = str(existing[0].id);
      log(`  using existing city ${cityId} (${str(existing[0].name)})`);
      count("cities", 0);
      return;
    }
    if (existing.length > 1) {
      const match = existing.find(
        (row) => str(row.id) === ENV_CITY_ID || str(row.name) === ENV_CITY_NAME,
      );
      if (!match) {
        throw new Error(
          `app.cities holds ${existing.length} rows and none matches MIGRATION_DEFAULT_CITY_ID/NAME. ` +
            `V2 is single-city: point the migration at the right city or fix the data before importing.`,
        );
      }
      cityId = str(match.id);
      warn(`app.cities holds ${existing.length} rows; migrating into ${cityId} (${str(match.name)})`);
      count("cities", 0);
      return;
    }
  }

  const row: Doc = {
    id: ENV_CITY_ID,
    name: ENV_CITY_NAME,
    country: "مصر",
    governorate: "كفر الشيخ",
    population: 0,
    stage: "live_operations",
    competitors: [],
    strategic_notes: "",
    zone: [],
    created_by: "migration",
    created_by_name: "V1 → V2 migration",
  };
  cityId = ENV_CITY_ID;
  log(`  no city found — seeding ${cityId} (${ENV_CITY_NAME}) from the environment bootstrap`);
  await pgUpsert("cities", "cities", [row], "id");
}

async function migrateTaxonomy() {
  log("\n[system_config/dynamic_taxonomy → V2 taxonomy aliases]");
  // Directive 5: only fold V1's extra names into the existing V2 taxonomy; never
  // create vendor types or categories.
  const configs = await readAll("system_config");
  mergeDynamicTaxonomy(configs.find((c) => c._id === "dynamic_taxonomy") as Doc | undefined);
}

async function migrateTeams() {
  log("\n[system_config/teams → app.field_teams]");
  const configs = await readAll("system_config");
  const teamsDoc = configs.find((c) => c._id === "teams");
  const names = new Set<string>(["Fox Team", "Power Team"]);
  const list = Array.isArray(teamsDoc?.list) ? (teamsDoc!.list as Doc[]) : [];
  for (const t of list) {
    const name = str(t?.name);
    if (name) names.add(name);
  }

  for (const row of await selectColumns("field_teams", "id,name")) {
    teamIdByName.set(str(row.name), str(row.id));
  }

  const missing = [...names].filter((n) => !teamIdByName.has(n)).map((name) => ({ city_id: cityId, name }));
  if (missing.length) {
    if (dryRun) {
      log(`  [dry-run] insert ${missing.length} → app.field_teams`);
      missing.forEach((m, i) => teamIdByName.set(m.name, fakeUuid(`team:${m.name}:${i}`)));
    } else {
      const { error } = await table("field_teams").insert(missing);
      if (error) throw new Error(`insert app.field_teams failed: ${error.message}`);
      for (const row of await selectColumns("field_teams", "id,name")) {
        teamIdByName.set(str(row.name), str(row.id));
      }
    }
  }
  count("teams", missing.length);
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data.users as Array<{ id: string; email?: string | null }>;
    const hit = users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < 1000) return null;
    page += 1;
  }
}

async function migrateUsers() {
  log("\n[users → auth.users + app.users]");
  v1Users = await readAll("users");
  v1FinancialProfiles = await readAll("financial_profiles");

  const walletPhoneByName = new Map<string, string>();
  for (const fp of v1FinancialProfiles) {
    const details = (fp.details || {}) as Doc;
    const phone = normalizePhone(details.phone || details.value);
    if (phone) walletPhoneByName.set(fp._id, phone);
  }

  const rows: Doc[] = [];
  for (const doc of v1Users) {
    const name = firstStr(doc.name, doc.full_name, doc._id);
    if (!name) {
      warn(`users/${doc._id}: no display name — skipped`);
      continue;
    }
    const phone =
      normalizePhone(operatorPhones[name]) ||
      normalizePhone(operatorPhones[doc._id]) ||
      normalizePhone(doc.phone) ||
      normalizePhone(doc.phoneNumber) ||
      walletPhoneByName.get(name) ||
      null;
    if (!phone) {
      warn(`users/${doc._id} "${name}": no resolvable phone (app.users.phone is NOT NULL) — skipped. Add it to MIGRATION_OPERATOR_PHONES ({"${name}": "+2010…"}).`);
      continue;
    }

    const email = str(doc.email) || `${doc._id}@kanjo.local`;
    const role = str(doc.role) || "rep";
    const team = str(doc.team);

    let authId: string;
    if (dryRun) {
      authId = fakeUuid(`user:${name}`);
    } else {
      const existing = await findAuthUserIdByEmail(email);
      if (existing) {
        authId = existing;
      } else {
        const password = `mig-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        const { data, error } = await sb.auth.admin.createUser({
          email,
          phone,
          password,
          email_confirm: true,
          phone_confirm: true,
        });
        if (error || !data.user) {
          warn(`auth create failed for "${name}" (${email}): ${error?.message ?? "unknown"} — skipped`);
          continue;
        }
        authId = data.user.id;
      }
    }

    userIdByName.set(name, authId);
    userIdByName.set(baseName(name), authId);
    count("users");

    rows.push({
      id: authId,
      phone,
      email,
      full_name: name,
      title: firstStr(doc.title, role),
      team,
      team_id: teamIdByName.get(team) || null,
      clearance_level: ROLE_CLEARANCE[role] ?? 1,
      active: doc.active !== false,
    });
  }

  await pgUpsert("users", "users", rows, "id");
}

async function migrateUserPermissions() {
  log("\n[users.permissions → app.user_permissions + app.user_city_scope]");
  const allKeys = await permissionKeys();
  const grants: Doc[] = [];
  const scopes: Doc[] = [];

  for (const doc of v1Users) {
    const userId = resolveUserId(firstStr(doc.name, doc._id));
    if (!userId) continue;

    const role = str(doc.role) || "rep";
    const desired = new Set<string>();

    for (const key of ROLE_BASELINE_V2[role] || []) {
      if (key === "*") allKeys.forEach((k) => desired.add(k));
      else desired.add(key);
    }
    if (doc.superAdmin === true) allKeys.forEach((k) => desired.add(k));

    const map = (doc.permissions || {}) as Record<string, unknown>;
    for (const [v1Key, granted] of Object.entries(map)) {
      if (!granted) continue;
      const mapped = PERMISSION_MAP[v1Key];
      if (!mapped) {
        warn(`users/${doc._id}: unmapped V1 permission "${v1Key}" dropped`);
        continue;
      }
      mapped.forEach((k) => desired.add(k));
    }

    for (const permission_key of desired) {
      if (!allKeys.includes(permission_key)) {
        warn(`users/${doc._id}: permission "${permission_key}" missing from app.permissions — dropped`);
        continue;
      }
      grants.push({ user_id: userId, permission_key, granted_by: null });
    }

    scopes.push({ user_id: userId, city_id: cityId, granted_by: null });
  }

  const seen = new Set<string>();
  const unique = grants.filter((g) => {
    const key = `${g.user_id}::${g.permission_key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await pgUpsert("user_permissions", "user_permissions", unique, "user_id,permission_key");
  await pgUpsert("user_city_scope", "user_city_scope", scopes, "user_id,city_id");
}

type TaskGroup = {
  name: string;
  team: string;
  category: string;
  state: ContractState;
  achieved: number;
  createdAt: string | null;
};

function buildTaskIndex(): Map<string, TaskGroup> {
  const byBase = new Map<string, TaskGroup>();
  for (const task of v1Tasks) {
    const merchantId = str(task.merchantId);
    const base = baseName(task.name);
    if (merchantId) merchantIdByTaskId.set(task._id, merchantId);
    if (!base) continue;

    const state = contractStateOf(task);
    const prev = byBase.get(base);
    if (!prev) {
      byBase.set(base, {
        name: base,
        team: str(task.team),
        category: str(task.cat),
        state,
        achieved: num(task.achieved),
        createdAt: toIso(task.createdAt),
      });
      continue;
    }
    prev.state = mergeContractState(prev.state, state);
    if (!prev.team && task.team) prev.team = str(task.team);
    if (!prev.category && task.cat) prev.category = str(task.cat);
    if (num(task.achieved) > prev.achieved) prev.achieved = num(task.achieved);
    const created = toIso(task.createdAt);
    if (created && (!prev.createdAt || created < prev.createdAt)) prev.createdAt = created;
  }
  return byBase;
}

async function migrateMerchants() {
  log("\n[merchants + tasks → app.merchants + app.merchant_v1_profiles]");
  v1Tasks = await readAll("tasks");
  const taskIndex = buildTaskIndex();
  const merchantDocs = await readAll("merchants");

  const byId = new Map<string, { merchant: Doc; profile: Doc }>();
  const usedNormalized = new Set<string>();

  const addMerchant = (id: string, name: string, src: Doc, group?: TaskGroup) => {
    if (!id || byId.has(id)) return;
    const normalized = normalizeName(name);
    let normalizedName = normalized;
    if (normalized && usedNormalized.has(normalized)) {
      // Unique partial index is only enforced when non-empty; blank it so the
      // duplicate merchant can still exist (visits/products reference the id).
      warn(`merchant "${name}" (${id}): duplicate normalized name — normalized_name blanked`);
      normalizedName = "";
    }
    if (normalizedName) usedNormalized.add(normalizedName);

    const documents = merchantDocuments(src.documents);
    const contactName = firstStr(src.contactPerson, src.ownerName, src.owner, src.contactName);
    const contactPhone = firstStr(src.phone, src.phoneNumber, src.mobile);
    const contact =
      contactName || contactPhone
        ? { name: contactName, role: firstStr(src.contactRole), mobile: contactPhone }
        : null;

    const contractStatus = str(src.contractStatus);
    const state: ContractState = group
      ? group.state
      : contractStatus === "final"
        ? "signed_contract"
        : contractStatus === "vip"
          ? "provisional"
          : "no_agreement";

    const vendorTypeLabel = firstStr(group?.category, src.category, src.cat);
    const vendorTypeId = resolveVendorTypeId(vendorTypeLabel);
    if (!vendorTypeId) {
      warn(`merchant "${name}" (${id}): activity "${vendorTypeLabel}" has no V2 vendor type — vendor_type_id left null`);
    }
    merchantVendorTypeId.set(id, vendorTypeId);

    const merchant: Doc = {
      id,
      name,
      normalized_name: normalizedName,
      vendor_type_id: vendorTypeId,
      vendor_type: vendorTypeLabel,
      team: firstStr(group?.team, src.team) || null,
      city_id: cityId,
      target_commission: pct(src.targetCommission),
      monthly_value_minor: toMinor(src.monthlyValue),
      strategic_notes: str(src.strategicNotes),
      contract_state: state,
      agreed_commission: num(src.agreedCommission) > 0 ? pct(src.agreedCommission) : null,
      commission_amount: num(src.commissionAmount),
      documents,
      contact,
      contact_updated_at: toIso(src.contactUpdatedAt || src.docsUpdatedAt),
      last_visit_at: toIso(src.lastVisitAt),
      created_at: toIso(src.createdAt) || new Date().toISOString(),
      updated_at: toIso(src.updatedAt) || new Date().toISOString(),
    };
    const profile: Doc = {
      merchant_id: id,
      actual_address: str(src.address),
      facebook_url: firstStr((src.socialLinks || {}).facebook, src.fbPage),
      instagram_url: firstStr((src.socialLinks || {}).instagram, src.insta),
      drive_folder_url: str(src.driveFolderLink),
      // V1 `dashboardUploaded` is Laravel-sync state, not app publish state.
      app_published: false,
      vip_menu: src.vipPreContract === true,
      updated_at: toIso(src.updatedAt) || new Date().toISOString(),
    };
    byId.set(id, { merchant, profile });
    knownMerchantIds.add(id);
    merchantIdByBase.set(baseName(name), id);
  };

  for (const doc of merchantDocs) {
    if (doc.archived === true) {
      warn(`merchants/${doc._id}: archived — skipped (no V2 soft-delete column)`);
      continue;
    }
    const id = firstStr(doc.merchantId, doc._id);
    const name = firstStr(doc.name, doc.merchantName);
    if (!id || !name) {
      warn(`merchants/${doc._id}: missing id/name — skipped`);
      continue;
    }
    addMerchant(id, name, doc, taskIndex.get(baseName(name)));
  }

  for (const [base, group] of taskIndex) {
    if (merchantIdByBase.has(base)) continue;
    const task = v1Tasks.find((t) => baseName(t.name) === base && str(t.merchantId));
    const id = task ? merchantIdByTaskId.get(task._id) : undefined;
    if (!id) {
      warn(`merchant "${base}": no merchantId on any task — skipped (its products will be skipped)`);
      continue;
    }
    addMerchant(id, base, { name: base }, group);
  }

  const merchants = [...byId.values()].map((e) => e.merchant);
  const profiles = [...byId.values()].map((e) => e.profile);
  await pgUpsert("merchants", "merchants", merchants, "id");
  await pgUpsert("merchant_v1_profiles", "merchant_v1_profiles", profiles, "merchant_id");
}

async function migrateCatalog() {
  log("\n[merchant_products → app.catalog_products]");
  if (!merchantIdByBase.size) await migrateMerchants();

  const products = await readAll("merchant_products");
  const rows: Doc[] = [];
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  const seenMerchantName = new Set<string>();

  for (const p of products) {
    if (p.deletedAt || p.isDeleted === true) {
      warn(`merchant_products/${p._id}: tombstoned — skipped (no V2 tombstone column)`);
      continue;
    }
    const merchantId = str(p.merchantId) || merchantIdByBase.get(baseName(p.merchantName));
    if (!merchantId || !knownMerchantIds.has(merchantId)) {
      warn(`merchant_products/${p._id}: merchant "${str(p.merchantId)}" not migrated — skipped (FK)`);
      continue;
    }

    const name = firstStr(p.name_ar, p.name, p.name_en);
    if (!name) {
      warn(`merchant_products/${p._id}: empty name — skipped (NOT NULL)`);
      continue;
    }

    const normalized = normalizeName(name);
    const merchantNameKey = `${merchantId}::${normalized}`;
    if (seenMerchantName.has(merchantNameKey)) {
      warn(`merchant_products/${p._id}: duplicate name "${name}" for merchant ${merchantId} — skipped (unique index)`);
      continue;
    }
    seenMerchantName.add(merchantNameKey);

    let sku = firstStr(p.sku) || null;
    let barcode = firstStr(p.barcode) || null;
    if (sku) {
      const key = sku.toLowerCase();
      if (seenSku.has(key)) {
        warn(`merchant_products/${p._id}: duplicate sku "${sku}" → nulled (unique index)`);
        sku = null;
      } else seenSku.add(key);
    }
    if (barcode) {
      const key = barcode.toLowerCase();
      if (seenBarcode.has(key)) {
        warn(`merchant_products/${p._id}: duplicate barcode "${barcode}" → nulled (unique index)`);
        barcode = null;
      } else seenBarcode.add(key);
    }

    const variations = Array.isArray(p.variations) ? (p.variations as Doc[]) : [];
    // V2 attributes are {variantId, optionIds}. V1 variation rows carry a label
    // and a price; resolve the label to a seeded variant id when possible and
    // keep the raw provenance so nothing is silently reinterpreted.
    const attributes = variations.map((v) => {
      const label = firstStr(v.name);
      const variant = VARIANT_SEED.find(
        (candidate) =>
          normalizeName(candidate.name_ar) === normalizeName(label) ||
          normalizeName(candidate.name_en) === normalizeName(label),
      );
      return {
        variantId: variant ? variant.variant_id : null,
        variantLabel: label,
        optionIds: [] as number[],
        price_minor: toMinor(v.price),
        image_url: str(v.image_url),
      };
    });

    // Directive 7: preserve the V1 image-QA / lock / delete-request provenance
    // verbatim. Only keys that actually exist are copied.
    const qaMetadata: Doc = {};
    for (const key of [
      "image_locked_by",
      "image_locked_by_name",
      "image_locked_at",
      "image_uploaded_by",
      "image_uploaded_at",
      "edit_type",
      "edited_by",
      "edited_at",
      "upload_history",
      "uploaded_at",
      "score",
      "importSource",
      "intakeSource",
      "deleteRequested",
      "deleteRequestedAt",
      "deleteRequestedBy",
      "kanjo_id",
      "kanjo_category_ids",
    ]) {
      if (p[key] !== undefined) qaMetadata[key] = p[key];
    }

    const vendorTypeId = merchantVendorTypeId.get(merchantId) ?? null;
    const category =
      resolveStoredCategory(vendorTypeId, storedCategoryIds(p)) ||
      resolveCategory(vendorTypeId, p.category);
    if (!category) {
      warn(`merchant_products/${p._id}: category "${str(p.category)}" not in the vendor scope — category_key left null`);
    }

    rows.push({
      id: p._id,
      merchant_id: merchantId,
      name,
      normalized_name: normalized,
      description: firstStr(p.description_ar, p.description, p.description_en),
      vendor_type_id: vendorTypeId,
      category_key: category ? `${vendorTypeId}-${category.id}` : null,
      product_type: str(p.product_type) === "variable" ? "variable" : "simple",
      sku,
      barcode,
      image_data_url: pickImage(p),
      attributes,
      price_minor: toMinor(firstStr(p.base_price, p.price)),
      state: productStateOf(p.status),
      review_note: str(p.review_note),
      entered_by_name: firstStr(p.createdBy, p.added_by, p.addedBy) || null,
      client_product_id: null,
      qa_metadata: qaMetadata,
      created_by: resolveUserId(firstStr(p.createdBy, p.added_by, p.addedBy, p.created_by)),
      created_at: toIso(p.createdAt) || new Date().toISOString(),
      updated_at: toIso(p.updatedAt) || new Date().toISOString(),
    });
  }

  await pgUpsert("catalog_products", "catalog_products", rows, "id");
}

async function migrateTasks() {
  log("\n[tasks → app.field_tasks]");
  if (!v1Tasks.length) v1Tasks = await readAll("tasks");

  const rows: Doc[] = v1Tasks.map((t) => {
    const merchantId = str(t.merchantId) || merchantIdByBase.get(baseName(t.name)) || "";
    return {
      id: t._id,
      merchant_id: merchantId,
      merchant_name: baseName(t.name),
      team: str(t.team),
      city_id: cityId,
      visit_date: toDateOnly(t.time || t.createdAt),
      target_commission: pct(t.target),
      strategic_notes: str(t.notes),
      instructions: str(t.instructions),
      status: t.isSigned === true && num(t.achieved) > 0 ? "completed" : "scheduled",
      follow_up_kind: null,
      follow_up_contact_number: null,
      created_by: str(t.createdBy),
      created_by_name: str(t.createdBy),
      created_at: toIso(t.createdAt) || new Date().toISOString(),
    };
  });

  await pgUpsert("field_tasks", "field_tasks", rows, "id");
}

async function migrateVisits() {
  log("\n[tasks.reports + tasks.attendances → app.visit_reports]");
  if (!v1Tasks.length) v1Tasks = await readAll("tasks");

  const rows: Doc[] = [];
  const seenVisitKeys = new Set<string>();
  for (const task of v1Tasks) {
    const merchantId = str(task.merchantId) || merchantIdByBase.get(baseName(task.name));
    if (!merchantId) continue;
    const merchantName = baseName(task.name);
    const taskState = contractStateOf(task);

    for (const report of Array.isArray(task.reports) ? (task.reports as Doc[]) : []) {
      const repName = str(report.name);
      if (!repName) continue;
      const at = toIso(report.ts ?? report.timestamp ?? report.date) || new Date().toISOString();
      const clientVisitId = `report:${task._id}:${report.ts ?? at}:${repName}`;
      const dedupeKey = `${merchantId}\u0000${clientVisitId}`;
      if (seenVisitKeys.has(dedupeKey)) {
        warn(`tasks/${task._id}: duplicate report entry for ${repName} at ${at} — skipped`);
        continue;
      }
      seenVisitKeys.add(dedupeKey);
      const notes = [str(report.general), str(report.merchant), str(report.next)].filter(Boolean).join(" · ");
      const contact = {
        name: str(report.contactName),
        role: str(report.contactRole),
        mobile: str(report.contactPhone),
      };
      rows.push({
        merchant_id: merchantId,
        merchant_name: merchantName,
        task_id: task._id,
        rep_id: repName,
        rep_name: repName,
        team: firstStr(report.team, task.team),
        outcome: taskState,
        previous_state: "no_agreement",
        notes,
        // V1 stores an agreed percentage, not an earned currency amount.
        commission_amount: 0,
        agreed_commission: num(task.achieved) > 0 ? pct(task.achieved) : null,
        created_at: at,
        started_at: null,
        ended_at: null,
        duration_seconds: null,
        start_location: null,
        end_location: null,
        contact: contact.name || contact.mobile ? contact : null,
        opinions: [],
        follow_up_at: null,
        follow_up_task_id: null,
        follow_up_contact_number: null,
        source: "task",
        client_visit_id: clientVisitId,
        logged_by: resolveUserId(repName),
      });
    }

    // Pair consecutive start/end attendance entries into one visit row.
    const geoOf = (loc: string): Doc | null => {
      if (!loc) return null;
      const [lat, lng] = loc.split(",").map((x) => Number(x.trim()));
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, raw: loc } : { raw: loc };
    };
    let open: Doc | null = null;
    for (const att of Array.isArray(task.attendances) ? (task.attendances as Doc[]) : []) {
      if (str(att.type) === "start") {
        open = att;
        continue;
      }
      const repName = str(att.user) || str(open?.user);
      if (!repName) {
        open = null;
        continue;
      }
      // `time` carries the precise timestamp; `date` is date-only, so prefer `time`.
      const startedAt = toIso(open?.time) || toIso(open?.date) || toIso(att.time) || toIso(att.date) || new Date().toISOString();
      const endedAt = toIso(att.time) || toIso(att.date) || startedAt;
      const duration = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
      const clientVisitId = `attendance:${task._id}:${startedAt}:${repName}`;
      const dedupeKey = `${merchantId}\u0000${clientVisitId}`;
      if (seenVisitKeys.has(dedupeKey)) {
        open = null;
        continue;
      }
      seenVisitKeys.add(dedupeKey);
      rows.push({
        merchant_id: merchantId,
        merchant_name: merchantName,
        task_id: task._id,
        rep_id: repName,
        rep_name: repName,
        team: str(task.team),
        // Attendances record only start/end; no contract outcome was captured.
        outcome: "no_agreement",
        previous_state: "no_agreement",
        notes: "زيارة ميدانية (بدء/إنهاء)",
        commission_amount: 0,
        agreed_commission: null,
        created_at: startedAt,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: duration,
        start_location: open ? geoOf(str(open.loc)) : null,
        end_location: geoOf(str(att.loc)),
        contact: null,
        opinions: [],
        follow_up_at: null,
        follow_up_task_id: null,
        follow_up_contact_number: null,
        source: "task",
        client_visit_id: clientVisitId,
        logged_by: resolveUserId(repName),
      });
      open = null;
    }
  }

  const existing = new Set<string>();
  for (const r of await selectColumns("visit_reports", "merchant_id,client_visit_id")) {
    existing.add(`${str(r.merchant_id)}\u0000${str(r.client_visit_id)}`);
  }
  await pgInsertMissing("visit_reports", "visit_reports", rows, (r) => `${r.merchant_id}\u0000${r.client_visit_id}`, existing);
}

async function migrateTransferRequests() {
  log("\n[transferRequests → app.transfer_requests]");
  if (!v1Tasks.length) v1Tasks = await readAll("tasks");

  const rows: Doc[] = [];
  const seenPending = new Set<string>();
  for (const d of await readAll("transferRequests")) {
    const taskId = str(d.taskId);
    const merchantId = merchantIdByTaskId.get(taskId) || str(d.merchantId) || "";
    if (!merchantId) {
      warn(`transferRequests/${d._id}: no merchant — skipped (NOT NULL)`);
      continue;
    }
    const raw = str(d.status);
    const status = raw === "approved" || raw === "rejected" ? raw : "pending";
    const createdAt = toIso(d.timestamp) || new Date().toISOString();
    const requestedBy = str(d.requestedBy);

    // Unique partial index: one pending row per (merchant_id, requested_by).
    if (status === "pending") {
      const key = `${merchantId}\u0000${requestedBy}`;
      if (seenPending.has(key)) {
        warn(`transferRequests/${d._id}: duplicate pending request — skipped`);
        continue;
      }
      seenPending.add(key);
    }

    rows.push({
      id: d._id,
      merchant_id: merchantId,
      merchant_name: baseName(d.taskName),
      from_team: str(d.fromTeam),
      to_team: str(d.toTeam),
      requested_by: requestedBy,
      requested_by_name: requestedBy,
      justification: str(d.reason),
      status,
      created_at: createdAt,
      reviewed_by: null,
      reviewed_by_name: null,
      // Decision shape: (status='pending') = (reviewed_at is null).
      reviewed_at: status === "pending" ? null : toIso(d.reviewedAt) || createdAt,
      review_note: str(d.reviewNote),
    });
  }

  await pgUpsert("transfer_requests", "transfer_requests", rows, "id");
}

async function migrateContracts() {
  log("\n[contracts → app.contracts]");
  if (!v1Tasks.length) v1Tasks = await readAll("tasks");

  const statusOf = (raw: unknown): "draft" | "pending_signature" | "signed" | "cancelled" => {
    const s = str(raw).toLowerCase();
    if (s === "signed" || s === "active" || s === "completed") return "signed";
    if (s === "cancelled" || s === "canceled" || s === "rejected") return "cancelled";
    if (s === "pending_signature" || s === "pending") return "pending_signature";
    return "draft";
  };

  const rows: Doc[] = [];
  const seenReference = new Set<string>();
  for (const d of await readAll("contracts")) {
    const status = statusOf(d.status);
    const merchantId = str(d.merchantId) || merchantIdByTaskId.get(str(d.taskId)) || "";
    if (!merchantId) {
      warn(`contracts/${d._id}: no merchant — skipped (NOT NULL)`);
      continue;
    }
    const reference = firstStr(d.reference, d.taskId, d._id);
    if (!reference) {
      warn(`contracts/${d._id}: no reference — skipped (unique NOT NULL)`);
      continue;
    }
    if (seenReference.has(reference)) {
      warn(`contracts/${d._id}: duplicate reference "${reference}" — skipped (unique index)`);
      continue;
    }
    seenReference.add(reference);
    const createdAt = toIso(d.createdAt) || new Date().toISOString();
    rows.push({
      _key: reference,
      reference,
      merchant_id: merchantId,
      merchant_name: firstStr(d.merchantName, d.taskName, baseName(d.name)),
      city_id: cityId,
      value_minor: toMinor(d.value ?? d.amount),
      currency: "EGP",
      status,
      signatory: str(d.signatory),
      body: str(d.body ?? d.content),
      drafted_by: resolveUserId(d.draftedBy),
      edited_by: resolveUserId(d.editedBy),
      signed_by: resolveUserId(d.signedBy),
      cancelled_by: resolveUserId(d.cancelledBy),
      // Shape: (status='signed') = (signed_at is not null), same for cancelled.
      signed_at: status === "signed" ? toIso(d.signedAt || d.signed_at) || createdAt : null,
      cancelled_at: status === "cancelled" ? toIso(d.cancelledAt || d.cancelled_at) || createdAt : null,
      created_at: createdAt,
      updated_at: toIso(d.updatedAt) || createdAt,
    });
  }

  const existing = new Set<string>();
  for (const r of await selectColumns("contracts", "reference")) existing.add(str(r.reference));
  await pgInsertMissing("contracts", "contracts", rows, (r) => str(r.reference), existing);
}

async function migratePayoutMethods() {
  log("\n[financial_profiles → app.user_payout_methods]");
  if (!v1FinancialProfiles.length) v1FinancialProfiles = await readAll("financial_profiles");

  const rows: Doc[] = [];
  const seenUser = new Set<string>();
  for (const fp of v1FinancialProfiles) {
    const userId = resolveUserId(fp._id);
    if (!userId) {
      warn(`financial_profiles/${fp._id}: unresolved operator — skipped`);
      continue;
    }
    if (seenUser.has(userId)) {
      warn(`financial_profiles/${fp._id}: second payout method for the same operator — skipped (one per user)`);
      continue;
    }

    const method = str(fp.method);

    const details = (fp.details || {}) as Doc;
    const kind =
      method === "bank"
        ? "bank_account"
        : method === "instapay"
          ? "instapay"
          : method === "post"
            ? "egypt_post"
            : "e_wallet";
    const row: Doc = {
      user_id: userId,
      method: kind,
      bank_name: null,
      account_holder: null,
      account_number: null,
      iban: null,
      wallet_provider: null,
      wallet_phone: null,
      instapay_type: null,
      instapay_value: null,
      post_national_id: null,
      // Migrated destinations start pending and require review (schema note 9).
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
    };

    if (kind === "bank_account") {
      row.bank_name = str(details.bankName) || null;
      row.account_holder = str(details.holderName) || null;
      row.account_number = str(details.accountNumber) || null;
      row.iban = str(details.iban).toUpperCase() || null;
      if (!row.bank_name || !row.account_number || !row.iban) {
        warn(`financial_profiles/${fp._id}: incomplete bank details — skipped`);
        continue;
      }
    } else if (kind === "e_wallet") {
      row.wallet_provider = str(details.provider) || null;
      row.wallet_phone = normalizePhone(details.phone) || null;
      if (!row.wallet_provider || !row.wallet_phone) {
        warn(`financial_profiles/${fp._id}: incomplete wallet details — skipped`);
        continue;
      }
    } else if (kind === "instapay") {
      row.instapay_type = str(details.instapayType) === "phone" ? "phone" : "ipa";
      row.instapay_value = str(details.value) || null;
      if (!row.instapay_value) {
        warn(`financial_profiles/${fp._id}: incomplete instapay details — skipped`);
        continue;
      }
    } else {
      // Directive 6: Egypt Post carries the 14-digit national id.
      const nationalId = str(details.nationalId).replace(/\D/g, "");
      if (!/^[0-9]{14}$/.test(nationalId)) {
        warn(`financial_profiles/${fp._id}: Egypt Post national id "${str(details.nationalId)}" is not 14 digits — skipped`);
        continue;
      }
      row.post_national_id = nationalId;
    }

    seenUser.add(userId);
    rows.push(row);
  }

  await pgUpsert("user_payout_methods", "user_payout_methods", rows, "user_id");
}

/* Mirrors public/js/config/constants.js KANJO_REP_PAYROLL. */
const KANJO_REP_PAYROLL: Array<{ name: string; team: string; base: number }> = [
  { name: "سارة", team: "Fox Team", base: 5000 },
  { name: "مصطفى", team: "Fox Team", base: 5000 },
  { name: "أحمد جمعه", team: "Power Team", base: 5000 },
  { name: "يوسف", team: "Power Team", base: 3000 },
];

async function migratePayrollProfiles() {
  log("\n[KANJO_REP_PAYROLL → app.payroll_profiles]");
  const configs = await readAll("settings");
  const payrollConfig = configs.find((c) => c._id === "payrollConfig");
  if (payrollConfig) {
    log(`  settings/payrollConfig.desoukBase=${num(payrollConfig.desoukBase)} (roster bases are authoritative)`);
  }

  const rows: Doc[] = [];
  for (const rep of KANJO_REP_PAYROLL) {
    const userId = resolveUserId(rep.name);
    if (!userId) {
      warn(`payroll "${rep.name}": unresolved operator — skipped`);
      continue;
    }
    rows.push({
      user_id: userId,
      base_salary_minor: toMinor(rep.base),
      transport_minor: 0,
      data_entry_rate_minor: 0,
      data_entry_count: 0,
      incentive_multiplier: 1,
      currency: "EGP",
      active: true,
    });
  }

  await pgUpsert("payroll_profiles", "payroll_profiles", rows, "user_id");
}

/**
 * V1 `rep_kpis/{repId}/daily_stats/{date}` time tracking for one rep/month.
 *
 * DOCTYPE uses the same `kpiRepId` slug the V1 app generated (name → filename
 * slug). The month is scanned day by day only for the month being imported. Any
 * failure degrades to `null` rather than failing the whole snapshot: time
 * tracking is provenance, not a financial amount.
 */
async function readRepTimeTracking(
  repName: string,
  monthYear: string,
): Promise<Doc | null> {
  const repId = str(repName)
    .replace(/[\/\s]+/g, "_")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9_.-]/g, "");
  if (!repId) return null;
  try {
    const snap = await db
      .collection("rep_kpis")
      .doc(repId)
      .collection("daily_stats")
      .where("date", ">=", `${monthYear.slice(0, 7)}-01`)
      .where("date", "<=", `${monthYear.slice(0, 7)}-31`)
      .get();
    let activeSeconds = 0;
    let imageEditSeconds = 0;
    let days = 0;
    snap.forEach((doc: any) => {
      const data = doc.data() as Doc;
      activeSeconds += Math.max(0, num(data.activeSeconds));
      imageEditSeconds += Math.max(0, num(data.imageEditSeconds));
      days += 1;
    });
    if (!days) return null;
    return { repId, days, activeSeconds, imageEditSeconds };
  } catch (err) {
    warn(`rep_kpis/${repId}: time tracking unreadable (${(err as Error).message}) — legacy_metrics keeps the rest`);
    return null;
  }
}

async function migrateKpiSnapshots() {
  log("\n[payroll_snapshots → app.kpi_snapshots]");
  const rows: Doc[] = [];

  for (const header of await readAll("payroll_snapshots")) {
    const monthYear = toMonthStart(header.month || header._id);
    if (!monthYear) {
      warn(`payroll_snapshots/${header._id}: unreadable month — skipped`);
      continue;
    }
    const repSnap = await db.collection("payroll_snapshots").doc(header._id).collection("reps").get();
    for (const doc of repSnap.docs) {
      const rep = doc.data() as Doc;
      const repName = firstStr(rep.repName, rep.name);
      const userId = resolveUserId(repName);
      if (!userId) {
        warn(`payroll_snapshots/${header._id}/reps/${doc.id}: unresolved rep "${repName}" — skipped (FK)`);
        continue;
      }
      const metrics = (rep.metrics || {}) as Doc;
      // Directive 2: every V1 snapshot metric that has no V2 column is kept in
      // `legacy_metrics` verbatim (products, vendors, photos, plus any future
      // key), along with the baseline and the rep_kpis time-tracking totals.
      const legacyMetrics: Doc = {
        products: num(metrics.products),
        vendors: num(metrics.vendors),
        photos: num(metrics.photos),
        metrics,
        baseline: rep.baseline ?? null,
      };
      const timeTracking = await readRepTimeTracking(repName, monthYear);
      if (timeTracking) legacyMetrics.timeTracking = timeTracking;

      // NOTE: the locked salary is recomputed by V2; V1 money is never copied
      // into the frozen financial columns.
      rows.push({
        _key: `${userId}\u0000${monthYear}`,
        rep_id: userId,
        month_year: monthYear,
        new_merchants_activated: Math.max(0, Math.round(num(metrics.vendors))),
        items_added: Math.max(0, Math.round(num(metrics.products))),
        contracts_closed: 0,
        avg_achievement_ratio: 0,
        calculated_salary: 0,
        applied_merchant_rate: 0,
        applied_item_rate: 0,
        applied_contract_fee: null,
        legacy_metrics: legacyMetrics,
        status: "pending",
        locked_at: toIso(header.lockedAt) || new Date().toISOString(),
      });
    }
  }

  // kpi_snapshots has an immutability trigger after INSERT → insert-missing only.
  const existing = new Set<string>();
  for (const r of await selectColumns("kpi_snapshots", "rep_id,month_year")) {
    existing.add(`${str(r.rep_id)}\u0000${str(r.month_year)}`);
  }
  await pgInsertMissing("kpi_snapshots", "kpi_snapshots", rows, (r) => str(r._key), existing);
}

async function migrateMerchantLeads() {
  log("\n[merchant_leads → app.merchant_applications]");
  const rows: Doc[] = [];
  const seen = new Set<string>();

  for (const d of await readAll("merchant_leads")) {
    const phoneDigits = str(d.phone).replace(/\D/g, "");
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      warn(`merchant_leads/${d._id}: phone "${str(d.phone)}" not dialable — skipped`);
      continue;
    }
    const storeName = firstStr(d.storeName, d.store_name);
    const contact = firstStr(d.ownerName, d.contactPerson, d.contact_person);
    if (storeName.length < 2 || contact.length < 2) {
      warn(`merchant_leads/${d._id}: missing store/contact — skipped`);
      continue;
    }
    const key = `${storeName}\u0000${phoneDigits}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      _key: key,
      store_name: storeName.slice(0, 160),
      contact_person: contact.slice(0, 120),
      phone_number: phoneDigits,
      business_type: (str(d.category) || str(d.business_type) || "غير محدد").slice(0, 120),
      status: "pending",
      created_at: toIso(d.createdAt) || new Date().toISOString(),
    });
  }

  const existing = new Set<string>();
  for (const r of await selectColumns("merchant_applications", "store_name,phone_number")) {
    existing.add(`${str(r.store_name)}\u0000${str(r.phone_number)}`);
  }
  await pgInsertMissing("merchant_applications", "merchant_applications", rows, (r) => str(r._key), existing);
}

/* ── Directive 3: Black Box, inbox, moderation bin ────────────────────── */

async function migrateAuditLogs() {
  log("\n[audit_logs → app.audit_logs]");
  const rows: Doc[] = [];
  const seen = new Set<string>();

  for (const d of await readAll("audit_logs")) {
    if (seen.has(d._id)) continue;
    seen.add(d._id);
    rows.push({
      legacy_id: d._id,
      occurred_at: toIso(d.timestamp) || toIso(d.ts) || new Date().toISOString(),
      actor_id: resolveUserId(d.userName),
      actor_name: str(d.userName),
      actor_role: str(d.userRole),
      action_type: firstStr(d.actionType, "update"),
      target_entity: str(d.targetEntity),
      target_id: str(d.targetId),
      target_name: str(d.targetName),
      entity_kind: str(d.entityKind),
      description: str(d.description),
      collection: str(d.collection),
      source: firstStr(d.source, "live"),
      previous_data: d.previousData ?? null,
      new_data: d.newData ?? null,
      changes: Array.isArray(d.changes) ? d.changes : (d.changes ?? null),
    });
  }

  const existing = new Set<string>();
  for (const r of await selectColumns("audit_logs", "legacy_id")) {
    if (r.legacy_id) existing.add(str(r.legacy_id));
  }
  await pgInsertMissing("audit_logs", "audit_logs", rows, (r) => str(r.legacy_id), existing);
}

async function migrateNotifications() {
  log("\n[notifications → app.notifications + app.notification_reads]");
  const rows: Doc[] = [];
  const seen = new Set<string>();

  for (const d of await readAll("notifications")) {
    if (seen.has(d._id)) continue;
    seen.add(d._id);
    rows.push({
      _key: d._id,
      legacy_id: d._id,
      // V1 notifications were written once for the whole company: a broadcast.
      user_id: null,
      title: firstStr(d.title, "إشعار"),
      body: str(d.body),
      icon: str(d.icon),
      color: str(d.color),
      kind: firstStr(d.kind, d.type, "system"),
      task_id: str(d.taskId) || null,
      link: str(d.link),
      is_read: false,
      read_at: null,
      occurred_at: toIso(d.timestamp) || toIso(d.date) || new Date().toISOString(),
    });
  }

  const existing = new Set<string>();
  for (const r of await selectColumns("notifications", "legacy_id")) {
    if (r.legacy_id) existing.add(str(r.legacy_id));
  }
  await pgInsertMissing("notifications", "notifications", rows, (r) => str(r._key), existing);

  // A V1 row already marked read by whoever loaded the inbox carries no viewer:
  // every operator inherits that read state through `notification_reads`.
  if (!dryRun) {
    const readLegacyIds = new Set<string>();
    for (const d of await readAll("notifications")) {
      if (d.isRead === true || str(d.isRead) === "true") readLegacyIds.add(d._id);
    }
    if (readLegacyIds.size) {
      const ids = [...readLegacyIds];
      const { data: noticeRows, error: noticeError } = await table("notifications")
        .select("id,legacy_id")
        .in("legacy_id", ids);
      if (noticeError) throw new Error(`select migrated notifications failed: ${noticeError.message}`);
      const activeUsers = await selectColumns("users", "id");
      const acks: Doc[] = [];
      for (const notice of (noticeRows ?? []) as Array<{ id: string; legacy_id: string }>) {
        for (const user of activeUsers) {
          acks.push({ notification_id: notice.id, user_id: str(user.id) });
        }
      }
      for (const part of chunk(acks, 500)) {
        const { error } = await table("notification_reads").upsert(part, {
          onConflict: "notification_id,user_id",
        });
        if (error) throw new Error(`upsert notification_reads failed: ${error.message}`);
      }
      count("notification_reads", acks.length);
    }
  }
}

async function migrateArchivedReports() {
  log("\n[archivedReports → app.archived_reports]");
  if (!merchantIdByTaskId.size && !v1Tasks.length) v1Tasks = await readAll("tasks");
  const taskMerchant = new Map<string, string>();
  for (const task of v1Tasks) {
    const merchantId = str(task.merchantId) || merchantIdByBase.get(baseName(task.name)) || "";
    if (merchantId) taskMerchant.set(task._id, merchantId);
  }

  const rows: Doc[] = [];
  const seen = new Set<string>();
  for (const d of await readAll("archivedReports")) {
    if (seen.has(d._id)) continue;
    seen.add(d._id);
    const taskId = str(d.taskId);
    rows.push({
      _key: d._id,
      legacy_id: d._id,
      task_id: taskId || null,
      merchant_id: taskMerchant.get(taskId) || str(d.merchantId) || "",
      task_name: str(d.taskName),
      report: (d.report && typeof d.report === "object" ? d.report : {}) as Doc,
      archived_by: resolveUserId(d.archivedBy),
      archived_by_name: str(d.archivedBy),
      reason: str(d.reason),
      occurred_at: toIso(d.timestamp) || new Date().toISOString(),
    });
  }

  const existing = new Set<string>();
  for (const r of await selectColumns("archived_reports", "legacy_id")) {
    if (r.legacy_id) existing.add(str(r.legacy_id));
  }
  await pgInsertMissing("archived_reports", "archived_reports", rows, (r) => str(r._key), existing);
}

async function migrateCampaignLeads() {
  log("\n[campaign_leads → app.marketing_leads]");
  const rows: Doc[] = [];
  const seen = new Set<string>();

  for (const d of await readAll("campaign_leads")) {
    if (seen.has(d._id)) continue;
    seen.add(d._id);
    const phone = str(firstStr(d.phone_number, d.phone, d.mobile)).replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) {
      warn(`campaign_leads/${d._id}: phone "${str(d.phone_number || d.phone)}" not dialable — skipped`);
      continue;
    }
    rows.push({
      _key: d._id,
      legacy_id: d._id,
      city_id: cityId,
      phone_number: phone,
      promo_code: str(firstStr(d.promo_code, d.coupon, d.promoCode)),
      user_guess: str(firstStr(d.user_guess, d.guess, d.userGuess)),
      prize_details: str(firstStr(d.prize_details, d.prize, d.prizeDetails)),
      source: "spinwheel",
      status: "new",
      notes: "",
      occurred_at:
        toIso(d.created_at ?? d.createdAt ?? d.timestamp) || new Date().toISOString(),
    });
  }

  const existing = new Set<string>();
  for (const r of await selectColumns("marketing_leads", "legacy_id")) {
    if (r.legacy_id) existing.add(str(r.legacy_id));
  }
  await pgInsertMissing("marketing_leads", "marketing_leads", rows, (r) => str(r._key), existing);
}

/* ─────────────────────────────── runner ─────────────────────────────── */

type Step = { name: string; run: () => Promise<void> };

const STEPS: Step[] = [
  { name: "cities", run: migrateCities },
  { name: "taxonomy", run: migrateTaxonomy },
  { name: "teams", run: migrateTeams },
  { name: "users", run: migrateUsers },
  { name: "user_permissions", run: migrateUserPermissions },
  { name: "merchants", run: migrateMerchants },
  { name: "catalog", run: migrateCatalog },
  { name: "tasks", run: migrateTasks },
  { name: "visits", run: migrateVisits },
  { name: "transfers", run: migrateTransferRequests },
  { name: "contracts", run: migrateContracts },
  { name: "payout_methods", run: migratePayoutMethods },
  { name: "payroll", run: migratePayrollProfiles },
  { name: "kpi", run: migrateKpiSnapshots },
  { name: "merchant_leads", run: migrateMerchantLeads },
  { name: "audit_logs", run: migrateAuditLogs },
  { name: "notifications", run: migrateNotifications },
  { name: "archived_reports", run: migrateArchivedReports },
  { name: "campaign_leads", run: migrateCampaignLeads },
];

async function main() {
  log(`V1 → V2 migration  (project=${PROJECT_ID}${dryRun ? ", DRY RUN" : ""})`);

  const started = Date.now();
  for (const step of STEPS) {
    if (only.size && !only.has(step.name)) continue;
    await step.run();
  }

  log(`\nTarget city: ${cityId}`);
  log("\n────────── summary ──────────");
  for (const [key, value] of Object.entries(summary)) log(`${key.padEnd(20)} ${value}`);
  log(`elapsed ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (dryRun) log("\nDry run: no rows were written.");
}

main().catch((err) => {
  console.error("\nMIGRATION FAILED:", err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
