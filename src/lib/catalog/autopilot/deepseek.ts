import "server-only";

import type { MasterCatalogItem } from "@/lib/catalog/master-catalog-search";
import type { TaxonomyCategory } from "@/lib/taxonomy/types";

import { fetchDeepSeekContent } from "./deepseek-client";
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

const SYSTEM_PROMPT = `أنت خبير مصري في مطابقة أصناف السوبر ماركت، تفهم أسماء نقاط البيع كما يكتبها الكاشير وتقارنها بكتالوج مرجعي.
اقرأ اسم الصنف والوحدة والباركود، وافهم الاختصارات مثل جم/ج/جرام، كجم/ك/كيلو، مل/ملي، لتر/ل، ك*12، الشرطة المائلة، والنجمة.
لديك حتى 15 مرشحاً من الكتالوج لكل صنف. قيّمها بفهم بشري كأنك تعمل في فرع مصري:
- اعتبر الاسم العربي والإنجليزي للعلامة التجارية نفس العلامة (مثل المراعي / Almarai، جهينة / Juhayna).
- اعتبر المرادفات العامية وأخطاء الإملاء واختلاف ترتيب الكلمات ونقص حروف الجر أو "ال" اختلافات شكلية لا تغيّر المنتج.
- اعتبر اختلاف صيغة الوحدة (500 جم = 0.5 كجم) مطابقة إذا كان الوزن/الحجم الصافي نفسه.
- اقبل المرشح فقط إذا اتفقت العلامة التجارية والنوع/النكهة والوزن أو الحجم أو عدد القطع اتفاقاً حقيقياً.
- ارفض بوضوح المقاسات أو النكهات أو عدد القطع المختلفة، والمنتج المشابه من علامة أخرى.
قواعد الإخراج:
1) إن وجدت مطابقة حقيقية فاختر master_catalog_id الخاص بها فقط.
2) إن لم يوجد أي مرشح مطابق فعلياً أعد master_catalog_id = null.
3) لا تغيّر اسم المنتج أو الباركود أو السعر؛ أنت لا تعيد كتابة بيانات التاجر.
4) اختر category_key واحدة فقط من التصنيفات المسموحة، الأقرب للرف الصحيح حتى بدون مطابقة.
5) عند عدم وجود مطابقة اكتب search_query نظيفة: العلامة + المنتج + الوزن/الحجم فقط، بدون رموز نقاط البيع.
6) أعد JSON فقط بالمخطط المطلوب دون شرح.`;

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
 * Tier 2 comprehension. Returns null when the key is absent, the upstream call
 * fails or the payload cannot be parsed, so the importer can still finish with
 * local categories and Tier 3 images instead of losing the batch.
 */
export async function callDeepSeekEnrichment(
  items: DeepSeekRequestItem[],
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
