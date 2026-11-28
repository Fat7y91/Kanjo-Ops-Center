begin;

/* ─────────────────────────────────────────────────────────────────────────
 * Contract PDF & legal copy polish.
 *
 *   1. Standardise the brand spelling to `كانچو` (3-dot cheh, U+0686) in every
 *      stored clause and section override. The official legal entity name
 *      `شركة كاند جوو ...` contains no `كانجو` substring and is left intact.
 *   2. Backfill the softened inventory/stock wording on CTR-2026-E11074 so the
 *      executed document matches the canonical template. Matching on the old
 *      phrase makes the update idempotent and a no-op for contracts that were
 *      already issued with the collaborative copy.
 * ───────────────────────────────────────────────────────────────────────── */

update app.contract_clauses
   set title_ar = replace(title_ar, 'كانجو', 'كانچو'),
       body_ar  = replace(body_ar,  'كانجو', 'كانچو')
 where title_ar like '%كانجو%'
    or body_ar  like '%كانجو%';

update app.contract_commission_lines
   set category_name = replace(category_name, 'كانجو', 'كانچو')
 where category_name like '%كانجو%';

update app.contract_section_overrides
   set content = replace(content::text, 'كانجو', 'كانچو')::jsonb
 where content::text like '%كانجو%';

/* Clause 4 — collaborative stock/availability wording. */
update app.contract_clauses cc
   set body_ar = replace(
         body_ar,
         '• تحديث الأسعار والمخزون والبيانات باستمرار،<br>• عدم قبول طلب يتعذر تنفيذه،<br>',
         '• الحرص قدر الإمكان على تحديث الأسعار وتوافر الأصناف بانتظام، وإخطار المنصة أو إيقاف الصنف مؤقتاً عند نفادِه تفادياً لرفض طلبات العملاء،<br>'
       )
  from app.contracts c
 where c.id = cc.contract_id
   and c.reference = 'CTR-2026-E11074'
   and cc.body_ar like '%تحديث الأسعار والمخزون والبيانات باستمرار%';

/* Clause 7 — accurate product data without absolute stock-count liability. */
update app.contract_clauses cc
   set body_ar = replace(
         replace(
           body_ar,
           '• الاسم، السعر، الوصف، الصور، الكمية أو الحجم أو الوزن،<br>',
           '• الاسم، السعر، الوصف، الصور، الحجم أو الوزن،<br>'
         ),
         'ويتحمل الطرف الثاني وحده مسؤولية أي خطأ أو نقص أو تضليل في بيانات المنتج أو صوره أو مكوناته أو سعره أو محاذيره.',
         'ويتحمل الطرف الثاني وحده مسؤولية دقة الاسم والسعر والوصف والمكونات ومسببات الحساسية، دون مسؤولية تعاقدية مطلقة عن فروق كميات المخزون اللحظية.'
       )
  from app.contracts c
 where c.id = cc.contract_id
   and c.reference = 'CTR-2026-E11074'
   and cc.body_ar like '%بيانات كل منتج بدقة%';

/* Clause 10 — reasonable-effort availability, immediate coordination. */
update app.contract_clauses cc
   set body_ar = replace(
         body_ar,
         'يلتزم الطرف الثاني بتحديث المخزون فورًا، وعدم قبول طلب لمنتج غير متاح،',
         'يحرص الطرف الثاني على متابعة توافر الأصناف وتحديث حالتها على المنصة قدر الإمكان، وفي حال عدم توفر صنف بعد ورود الطلب يتم التنسيق الفوري مع فريق تشغيل كانچو لإبلاغ العميل بالبديل المتاح أو تعديل الطلب،'
       )
  from app.contracts c
 where c.id = cc.contract_id
   and c.reference = 'CTR-2026-E11074'
   and cc.body_ar like '%بتحديث المخزون فورًا%';

/* Clause 13 — stock depletion is no longer a punitive violation trigger. */
update app.contract_clauses cc
   set body_ar = replace(body_ar, 'معدل الإلغاء، نفاد المخزون، جودة التغليف', 'معدل الإلغاء، جودة التغليف')
  from app.contracts c
 where c.id = cc.contract_id
   and c.reference = 'CTR-2026-E11074'
   and cc.body_ar like '%نفاد المخزون%';

commit;
