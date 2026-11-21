import "server-only";

import { hasSupabaseConfig } from "@/lib/db/supabase/config";
import { isMissingSchemaObject } from "@/lib/db/supabase/errors";
import { getSupabaseServerClient } from "@/lib/db/supabase/server";
import { VARIANT_SEED } from "@/lib/taxonomy/data.generated";
import { bump, getStore } from "@/lib/taxonomy/store-state";
import type { TaxonomyVariant } from "@/lib/taxonomy/types";

type AttributeRow = {
  id: number;
  name_ar: string;
  name_en: string;
  created_at: string;
  updated_at: string;
};

type OptionRow = {
  id: number;
  variant_id: number;
  name_ar: string;
  name_en: string;
};

const seedAliases = new Map(
  VARIANT_SEED.flatMap((group) =>
    group.options.map((option) => [
      option.option_id,
      option.aliases ?? [],
    ] as const),
  ),
);

/**
 * Hydrates the in-memory taxonomy store from the synced variant tables.
 *
 * The store starts from the generated seed, but the V1 sync writes new groups
 * and options to Postgres. Every surface that lists variants calls this first,
 * so an upload is visible without a redeploy. Database rows are authoritative
 * for a group they define; seed-only groups stay available.
 */
export async function refreshVariantsFromDatabase(): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const client = getSupabaseServerClient();

  const [attributes, options] = await Promise.all([
    client
      .schema("app")
      .from("variant_attributes")
      .select("id,name_ar,name_en,created_at,updated_at")
      .order("id", { ascending: true })
      .limit(2000),
    client
      .schema("app")
      .from("variant_options")
      .select("id,variant_id,name_ar,name_en")
      .order("id", { ascending: true })
      .limit(10000),
  ]);

  if (attributes.error || options.error) {
    if (
      isMissingSchemaObject(attributes.error) ||
      isMissingSchemaObject(options.error)
    ) {
      return;
    }
    throw attributes.error ?? options.error;
  }

  const attributeRows = (attributes.data ?? []) as AttributeRow[];
  const optionRows = (options.data ?? []) as OptionRow[];
  if (attributeRows.length === 0) return;

  const byGroup = new Map<number, OptionRow[]>();
  for (const option of optionRows) {
    const bucket = byGroup.get(option.variant_id) ?? [];
    bucket.push(option);
    byGroup.set(option.variant_id, bucket);
  }

  const store = getStore();
  let changed = false;

  for (const row of attributeRows) {
    const groupOptions = (byGroup.get(row.id) ?? []).map((option) => ({
      option_id: option.id,
      option_name_ar: option.name_ar,
      option_name_en: option.name_en,
      aliases: [...(seedAliases.get(option.id) ?? [])],
    }));
    const next: TaxonomyVariant = {
      variant_id: row.id,
      name_ar: row.name_ar,
      name_en: row.name_en,
      options: groupOptions,
      active: true,
      source: "dashboard",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    const current = store.variants.get(row.id);
    if (!current || !sameVariant(current, next)) {
      store.variants.set(row.id, next);
      changed = true;
    }
  }

  if (changed) bump(store);
}

function sameVariant(left: TaxonomyVariant, right: TaxonomyVariant): boolean {
  if (
    left.name_ar !== right.name_ar ||
    left.name_en !== right.name_en ||
    left.options.length !== right.options.length
  ) {
    return false;
  }
  return left.options.every((option, index) => {
    const other = right.options[index];
    return (
      option.option_id === other.option_id &&
      option.option_name_ar === other.option_name_ar &&
      option.option_name_en === other.option_name_en
    );
  });
}
