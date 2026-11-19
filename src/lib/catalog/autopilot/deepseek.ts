import "server-only";

import type { MasterCatalogItem } from "@/lib/catalog/master-catalog-search";
import type { TaxonomyCategory } from "@/lib/taxonomy/types";

import {
  parseDeepSeekEnrichment,
  type DeepSeekEnrichmentResult,
} from "./deepseek-parse";

export type DeepSeekRequestItem = {
  id: string;
  name: string;
  unit: string;
  barcode: string;
  candidates: MasterCatalogItem[];
};

const SYSTEM_PROMPT = `أنت خبير مطابقة منتجات سوبر ماركت في السوق المصري.
مهمتك قراءة اسم الصنف كما كتبه الكاشير أو نظام نقاط البيع، وفهم الاختصارات مثل جم، ق، ك*12، / و*، ثم مطابقته بكتالوج مرجعي.
قواعد صارمة:
1) لا تعتبر المنتج مطابقاً إلا إذا كانت العلامة التجارية والمنتج والنكهة والوزن أو الحجم أو عدد القطع مطابقة تماماً. عند أي شك أعد master_catalog_id = null.
2) لا تغيّر اسم المنتج أو الباركود أو السعر؛ أنت لا تعيد كتابة بيانات التاجر.
3) لكل عنصر اختر category_key واحدة فقط من التصنيفات المسموحة، وهي الأقرب للرف الصحيح حتى لو لم توجد مطابقة في الكتالوج.
4) إذا كان master_catalog_id = null فاكتب search_query نظيفة بالعربية أو الإنجليزية: العلامة + المنتج + الوزن/الحجم، بدون رموز نقاط البيع أو أكواد.
5) أعد JSON فقط بالمخطط المطلوب، دون شرح أو نص إضافي.`;

function userPrompt(
  categories: TaxonomyCategory[],
  items: DeepSeekRequestItem[],
): string {
  return JSON.stringify(
    {
      categories: categories.map((category) => ({
        key: category.key,
        name_ar: category.name_ar,
        name_en: category.name_en,
      })),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        barcode: item.barcode,
        candidates: item.candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          category: candidate.categoryLabel,
          price: candidate.price,
        })),
      })),
      output_schema: {
        items: [
          {
            id: "same id",
            master_catalog_id: "candidate id or null",
            category_key: "allowed category key",
            search_query: "clean image query when master is null",
          },
        ],
      },
    },
    null,
    0,
  );
}

/**
 * Tier 2 comprehension. Returns null when the key is absent or the upstream
 * call fails, so the importer can still finish with local categories and
 * Tier 3 images instead of losing the batch.
 */
export async function callDeepSeekEnrichment(
  items: DeepSeekRequestItem[],
  categories: TaxonomyCategory[],
): Promise<Map<string, DeepSeekEnrichmentResult> | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key || items.length === 0) return null;

  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
    .replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(categories, items) },
        ],
      }),
      signal: AbortSignal.timeout(35_000),
    });
  } catch (error) {
    console.error("[autopilot] deepseek request failed", error);
    return null;
  }

  if (!response.ok) {
    console.error(`[autopilot] deepseek status ${response.status}`);
    return null;
  }

  let content = "";
  try {
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    content = payload.choices?.[0]?.message?.content ?? "";
  } catch {
    return null;
  }
  if (!content) return null;

  const allowedItems = new Set(items.map((item) => item.id));
  const allowedMaster = new Set(
    items.flatMap((item) => item.candidates.map((candidate) => candidate.id)),
  );
  const allowedCategories = new Set(categories.map((category) => category.key));
  return parseDeepSeekEnrichment(
    content,
    allowedItems,
    allowedMaster,
    allowedCategories,
  );
}
