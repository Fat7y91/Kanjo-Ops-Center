import "server-only";

import { z } from "zod";

import type { TaxonomyCategory } from "@/lib/taxonomy/types";

import { fetchDeepSeekContent } from "./deepseek-client";
import {
  parseDeepSeekEnrichment,
  type DeepSeekEnrichmentResult,
} from "./deepseek-parse";
import type { ReferenceProduct } from "./pharmacy-match";

/**
 * Stage 2 of the pharmacy matcher: a bilingual pharmacist confirms the stage-1
 * candidates and classifies every item into the controlled pharmacy taxonomy.
 * The deterministic strength/form/pack guardrail always runs again on the
 * chosen id, so the model cannot overrule a real conflict.
 */

export type PharmacyDeepSeekItem = {
  id: string;
  name: string;
  company: string;
  unit: string;
  barcode: string;
  candidates: ReferenceProduct[];
};

const SYSTEM_PROMPT = `أنت صيدلي مصري خبير في مطابقة أصناف نقاط البيع بالكتالوج المرجعي للصيدلية، وتفهم العربية والإنجليزية.
مهمتك التحقق من المرشحين واختيار تطابق حقيقي فقط.
قواعد المطابقة:
- العلامة التجارية والاسم العام (generic) قد يُكتبان بالعربية أو الإنجليزية أو بترجمة صوتية؛ اعتبرهما نفس المنتج عند التطابق الحقيقي (مثل أوجمنتين / Augmentin، باراسيتامول / Paracetamol).
- يجب أن تتطابق الجرعة (strength) والشكل الدوائي (form) وحجم العلبة (pack). أمثلة: 1 جم ≠ 625 مجم، شراب ≠ لبوس، 20 قرص ≠ 30 قرص.
- لا تعتبر التشابه في الاسم وحده كافياً إذا اختلفت الجرعة أو الشكل أو العبوة.
- إن لم يوجد تطابق حقيقي أعد master_catalog_id = null.
- لا تغيّر اسم الصنف أو الكود أو الكمية أو السعر؛ أنت لا تعيد كتابة بيانات التاجر.
- اختر category_key واحدة من التصنيفات المسموحة لكل صنف، حتى بدون مطابقة، حسب الاستخدام العلاجي أو الرف.
- عند عدم وجود مطابقة اكتب search_query نظيفة: الاسم العلمي أو التجاري + الجرعة فقط.
- أعد JSON فقط بالمخطط المطلوب دون شرح.`;

function userPrompt(
  categories: TaxonomyCategory[],
  items: PharmacyDeepSeekItem[],
): string {
  return JSON.stringify({
    categories: categories.map((category) => ({
      key: category.key,
      name_ar: category.name_ar,
      name_en: category.name_en,
    })),
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      company: item.company,
      unit: item.unit,
      barcode: item.barcode,
      candidates: item.candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        category: candidate.categoryKey,
      })),
    })),
    output_schema: {
      items: [
        {
          id: "same id",
          master_catalog_id: "candidate id or null",
          category_key: "allowed category key",
          search_query: "clean query when candidate is null",
        },
      ],
    },
  });
}

export async function callDeepSeekPharmacyMatch(
  items: PharmacyDeepSeekItem[],
  categories: TaxonomyCategory[],
): Promise<Map<string, DeepSeekEnrichmentResult> | null> {
  if (items.length === 0) return null;

  const content = await fetchDeepSeekContent(
    SYSTEM_PROMPT,
    userPrompt(categories, items),
  );
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

const QUERY_SYSTEM_PROMPT = `أنت صيدلي مصري تعيد كتابة أسماء أصناف نقاط البيع العربية كاستعلام إنجليزي نظيف للبحث في كتالوج صيدلية مرجعي.
- اكتب العلامة التجارية أو الاسم العام بالإنجليزية (مثال: أوجمنتين → Augmentin، باراسيتامول → Paracetamol).
- أبقِ الجرعة والشكل الدوائي وعدد العبوات كما هي (10mg، 30tabs، syrup، supp).
- أزل رموز نقاط البيع والكلمات الزائدة مثل "صنف" و"عبوة" و"شريط".
- لا تخمّن اسم منتج غير مذكور.
- أعد JSON فقط: {"items":[{"id":"same id","query":"english query"}]}.`;

const queryItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      query: z.union([z.string(), z.null()]).optional(),
    }),
  ),
});

export type PharmacyQueryInput = {
  id: string;
  name: string;
  company: string;
  unit: string;
};

/** Translates Arabic POS names into English reference-search queries. */
export async function translatePharmacyQueries(
  items: PharmacyQueryInput[],
): Promise<Map<string, string> | null> {
  if (items.length === 0) return null;

  const content = await fetchDeepSeekContent(
    QUERY_SYSTEM_PROMPT,
    JSON.stringify({
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        company: item.company,
        unit: item.unit,
      })),
    }),
  );
  if (!content) return null;

  const allowed = new Set(items.map((item) => item.id));
  const result = new Map<string, string>();
  let parsed: unknown;
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }

  const payload = queryItemsSchema.safeParse(parsed);
  if (!payload.success) return null;

  for (const item of payload.data.items) {
    const id = String(item.id).trim();
    if (!allowed.has(id)) continue;
    const query = typeof item.query === "string" ? item.query.trim().slice(0, 200) : "";
    if (query) result.set(id, query);
  }
  return result;
}
