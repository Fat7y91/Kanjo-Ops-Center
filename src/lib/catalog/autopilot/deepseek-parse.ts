import { z } from "zod";

export type DeepSeekEnrichmentResult = {
  id: string;
  masterCatalogId: string | null;
  categoryKey: string | null;
  searchQuery: string | null;
};

const itemSchema = z.object({
  id: z.union([z.string(), z.number()]),
  master_catalog_id: z.union([z.string(), z.null()]).optional(),
  category_key: z.union([z.string(), z.null()]).optional(),
  search_query: z.union([z.string(), z.null()]).optional(),
});

const payloadSchema = z.object({
  items: z.array(itemSchema),
});

function candidateJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  return start !== -1 && end > start ? content.slice(start, end + 1) : content;
}

/**
 * Validates the model output against the rows and candidates we actually sent.
 * Hallucinated item ids, master ids and category keys are discarded instead of
 * being trusted into the catalog.
 */
export function parseDeepSeekEnrichment(
  content: string,
  allowedItemIds: ReadonlySet<string>,
  allowedMasterIds: ReadonlySet<string>,
  allowedCategoryKeys: ReadonlySet<string>,
): Map<string, DeepSeekEnrichmentResult> {
  const result = new Map<string, DeepSeekEnrichmentResult>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidateJson(content));
  } catch {
    return result;
  }

  const payload = Array.isArray(parsed)
    ? { items: parsed }
    : payloadSchema.safeParse(parsed).success
      ? (parsed as { items: unknown[] })
      : null;
  if (!payload) return result;

  for (const raw of payload.items) {
    const item = itemSchema.safeParse(raw);
    if (!item.success) continue;
    const id = String(item.data.id).trim();
    if (!allowedItemIds.has(id)) continue;

    const masterId =
      typeof item.data.master_catalog_id === "string" &&
      allowedMasterIds.has(item.data.master_catalog_id.trim())
        ? item.data.master_catalog_id.trim()
        : null;
    const categoryKey =
      typeof item.data.category_key === "string" &&
      allowedCategoryKeys.has(item.data.category_key.trim())
        ? item.data.category_key.trim()
        : null;
    const query =
      typeof item.data.search_query === "string"
        ? item.data.search_query.trim().slice(0, 160)
        : "";

    result.set(id, {
      id,
      masterCatalogId: masterId,
      categoryKey,
      searchQuery: query || null,
    });
  }
  return result;
}
