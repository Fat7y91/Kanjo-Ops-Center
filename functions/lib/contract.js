'use strict';

/* ---------------------------------------------------------------------------
 * Server-side contract document builder.
 *
 * This is a faithful port of the browser generator (public/js/utils/export.js,
 * `window.buildContractHTML`) so the PDF produced by the Cloud Function keeps
 * the exact same visual identity and legal content as the on-screen contract:
 *
 *   - Deep Royal Purple (#4B0082) + Gold (#F59E0B) only. No teal/turquoise.
 *   - Eastern Arabic numerals (٠-٩) for every number, ID and register.
 *   - Static preamble date (blank day/month/year left for handwriting).
 *   - Conditional jurisdiction: merchant KJ-N3K4DG (serial #1014, الحيطاوى / جزارة)
 *     -> محكمة دسوق, everyone else -> the default Kanjo-HQ court.
 *   - Secondary phone field (رقم إضافي). Internal operational notes are
 *     deliberately excluded: they are for ops only, never official documents.
 *
 * The legal copy is hardcoded and non-editable, exactly like the client.
 * ------------------------------------------------------------------------- */

const { getAssets } = require('./assets');

const EASTERN_ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/* Official Egyptian documents use Eastern Arabic numerals (٠-٩) for every date
   and identification number, so contracts must never leak Western digits. */
const toArabicNumerals = (value) => String(value === null || value === undefined ? '' : value)
    .replace(/[0-9]/g, (digit) => EASTERN_ARABIC_DIGITS[Number(digit)]);

/* Identification numbers mix Arabic-Indic digits (bidi class AN) with hyphens;
   a plain `isolate` still lets the bidi algorithm reverse the run
   (٧٨٣-٤١٠-٨٥٩ -> ٨٥٩-٤١٠-٧٨٣). `isolate-override` forces the embedding
   direction so the digits render exactly as typed. */
const ltrNumber = (value) => `<span dir="ltr" style="display: inline-block; direction: ltr; unicode-bidi: isolate-override;">${value}</span>`;

const escapeHtml = (str) => String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* Mirrors the client's window.safeString, with HTML metacharacters escaped
   first so server-rendered text can never break out of the markup. */
const safeString = (str) => {
    if (!str) return '';
    return escapeHtml(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
};

/* Strip RTL / bidi control marks and follow-up suffixes so base-name matching is
   stable regardless of how a name was pasted. */
const getBaseName = (name) => {
    if (!name) return '';
    let clean = String(name).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g, '');
    while (clean.includes('(متابعة)') || clean.includes('(متابعه)')) {
        clean = clean.replace(/\s*\(متابعة\)\s*/g, '').replace(/\s*\(متابعه\)\s*/g, '').trim();
    }
    return clean.trim();
};

/* Legal dictionary that normalises colloquial field wording into formal terms. */
const sanitizeLegalText = (text) => {
    if (text === null || text === undefined) return '';
    const legalDictionary = {
        'المالكالمكان': 'المالك',
        'المالك المكان': 'المالك',
        'اونر المكان': 'المالك',
        'صاحب المكان': 'المالك',
        'صاحب المحل': 'المالك',
        'اونر': 'المالك',
        'مانيجر': 'المدير المسئول',
        'مدير المكان': 'المدير المسئول',
        'مسئول المكان': 'المدير المسئول',
        'ديل': 'اتفاق مبرم',
        'دان': 'تمت الموافقة',
        'كنسلة': 'إلغاء التعاقد',
        'عربون': 'دفعة مقدمة',
        'كاش': 'نقداً',
        'لوكيشن': 'الموقع الجغرافي',
        'فرع رئيسي': 'المقر الرئيسي',
        'نسبة المنصة': 'رسوم الخدمة',
        'ف الميه': '%',
        'بالمية': '%'
    };
    let cleaned = String(text).trim();
    const ARABIC_WORD_CHARS = 'A-Za-z0-9_\\u0600-\\u06FF';
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const key in legalDictionary) {
        const escaped = escapeRegex(key);
        let pattern;
        if (/\s/.test(key)) {
            pattern = escaped;
        } else if (key.startsWith('ال')) {
            pattern = `(?<![${ARABIC_WORD_CHARS}])${escaped}(?![${ARABIC_WORD_CHARS}])`;
        } else {
            pattern = `(?<![${ARABIC_WORD_CHARS}])(?:ال)?${escaped}(?![${ARABIC_WORD_CHARS}])`;
        }
        cleaned = cleaned.replace(new RegExp(pattern, 'gi'), legalDictionary[key]);
    }
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
    return cleaned;
};

/* Official registration data of the First Party (كانچو). */
const KANJO_FIRST_PARTY = {
    tradeName: 'شركة كاند جوو لخدمات التوصيل والتجاره الالكترونيه (شركة ذات مسئولية محدودة)',
    commercialRegister: '٣٠٨٢٣٤',
    commercialRegisterOffice: 'استثمار القاهرة',
    taxCard: '٧٨٣-٤١٠-٨٥٩',
    taxOffice: 'مأمورية ضرائب الشركات المساهمة بالقاهرة',
    address: 'شارع درب الجرن من شارع المديرية، قسم أول طنطا، محافظة الغربية'
};

const CONTRACT_PLACEHOLDER_CATS = ['متابعة', 'متابعه'];

const CONTRACT_BUSINESS_TYPES = {
    'مطاعم': 'مطعم',
    'كافيهات': 'مطعم',
    'سوبر ماركت': 'سوبر ماركت',
    'صيدليات': 'صيدلية',
    'عناية شخصية': 'متجر عناية شخصية',
    'كوزماتكس': 'متجر كوزماتكس',
    'أسماك': 'محل أسماك',
    'جزارة': 'محل جزارة',
    'خضار': 'متجر خضار وفاكهة',
    'دواجن': 'متجر دواجن',
    'عصائر': 'محل',
    'مخبوزات': 'مخبز',
    'مسليات': 'متجر مسليات',
    'حلويات': 'متجر حلويات',
    'عطارة': 'متجر عطارة',
    'لبنة': 'متجر منتجات ألبان',
    'أدوات كهربائية': 'متجر أدوات كهربائية',
    'أدوات نظافة': 'متجر أدوات نظافة',
    'إكسسوارات': 'متجر إكسسوارات',
    'بيع جملة': 'مركز بيع جملة',
    'سباكة': 'متجر سباكة',
    'صيانة': 'مقدم خدمات صيانة',
    'فني كهرباء': 'مقدم خدمات كهرباء',
    'كنترول': 'متجر كنترول وألعاب',
    'لعب أطفال': 'متجر لعب أطفال',
    'مستلزمات المطبخ': 'متجر مستلزمات مطبخ',
    'مستلزمات الحيوانات': 'متجر مستلزمات حيوانات',
    'مفروشات': 'متجر مفروشات',
    'مكتبات': 'مكتبة',
    'ملابس وأدوات رياضية': 'متجر ملابس وأدوات رياضية',
    'منظفات': 'متجر منظفات',
    'هدايا': 'متجر هدايا',
    'ورود': 'متجر ورود',
    'أطقم صيني': 'متجر أطقم صيني'
};

const ARABIC_CLAUSE_NUMBERS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون'];

const FOOD_PREP_KEYWORDS = ['مطاعم', 'كافيه', 'عصائر', 'مخبوزات', 'حلويات', 'أسماك', 'جزارة', 'دواجن'];

/* Strict, hardcoded, non-editable merchant exceptions. Legal text must never be
   customizable from the UI, so these are keyed purely off the merchant name at
   generation time. */
const FINANCIAL_EXCEPTION_MERCHANT = 'سفير السعادة';

/* Court jurisdiction for the BUTCHER "الحيطاوى" (serial #1014). Live data shows
   TWO near-identical merchants whose names differ only in the last letter, so
   name matching (especially any ى->ي normalization) incorrectly merges them:
     - merchants/KJ-N3K4DG  "الحيطاوى" (ends ى U+0649)  جزارة -> #1014
     - merchants/KJ-9EXVP8  "الحيطاوي" (ends ي U+064A)  أسماك -> #1015
   The serial is derived and unstable, so we match ONLY the immutable merchantId;
   the fish merchant keeps the default Kanjo HQ court. */
const DESOUK_MERCHANT_IDS = ['KJ-N3K4DG'];

const isRestaurantCafeCategoryExact = (cat) => {
    const c = String(cat || '').trim();
    return c === 'مطاعم وكافيهات' || c.endsWith('مطاعم وكافيهات');
};

const isMedicalCategory = (cat) => ['صيدليات', 'كوزماتكس', 'عناية شخصية', 'مستلزمات طبية']
    .some((k) => String(cat || '').includes(k));

/* Wide ruled blank used wherever a merchant-supplied value is missing (VIP
   pre-contract merchants, the master blank template, incomplete records). It is
   deliberately long so there is physical room to handwrite the value on site. */
const CONTRACT_WIDE_BLANK = '............................................................';
const CONTRACT_SHORT_BLANK = '......................';

const isSupermarketCategory = (cat) => {
    const raw = String(cat || '').trim();
    return raw.replace(/\s+/g, '').includes('سوبرماركت') || raw.toLowerCase().includes('supermarket');
};

/* Grocery annex is rendered as its own titled block (not appended to the main
   clauses array) so the 20-label ARABIC_CLAUSE_NUMBERS ceiling is never hit. */
const SUPERMARKET_ANNEX_CLAUSES = [
    {
        ordinal: 'أولاً',
        title: 'سياسة المرتجعات',
        body: 'يقتصر ضمان الأغذية الطازجة على ٢٤ ساعة فقط من وقت الاستلام، بشرط الحفاظ عليها في هيئتها الأصلية. كما يُتفق على أن مستحضرات التجميل غير قابلة للاسترجاع نهائياً حفاظاً على الصحة العامة.'
    },
    {
        ordinal: 'ثانياً',
        title: 'مسئولية النقل',
        body: 'تنتقل المسئولية الكاملة للمنتجات القابلة للتلف أو الكسر (مثل الفواكه، الخضروات، والزجاجات) إلى شركة "كانچو" بمجرد تسليم التاجر لهذه المنتجات لطيار "كانچو" في حالة سليمة ومطابقة للمواصفات.'
    },
    {
        ordinal: 'ثالثاً',
        title: 'إدارة المخزون والنواقص',
        body: 'يلتزم الطرف الثاني بتحديث حالة المخزون على المنصة فور نفاده. وفي حال طلب العميل منتجاً غير متوفر، يتم التواصل مع العميل حصرياً عبر قنوات "كانچو" الرسمية (عبر خدمة العملاء أو المحادثة المباشرة داخل المنصة) لعرض البدائل المتاحة، وذلك لضمان تقديم خدمة احترافية تحفظ حقوق جميع الأطراف.'
    },
    {
        ordinal: 'رابعاً',
        title: 'سياسة الموزونات',
        body: 'تُسجل المنتجات التي تُباع بالوزن بـ (أوزان ثابتة) على التطبيق (مثل ربع كيلو، نصف كيلو، كيلو، إلخ). ونظراً لاستحالة ضبط الأوزان بدقة متناهية، يُسمح بتفاوت في الوزن الفعلي بزيادة أو نقصان في نطاق (١٠٪)، وتتم محاسبة العميل بناءً على الوزن الفعلي المُسلّم. تلتزم "كانچو" بتحديث قيمة الفاتورة للطلبات النقدية بناءً على الفاتورة المسلمة للسائق، وتوفير حل برمجي للطلبات المدفوعة إلكترونياً لتحديث السعر، مع التزامها بإعلام العميل المسبق بقابلية تغير الأوزان.'
    },
    {
        ordinal: 'خامساً',
        title: 'حدود المسئولية والتعويضات',
        body: 'في حال حدوث خطأ في الطلب، يتحمل الطرف المخطئ وحده تكلفة تعويض العميل. يلتزم التاجر بتجهيز الطلب بشكل صحيح ومطابق لطلب العميل بأعلى جودة ممكنة، بينما تلتزم "كانچو" باستلام الطلب وتوصيله في نفس حالته المجهزة وتتحمل أي تبعات أو أخطاء تنتج عن التقصير في عملية التوصيل.'
    }
];

const buildSupermarketAnnexHtml = () => {
    const items = SUPERMARKET_ANNEX_CLAUSES.map((cl) => `<div class="contract-clause-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 14px;">
            <div class="contract-clause-title" style="font-size: 14px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 8px;">${cl.ordinal}: ${cl.title}</div>
            <div class="contract-text" style="font-size: 14px; line-height: 1.9; text-align: justify; color: #1e293b; font-weight: bold;">${cl.body}</div>
        </div>`).join('\n');

    return `
        <div class="contract-annex" style="margin: 20px 0;">
            <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 10px 15px; border-right: 4px solid #F59E0B; margin-bottom: 12px;">ملحق تشغيل السوبر ماركت: التزامات إضافية</div>
            <div class="contract-text" style="font-size: 14px; line-height: 1.9; text-align: justify; color: #1e293b; font-weight: bold; margin-bottom: 14px;">يُعد هذا الملحق جزءًا لا يتجزأ من العقد ويُطبق على الطرف الثاني بصورة إضافية على نشاط السوبر ماركت، دون أن يلغي أو يحد من أي التزام آخر وارد في العقد.</div>
            ${items}
        </div>`;
};

const resolveBusinessType = (category, explicitType) => {
    const cat = String(category || '');
    const explicit = String(explicitType || '').trim();
    if (explicit && !CONTRACT_PLACEHOLDER_CATS.includes(explicit)) return explicit;
    for (const key in CONTRACT_BUSINESS_TYPES) {
        if (cat.includes(key)) return CONTRACT_BUSINESS_TYPES[key];
    }
    return 'منشأة';
};

/* Social footer icons (inline SVG so the PDF needs no icon font / network). */
const socialIcon = (label, svg) => `<div style="font-size: 12px; color: #4B0082; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">${svg}<span dir="ltr">${label}</span></div>`;
const SOCIAL_ICONS = {
    facebook: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" fill="#1877F2"/></svg>',
    instagram: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="#E4405F" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="#E4405F" stroke-width="2"/><circle cx="17" cy="7" r="1.3" fill="#E4405F"/></svg>',
    tiktok: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3c.3 2.2 1.8 3.9 4 4.2v2.6c-1.5 0-2.9-.5-4-1.3v6.4a5.4 5.4 0 1 1-5.4-5.4c.3 0 .6 0 .9.1v2.7a2.7 2.7 0 1 0 1.9 2.6V3h2.6z" fill="#111"/></svg>'
};

/* ----------------------------------------------------------------------------
 * Input normalisation — validates the callable payload and produces the exact
 * shape the builder expects. Numeric fields are coerced; text is trimmed.
 * ------------------------------------------------------------------------- */
function normalizeContractInput(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const merchantId = String(data.merchantId || data.merchant_id || '').trim();
    const isBlankTemplate = data.isBlankTemplate === true || data.blankTemplate === true;
    const rawName = String(data.merchantName || data.name || '').trim();
    if (!merchantId) throw new Error('merchantId مطلوب لإصدار العقد');
    /* The master blank template is intentionally nameless: every merchant field
       is left to be handwritten on site. */
    if (!rawName && !isBlankTemplate) throw new Error('merchantName مطلوب لإصدار العقد');

    const baseName = rawName ? (getBaseName(rawName) || rawName) : '';
    const merchantName = sanitizeLegalText(baseName) || baseName;

    const category = sanitizeLegalText(String(data.category || data.cat || '').trim()) || String(data.category || data.cat || '').trim();
    const businessType = resolveBusinessType(category, data.businessType || data.facilityType);

    const rate = Number(data.commissionRate !== undefined ? data.commissionRate : data.achieved);
    const commissionRate = Number.isFinite(rate) ? rate : 0;

    const commission = data.commission && typeof data.commission === 'object' ? data.commission : {};
    const baseCommissionRaw = commission.baseCommission;
    const baseCommission = (baseCommissionRaw !== null && baseCommissionRaw !== undefined && baseCommissionRaw !== '' && Number.isFinite(Number(baseCommissionRaw)))
        ? Number(baseCommissionRaw)
        : null;
    const exceptions = Array.isArray(commission.exceptions)
        ? commission.exceptions
            .filter((ex) => ex && String(ex.category || '').trim() && Number.isFinite(Number(ex.rate)))
            .map((ex) => ({ category: String(ex.category).trim(), rate: Number(ex.rate) }))
        : [];

    let contactName = String(data.contactName || '').trim();
    if (contactName) contactName = sanitizeLegalText(contactName) || contactName;

    /* The master template prints every money/commission field as a ruled blank,
       so any values that happened to be in the form are intentionally dropped. */
    const finalBaseCommission = isBlankTemplate ? null : baseCommission;
    const finalExceptions = isBlankTemplate ? [] : exceptions;

    return {
        merchantId,
        merchantName,
        blankTemplate: isBlankTemplate,
        category: category || 'غير محدد',
        businessType,
        titleBusinessType: String(data.titleBusinessType || '').trim() || businessType,
        commissionRate,
        contactName,
        contactPhone: String(data.contactPhone || '').trim(),
        contactRole: String(data.contactRole || '').trim(),
        address: String(data.address || '').trim(),
        merchantLogo: String(data.merchantLogo || data.merchantLogoBase64 || '').trim(),
        vipPreContract: data.vipPreContract === true,
        baseCommission: finalBaseCommission,
        exceptions: finalExceptions
    };
}

/* ----------------------------------------------------------------------------
 * Document builder — mirrors window.buildContractHTML exactly.
 * ------------------------------------------------------------------------- */
function buildCoverPage({ merchantName, merchantLogo, logoDataUri, blankTemplate }) {
    const safeName = escapeHtml(merchantName);
    const initial = escapeHtml(Array.from(String(merchantName || '').trim())[0] || 'ك');
    const safeLogo = merchantLogo ? escapeHtml(merchantLogo) : '';

    const partnerCardStyle = 'width: 54mm; height: 54mm; border-radius: 20px; background: #ffffff; border: 2px solid #E9D5FF; box-shadow: 0 16px 42px rgba(75, 0, 130, 0.13); display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 6mm; box-sizing: border-box;';
    const kanjoMark = `<div style="${partnerCardStyle}"><img src="${logoDataUri}" alt="Kanjo" style="max-width: 43mm; max-height: 32mm; object-fit: contain; display: block;"></div>`;
    const merchantMark = safeLogo
        ? `<div style="${partnerCardStyle}"><img src="${safeLogo}" alt="${safeName}" style="max-width: 40mm; max-height: 40mm; object-fit: contain; display: block;"></div>`
        : `<div style="${partnerCardStyle} background: linear-gradient(145deg, #4B0082, #6B21A8); border-color: #F59E0B;"><span style="color: #ffffff; font-size: 46px; font-weight: 900; line-height: 1;">${initial}</span></div>`;

    /* The master blank template has no merchant identity at all, so the paired
       Kanjo + merchant logo layout would print a meaningless placeholder card.
       It gets a dedicated cover instead: a single, large, perfectly centred
       Kanjo logo with the official slogan directly beneath it. */
    const blankCoverBody = `
            <div style="position: absolute; z-index: 1; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 130mm; height: 130mm; border-radius: 28px; background: #ffffff; border: 2px solid #E9D5FF; box-shadow: 0 22px 60px rgba(75, 0, 130, 0.16); display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 16mm; box-sizing: border-box;">
                <img src="${logoDataUri}" alt="Kanjo" style="max-width: 96mm; max-height: 96mm; object-fit: contain; display: block;">
            </div>
            <div style="position: absolute; z-index: 1; top: calc(50% + 80mm); left: 0; right: 0; text-align: center; font-size: 40px; line-height: 1.5; font-weight: 900; color: #4B0082; letter-spacing: 0.4px;">ياما في الجراب يا حاوي</div>
            <div style="position: absolute; z-index: 1; top: calc(50% + 97mm); left: 50%; transform: translateX(-50%); width: 46mm; height: 4px; background: #F59E0B; border-radius: 999px;"></div>
            <div style="position: absolute; z-index: 1; bottom: 0; left: 0; right: 0; padding-top: 8mm; border-top: 1px solid #E9D5FF; text-align: center; font-size: 13px; line-height: 1.7; font-weight: 700; color: #7E22CE;">وثيقة تعاقدية رسمية صادرة عن كانچو — نسخة أصلية</div>
    `;

    if (blankTemplate) {
        return `
        <section class="contract-cover" style="position: relative; width: 100%; min-height: 297mm; box-sizing: border-box; padding: 20mm; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; overflow: hidden; direction: rtl; background: linear-gradient(160deg, #ffffff 0%, #fdfbff 48%, #f5f3ff 100%); font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif; color: #4B0082; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 9px; background: linear-gradient(90deg, #4B0082 0%, #F59E0B 50%, #4B0082 100%);"></div>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #F59E0B 0%, #4B0082 50%, #F59E0B 100%);"></div>
            ${blankCoverBody}
        </section>
    `;
    }

    return `
        <section class="contract-cover" style="position: relative; width: 100%; min-height: 297mm; box-sizing: border-box; padding: 20mm; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; overflow: hidden; direction: rtl; background: linear-gradient(160deg, #ffffff 0%, #fdfbff 48%, #f5f3ff 100%); font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif; color: #4B0082; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
            <div style="position: absolute; top: 0; left: 0; right: 0; height: 9px; background: linear-gradient(90deg, #4B0082 0%, #F59E0B 50%, #4B0082 100%);"></div>
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #F59E0B 0%, #4B0082 50%, #F59E0B 100%);"></div>
            <div style="position: relative; z-index: 1; width: 100%; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: space-evenly;">
                <div style="font-size: 15px; line-height: 1.6; letter-spacing: 8px; color: #B45309; font-weight: 800; direction: ltr;">KANJO PARTNERSHIP DOCUMENT</div>
                <div style="width: 32mm; height: 4px; background: #F59E0B; border-radius: 999px; margin: 8mm auto 6mm;"></div>
                <div style="font-size: 54px; line-height: 1.3; font-weight: 900; color: #4B0082; letter-spacing: -0.5px;">عقد شراكة نجاح</div>
                <div style="font-size: 20px; line-height: 1.8; font-weight: 700; color: #6B21A8; margin-top: 3mm;">إطار تعاقدي رسمي لشراكة النجاح</div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; margin: 8mm 0 6mm;">
                    <span style="height: 1.5px; width: 46mm; background: linear-gradient(90deg, rgba(245, 158, 11, 0), #F59E0B);"></span>
                    <span style="width: 9px; height: 9px; background: #F59E0B; transform: rotate(45deg); display: inline-block;"></span>
                    <span style="height: 1.5px; width: 46mm; background: linear-gradient(90deg, #F59E0B, rgba(245, 158, 11, 0));"></span>
                </div>
                <div style="font-size: 16px; line-height: 1.6; font-weight: 800; color: #64748b; margin-bottom: 4mm;">شراكة رسمية</div>
                <div style="display: flex; align-items: flex-start; justify-content: center; gap: 5mm; width: 100%;">
                    <div style="width: 70mm; display: flex; flex-direction: column; align-items: center;">
                        ${kanjoMark}
                        <div style="margin-top: 4.5mm; font-size: 24px; line-height: 1.45; font-weight: 900; color: #4B0082;">كانچو</div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3mm; min-width: 18mm; height: 54mm;">
                        <span style="width: 2px; height: 18mm; border-radius: 999px; background: linear-gradient(180deg, rgba(75, 0, 130, 0), #4B0082 55%, #F59E0B);"></span>
                        <span style="font-size: 40px; line-height: 1; font-weight: 900; color: #F59E0B;">&amp;</span>
                        <span style="width: 2px; height: 18mm; border-radius: 999px; background: linear-gradient(180deg, #F59E0B, #4B0082 45%, rgba(75, 0, 130, 0));"></span>
                    </div>
                    <div style="width: 70mm; display: flex; flex-direction: column; align-items: center;">
                        ${merchantMark}
                        <div style="margin-top: 4.5mm; font-size: 24px; line-height: 1.45; font-weight: 900; color: #4B0082; max-width: 68mm; word-break: break-word;">${safeName}</div>
                    </div>
                </div>
            </div>
            <div style="position: relative; z-index: 1; width: 100%; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-top: 6mm; padding: 8mm 0; border-top: 1px solid #E9D5FF;">
                <div style="font-size: 28px; line-height: 1.5; font-weight: 900; color: #4B0082; letter-spacing: 0.3px;">ياما في الجراب يا حاوي</div>
            </div>
            <div style="position: relative; z-index: 1; width: 100%; padding-top: 8mm; border-top: 1px solid #E9D5FF; font-size: 13px; line-height: 1.7; font-weight: 700; color: #7E22CE;">وثيقة تعاقدية رسمية صادرة عن كانچو — نسخة أصلية</div>
        </section>
    `;
}

function buildContractHtml(input) {
    const assets = getAssets();
    const logoDataUri = assets.logoDataUri;

    const blankTemplate = input.blankTemplate === true;
    const merchantName = blankTemplate ? '' : String(input.merchantName || '');
    const nameDisplay = merchantName || CONTRACT_WIDE_BLANK;
    const businessType = input.businessType;
    const resolvedCat = input.category;
    const categoryDisplay = (blankTemplate || !resolvedCat || resolvedCat === 'غير محدد') ? CONTRACT_WIDE_BLANK : resolvedCat;
    const isRestCafe = isRestaurantCafeCategoryExact(resolvedCat);
    const isSupermarket = isSupermarketCategory(resolvedCat);
    const titleBusinessType = blankTemplate
        ? ''
        : ((isRestCafe && input.titleBusinessType) ? input.titleBusinessType : businessType);
    const contractHeading = blankTemplate
        ? `عقد انضمام ${CONTRACT_SHORT_BLANK}`
        : `عقد انضمام ${titleBusinessType} ${merchantName}`;

    const merchantNameKey = String(merchantName || '').replace(/\s+/g, ' ').trim();
    const financialSpecialException = merchantNameKey.includes(FINANCIAL_EXCEPTION_MERCHANT)
        ? ' استثناء خاص: يتم تصفية الحسابات وإجراء التسويات المالية كل شهر أو شهرين بناءً على طلب الطرف الثاني.'
        : '';

    const resolvedMerchantId = String(input.merchantId || '').trim();
    const isDesoukMerchant = DESOUK_MERCHANT_IDS.includes(resolvedMerchantId);
    const jurisdictionClause = isDesoukMerchant
        ? 'ثم تختص محكمة دسوق.'
        : 'ثم تختص المحكمة المختصة في نطاق مقر كانچو ما لم يتفق على خلاف ذلك.';

    const achieved = input.commissionRate;
    const baseCommission = input.baseCommission;
    const exceptions = input.exceptions || [];
    const vipPreContract = input.vipPreContract === true;
    const displayRate = (baseCommission !== null) ? baseCommission : achieved;
    /* Blank/zero commission is never printed as "0%" — it becomes a wide ruled
       line so the figure can be filled in by hand. */
    const achievedMeter = (!blankTemplate && Number(achieved) > 0) ? `${toArabicNumerals(achieved)}%` : CONTRACT_WIDE_BLANK;
    const displayRateMeter = (!blankTemplate && Number(displayRate) > 0) ? `${toArabicNumerals(displayRate)}%` : CONTRACT_WIDE_BLANK;

    const contactName = String(input.contactName || '').trim();
    const address = String(input.address || '').trim();
    const phone = String(input.contactPhone || '').trim();
    const merchantLogo = input.merchantLogo;

    const headerHtml = merchantLogo
        ? `
            <div class="contract-header" style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; direction: rtl; border-bottom: 3px solid #4B0082; padding-bottom: 10px; margin-bottom: 16px;">
                <div><img src="${logoDataUri}" alt="Kanjo Logo" style="max-height: 55px; max-width: 110px; object-fit: contain;"></div>
                <div><img src="${merchantLogo}" alt="Merchant Logo" style="max-height: 55px; max-width: 90px; object-fit: contain;"></div>
            </div>
        `
        : `
            <div class="contract-header" style="display: flex; flex-direction: row; justify-content: center; align-items: center; direction: rtl; border-bottom: 3px solid #4B0082; padding-bottom: 10px; margin-bottom: 16px;">
                <div><img src="${logoDataUri}" alt="Kanjo Logo" style="max-height: 55px; max-width: 110px; object-fit: contain;"></div>
            </div>
        `;

    const clauses = [
        {
            title: 'موضوع العقد وطبيعة العلاقة',
            body: 'تقبل كانچو انضمام الطرف الثاني إلى منظومتها لعرض أو بيع أو توريد أو تخزين أو تجهيز منتجاته أو خدماته من خلال المنصة، وتتم العمليات الجوهرية عبر أدوات كانچو الرسمية، وعلى الأخص عرض المنتج، استقبال الطلب، قبوله، تجهيزه، تسليمه، تسويته ماليًا، ومعالجة شكاواه. وهذه العلاقة تجارية تشغيلية مستقلة، ولا تنشئ شركة أو وكالة عامة أو علاقة عمل أو امتياز أو تمثيل حصري. وتظل كانچو مالكة للمنصة وأنظمتها وبياناتها وقواعد العملاء والتقارير والتقييمات، بينما يظل الطرف الثاني مسؤولًا عن منتجاته وجودتها ومشروعيتها وتراخيصها وضماناتها وخدمة ما بعد البيع.'
        },
        {
            title: 'شروط الاعتماد وإقرارات الطرف الثاني',
            body: 'لا يحق للطرف الثاني عرض منتجات أو استقبال طلبات إلا بعد اعتماد كانچو وتقديم السجل أو الترخيص، البيانات الضريبية، بيانات الفروع والمخازن، الحساب البنكي، التراخيص الصحية أو النوعية، ومستندات مصدر المنتجات أو حق بيعها متى طلبت كانچو ذلك. ويقر الطرف الثاني بأن بياناته صحيحة وحديثة، وأن منتجاته أصلية ومشروعة وغير مقلدة ولا مجهولة المصدر، وأنه يملك حق بيعها أو توريدها، وأنها مطابقة للوصف والصور والمواصفات، صالحة للاستخدام أو الاستهلاك، غير منتهية الصلاحية، وأن الأسعار والمخزون والخصومات صحيحة وغير مضللة.'
        },
        {
            title: 'التزامات كانچو',
            body: 'تلتزم كانچو، في حدود طبيعة المنصة، بتمكين الطرف الثاني من عرض منتجاته بعد اعتماده، وتوفير وسيلة تشغيل إلكترونية مناسبة، وتمكين العملاء من الطلب، وإدارة دورة الطلب، وإتاحة أدوات الدفع والتوصيل والتقييم والدعم بحسب نموذج التشغيل، وإصدار كشوف تسوية دورية، وخصم رسومها ومستحقاتها، وتسوية صافي مستحقات الطرف الثاني وفق دورة التسوية المعتمدة. ولا تضمن كانچو حدًا أدنى من المبيعات أو الأرباح أو الطلبات أو الظهور أو الترتيب داخل التطبيق.'
        },
        {
            title: 'التزامات الطرف الثاني العامة',
            body: 'يلتزم الطرف الثاني بمتابعة لوحة التحكم خلال ساعات العمل، الرد على الطلبات فورًا، تجهيز الطلبات في المواعيد المحددة، تحديث الأسعار والمخزون والبيانات باستمرار، عدم قبول طلب يتعذر تنفيذه، عدم إلغاء الطلب بعد قبوله إلا لسبب مشروع، تسليم الطلب مغلفًا وآمنًا ومطابقًا، التعاون مع مندوبي التوصيل، الإفصاح الكامل عن المنتج ومحاذيره، حماية بيانات العملاء، عدم التواصل معهم خارج قنوات كانچو، عدم الالتفاف على المنصة، وتحمل مسؤولية أي خطأ أو نقص أو تلف أو تضليل أو مخالفة.'
        },
        {
            title: 'رسوم تقديم الخدمات والتشغيل',
            body: `تحصل كانچو مقابل خدمات المنصة والتشغيل على نسبة <strong>[ ${achievedMeter} ]</strong> من كل طلب أو عملية بيع أو توريد أو خدمة تتم أو تبدأ من خلال المنصة، ويجوز تحديد نسب مختلفة بحسب النشاط أو فئة المنتج أو المدينة أو حجم المبيعات وفق ملحق العمولات المعتمد. وتُعرض هذه النسبة بوضوح في كشف الحساب الدوري قبل التسوية، ولا تُخصم أي رسوم خفية من مستحقات الطرف الثاني. وأي طلب يبدأ من كانچو ثم ينفذ خارجها يستحق عنه كامل رسوم كانچو، ولا يجوز للطرف الثاني الالتفاف على المنصة بتقسيم الطلبات أو تغيير التصنيف أو الإلغاء بقصد التعامل الخارجي.`
        },
        {
            title: 'الأسعار والخصومات والعروض',
            body: 'يلتزم الطرف الثاني بأن تكون الأسعار صحيحة ونهائية وغير مضللة، ويحظر عليه إعلان خصم وهمي، أو تحصيل مبلغ خارج التطبيق، أو تعديل السعر بعد قبول الطلب، أو إخفاء رسوم أو ضرائب، أو رفع السعر داخل كانچو لتعويض رسوم المنصة دون إخطار. ولا يجوز إطلاق عرض أو خصم أو كوبون أو حملة داخل كانچو إلا بعد اعتماده أو إدخاله بالطريقة المعتمدة، كما يلتزم بإخطار كانچو بالعروض الخارجية الجوهرية على المنتجات ذاتها متى أثرت على عدالة التسعير أو تجربة العميل أو سمعة المنصة.'
        },
        {
            title: 'بيانات المنتجات والإفصاح الكامل',
            body: 'يلتزم الطرف الثاني بإدراج بيانات كل منتج بدقة، وتشمل الاسم، السعر، الوصف، الصور، الكمية أو الحجم أو الوزن، المكونات، بلد المنشأ عند اللزوم، تاريخ الإنتاج والانتهاء، طريقة التخزين، تعليمات الاستخدام، المحاذير، مسببات الحساسية، الضمان، شروط الاستبدال أو الإرجاع، وأي قيد قانوني أو صحي أو عمري. ويتحمل الطرف الثاني وحده مسؤولية أي خطأ أو نقص أو تضليل في بيانات المنتج أو صوره أو مكوناته أو سعره أو محاذيره.'
        }
    ];

    const catSource = String(category_source(input) || '');
    if (FOOD_PREP_KEYWORDS.some((k) => catSource.includes(k))) {
        clauses.push({
            title: 'المطاعم والكافيهات والأغذية',
            body: 'إذا كان الطرف الثاني مطعمًا أو كافيهًا أو مقدم مأكولات أو مشروبات، يلتزم بالإفصاح الواضح عن المكونات الأساسية، وبيان مسببات الحساسية بصورة بارزة مثل المكسرات، الألبان، البيض، الجلوتين، الصويا، السمسم والمأكولات البحرية، ووضع محاذير واضحة للفئات المتأثرة، وبيان السعرات الحرارية لكل منتج متى كان ذلك ممكنًا أو مطلوبًا قانونًا أو بسياسة كانچو، وتحديث ذلك فور تغيير الوصفة، والالتزام بالنظافة وسلامة الغذاء والتغليف المناسب، وتحمل أي ضرر صحي أو شكوى تنشأ عن عدم الإفصاح أو سوء التغليف أو فساد المنتج.'
        });
    }

    if (isMedicalCategory(resolvedCat)) {
        clauses.push({
            title: 'العقاقير الطبية والمنتجات المقيدة',
            body: 'إذا كان الطرف الثاني صيدلية أو شركة أدوية أو موردًا أو مخزنًا يتعامل في منتجات طبية أو صحية أو عقاقير تحتاج وصفة أو قيدًا عمريًا أو إشرافًا عائليًا، يلتزم بعدم عرض أو بيع أي منتج مقيد إلا بترخيص وموافقة كانچو، وعدم تجهيزه أو تسليمه إلا بعد التنسيق مع خدمة عملاء كانچو أو فريق الامتثال للتحقق من الوصفة أو السن أو الإشراف المطلوب، ودون أن تتحول كانچو إلى جهة وصف أو صرف طبي. ويحظر التواصل مع العميل خارج قنوات كانچو للحصول على وصفة أو بيانات صحية، وتعد الوصفات والبيانات الصحية سرية، ويلتزم الطرف الثاني بتغليف المنتج تغليفًا آمنًا ومحايدًا، ويتحمل كامل المسؤولية المهنية والقانونية عن صحة المنتج ومشروعية صرفه وحفظه وبيعه.'
        });
    }

    clauses.push(
        {
            title: 'المنتجات المحظورة والملكية الفكرية',
            body: 'يحظر عرض أو بيع أي منتج مخالف للقانون، مقلد، مغشوش، مجهول المصدر، منتهي الصلاحية، ضار بالصحة، أو ينتهك علامة تجارية أو حقوق ملكية فكرية، أو يتطلب ترخيصًا لم يقدمه الطرف الثاني، أو يخالف النظام العام أو سياسات كانچو. ويحق لكانچو إزالة أو تعليق أي منتج أو فئة فورًا عند وجود خطر قانوني أو صحي أو تشغيلي. ولا يجوز للطرف الثاني استخدام اسم أو شعار كانچو إلا بموافقة كتابية، مع منح كانچو ترخيصًا غير حصري لاستخدام صور وأوصاف منتجاته بالقدر اللازم للتشغيل والتسويق وخدمة العملاء.'
        },
        {
            title: 'المخزون والتجهيز والتغليف',
            body: 'يلتزم الطرف الثاني بتحديث المخزون فورًا، وعدم قبول طلب لمنتج غير متاح، وتجهيز الطلب بذات الأصناف والكميات والمواصفات الظاهرة في التطبيق، وعدم الاستبدال أو الحذف إلا وفق سياسة كانچو، وتغليف الطلب بصورة آمنة مناسبة لطبيعته، وفصل المنتجات التي قد تتأثر ببعضها، ومنع التسريب أو الكسر أو التلف أو التلوث، وتسليم الطلب لمندوب كانچو مغلقًا ومطابقًا وفي الوقت المحدد. ويتحمل مسؤولية أي نقص أو خطأ أو تلف أو تسريب أو تأخير ناشئ عن التجهيز أو التغليف.'
        },
        {
            title: 'خدمة ما بعد البيع والمرتجعات',
            body: 'يلتزم الطرف الثاني بالتعاون مع خدمة عملاء كانچو للرد على الاستفسارات المتعلقة بحالة الطلبات أو معالجة الشكاوى الناتجة عن عيوب التجهيز أو النقص أو التلف أو الاختلاف، دون اتصال مباشر من الطرف الثاني بالعملاء إلا من خلال قنوات كانچو الرسمية. ويتولى الطرف الثاني معالجة ما يصل إليه من ملاحظات عبر خدمة عملاء كانچو، وتنفيذ الضمان المعلن أو القانوني، وقبول المرتجعات أو الاستبدال متى كان العميل محقًا، ورد قيمة المنتج أو تعويض العميل إذا ثبت خطأ الطرف الثاني، وتقديم الفواتير ومستندات الضمان أو مصدر المنتج عند الطلب. ويتحمل تكلفة المرتجع أو الاستبدال أو التعويض إذا كان السبب راجعًا إلى عيب المنتج، سوء التغليف، خطأ التجهيز، نقص البيانات، التضليل، أو مخالفة الوصف.'
        },
        {
            title: 'الخصوصية وعدم الالتفاف والسرية',
            body: 'بيانات العملاء والطلبات والمندوبين ونسب الرسوم والتقارير وآليات التشغيل بيانات سرية، ولا يجوز حفظها أو نسخها أو تصويرها أو مشاركتها أو استخدامها خارج تنفيذ الطلب وخدمة ما بعد البيع عبر قنوات كانچو. ويحظر التواصل مع العملاء خارج المنصة، أو إرسال عروض مباشرة، أو إنشاء قاعدة بيانات من عملاء كانچو، أو وضع أرقام وروابط داخل الطلب، أو تقديم خصم للشراء المباشر، أو إلغاء طلب كانچو وتنفيذه خارجيًا، أو التحصيل خارج التطبيق. ويظل الالتزام بالسرية وعدم الالتفاف قائمًا بعد انتهاء العقد.'
        },
        {
            title: 'التقييمات والجزاءات والمسؤولية',
            body: 'يخضع الطرف الثاني لمؤشرات الأداء مثل سرعة القبول، زمن التجهيز، معدل الإلغاء، نفاد المخزون، جودة التغليف، الشكاوى، المرتجعات، تقييم العملاء ودقة البيانات. ويحق لكانچو عند المخالفة التنبيه، الإنذار، إخفاء منتج، تعليق منتج أو فرع أو حساب، خفض الظهور، وقف الحملات، خصم التعويضات، حجز المستحقات، إنهاء العقد والمطالبة بالتعويض. وتعد مخالفات جسيمة: المنتجات المقلدة أو المحظورة أو المنتهية، تسريب البيانات، التحصيل الخارجي، الالتفاف، التلاعب بالأسعار أو التقييمات، رفض مرتجع مستحق، تزوير المستندات، أو الإضرار بسمعة كانچو.'
        },
        {
            title: 'التسوية المالية وشفافية المستحقات',
            body: 'تلتزم كانچو بالشفافية الكاملة في كل التعاملات المالية؛ حيث تصدر كشف حساب دوري وواضح يوضح جميع الطلبات والمبيعات والمرتجعات ورسوم تقديم الخدمات والتشغيل وصافي المستحقات. وسواء كان الدفع نقدًا عند الاستلام أو عبر وسائل الدفع الإلكترونية، تتم التسوية وفق دورة تسوية ثابتة ومعلنة، وتصل مستحقات الطرف الثاني كاملة وفي مواعيدها دون تأخير. ويمكن للطرف الثاني متابعة مستحقاته وكشوف حسابه في أي وقت من خلال لوحة التحكم أو التطبيق، لضمان رؤية واضحة وآمنة لجميع المعاملات المالية، وتتعهد كانچو بحماية بياناته المالية وعدم مشاركتها إلا بالقدر اللازم للتشغيل.'
        },
        {
            title: 'آلية المعاملات النقدية والتسويات المالية',
            body: `يتم تنظيم الدورة المالية بين الطرفين على النحو التالي: في الطلبات النقدية (الدفع عند الاستلام) يلتزم مندوب كانچو بدفع قيمة الطلب إلى الطرف الثاني عند الاستلام، وتصبح عمولة كانچو دينًا مستحقًا على الطرف الثاني يظهر بشكل مباشر وحي على التطبيق، ويتم تحصيلها دوريًا قبل بلوغ الحد الائتماني المقرر. وفي الطلبات الإلكترونية (الدفع أونلاين) تصبح كانچو مدينة للطرف الثاني بقيمة الطلب بعد خصم عمولتها، وتظهر المستحقات بشكل مباشر وحي على التطبيق، ويمكن للطرف الثاني طلب سحب مستحقاته في أي وقت، وتُحوَّل إليه في أسرع وقت ممكن وفقًا لقواعد وتعليمات البنك المركزي المصري.${financialSpecialException}<br><br>ملاحظات:<div style="height: 30px; border-bottom: 1px dashed #000; margin-bottom: 8px; width: 100%; margin-top: 6px;"></div><div style="height: 30px; border-bottom: 1px dashed #000; margin-bottom: 8px; width: 100%;"></div><div style="height: 30px; border-bottom: 1px dashed #000; margin-bottom: 8px; width: 100%;"></div><div style="height: 30px; border-bottom: 1px dashed #000; margin-bottom: 8px; width: 100%;"></div>`
        },
        {
            title: 'إنهاء التعاقد',
            body: 'يحق لأي من الطرفين إنهاء هذا العقد في أي وقت عن طريق إخطار كتابي رسمي يُرسل إلى الطرف الآخر، وذلك دون أي شروط جزائية، وبما لا يخل بالحقوق المكتسبة، على أن يلتزم الطرفان بتسوية كافة المستحقات والالتزامات المالية القائمة بينهما قبل تاريخ الإنهاء.'
        },
        {
            title: 'القوة القاهرة',
            body: 'لا يُعد أي من الطرفين مسؤولًا عن أي إخلال أو تأخير في تنفيذ التزاماته إذا كان ذلك ناشئًا عن قوة قاهرة خارجة عن إرادته، مثل الكوارث الطبيعية، الحروب، الاضطرابات، القرارات الحكومية، انقطاع التيار أو الشبكات أو الخدمات الأساسية، أو أي سبب آخر خارج عن السيطرة المعقولة. وعلى الطرف المتأثر إخطار الطرف الآخر فورًا وبذل الجهد اللازم لتقليل الآثار، ويُعلَّق تنفيذ الالتزامات المتأثرة طوال استمرار القوة القاهرة، وتُستأنف فور زوالها.'
        },
        {
            title: 'القانون والإخطارات والأحكام الختامية',
            body: `تكون الإخطارات صحيحة عبر البريد الإلكتروني، لوحة التحكم، التطبيق، الرسائل، واتساب العمل، الخطاب المسجل أو التسليم باليد، ويلتزم الطرف الثاني بتحديث بياناته. وتُرسل المراسلات الرسمية إلى مقر الشركة الرئيسي (شارع درب الجرن من شارع المديرية، قسم أول طنطا، محافظة الغربية) بالطرق القانونية المعتمدة. يخضع العقد لقوانين جمهورية مصر العربية، ويُسعى لحل النزاع وديًا خلال 15 يومًا، ${jurisdictionClause} ويمثل العقد وملاحقه كامل الاتفاق، ولا يعد عدم استعمال كانچو لأي حق تنازلًا عنه، وتعد سجلات المنصة وكشوف الحساب والتذاكر والتقييمات قرائن معتبرة.`
        }
    );

    const clauseHtml = clauses.map((cl, idx) => {
        const numberLabel = ARABIC_CLAUSE_NUMBERS[idx] || (idx + 1);
        return `<div class="contract-clause-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 20px;">
    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 10px 15px; border-right: 4px solid #F59E0B; margin-bottom: 12px;">البند ${numberLabel}: ${cl.title}</div>
    <div class="contract-text" style="font-size: 14px; line-height: 1.9; text-align: justify; color: #1e293b; font-weight: bold;">${cl.body}</div>
</div>`;
    }).join('\n\n');

    const printBorderAndWatermark = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 500px; max-width: 70vw; opacity: 0.06; z-index: 9999999; pointer-events: none; print-color-adjust: exact; -webkit-print-color-adjust: exact;">
            <img src="${logoDataUri}" style="width: 100%; height: auto; display: block; filter: grayscale(100%);">
        </div>
    `;

    const hasMerchantLogo = !!merchantLogo;

    const tableHeader = `
        <thead>
            <tr><th style="padding: 5px 0;">
                ${hasMerchantLogo ? `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4B0082; padding-bottom: 10px; margin-top: 10px; margin-bottom: 15px;">
                    <div style="width: 100px; text-align: right;"><img src="${logoDataUri}" style="max-height: 65px; object-fit: contain;"></div>
                    <div style="font-size: 24px; font-weight: 900; color: #4B0082; text-align: center;">${contractHeading}</div>
                    <div style="width: 100px; text-align: left;"><img src="${merchantLogo}" style="max-height: 65px; max-width: 90px; object-fit: contain;"></div>
                </div>` : `
                <div style="border-bottom: 2px solid #4B0082; padding-bottom: 10px; margin-top: 10px; margin-bottom: 15px;">
                    <div style="display: flex; justify-content: center; align-items: center;"><img src="${logoDataUri}" style="max-height: 65px; object-fit: contain;"></div>
                    <div style="font-size: 24px; font-weight: 900; color: #4B0082; text-align: center; margin-top: 10px;">${contractHeading}</div>
                </div>`}
            </th></tr>
        </thead>
    `;

    const tableFooter = `
        <tfoot>
            <tr><td style="padding: 0;">
                <div style="border-top: 2px solid #E2E8F0; margin-top: 15px; padding-top: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: #4B0082;">
                    <span>توقيع الطرف الأول (كانچو): ..............................</span>
                    <span>توقيع الطرف الثاني (${nameDisplay}): ..............................</span>
                </div>
            </td></tr>
        </tfoot>
    `;

    let commissionTableHtml = '';
    if (baseCommission !== null || exceptions.length > 0) {
        let rateRows = '';
        if (baseCommission !== null) {
            rateRows += `<tr><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">العمولة الأساسية (جميع المنتجات)</td><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">${toArabicNumerals(baseCommission)}%</td></tr>`;
        }
        rateRows += exceptions.map((ex) => `<tr><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">${safeString(ex.category)}</td><td style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">${toArabicNumerals(ex.rate)}%</td></tr>`).join('');

        commissionTableHtml = `
            <div style="page-break-inside: avoid; break-inside: avoid; margin: 15px 0;">
                <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 10px;">ملحق العمولات: نسبة مقابل خدمات المنصة والتشغيل</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; font-weight: bold; color: #1e293b;">
                    <thead>
                        <tr style="background-color: #4B0082; color: #FFFFFF;">
                            <th style="border: 1px solid #E2E8F0; padding: 8px; text-align: right;">الفئة / النشاط</th>
                            <th style="border: 1px solid #E2E8F0; padding: 8px; text-align: center;">نسبة مقابل خدمات المنصة</th>
                        </tr>
                    </thead>
                    <tbody>${rateRows}</tbody>
                </table>
            </div>`;
    }

    const supermarketAnnexHtml = isSupermarket ? buildSupermarketAnnexHtml() : '';

    const nationalIdBoxes = '<span style="display: inline-block; white-space: nowrap; direction: ltr; unicode-bidi: isolate;" dir="ltr">' + Array.from({ length: 14 }).map(() => '<span style="display: inline-block; width: 20px; height: 28px; border: 1.5px solid #4B0082; border-radius: 4px; margin: 0 1px; vertical-align: middle; background: #fff;"></span>').join('') + '</span>';


    const firstPartyBlockHtml = `
                <div class="contract-parties" style="background-color: #F8F9FA; border: 1px solid #E2E8F0; border-right: 4px solid #4B0082; padding: 12px; border-radius: 8px; margin-bottom: 18px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                    <strong>الطرف الأول:</strong> ${KANJO_FIRST_PARTY.tradeName}
                    <div style="margin-top: 8px;">السجل التجاري رقم (${ltrNumber(KANJO_FIRST_PARTY.commercialRegister)}) — ${KANJO_FIRST_PARTY.commercialRegisterOffice}</div>
                    <div>البطاقة الضريبية رقم (${ltrNumber(KANJO_FIRST_PARTY.taxCard)}) — ${KANJO_FIRST_PARTY.taxOffice}</div>
                    <div>المقر: ${KANJO_FIRST_PARTY.address}</div>
                    <div>ويمثلها م/ محمود الجمل بصفته مدير التشغيل والتعاقدات.</div>
                </div>`;

    const secondPartyBlockHtml = `
                <div class="contract-parties" style="background-color: #F8F9FA; border: 1px solid #E2E8F0; border-right: 4px solid #F59E0B; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                    <strong>الطرف الثاني:</strong>${blankTemplate ? '' : ` ${titleBusinessType}:`} ${nameDisplay}
                    <table style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px;">
                        <tr><td style="padding: 5px 0; width: 42%; vertical-align: top;">اسم المنشأة / المحل:</td><td style="padding: 5px 0;">${nameDisplay}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">اسم المفوض / صاحب النشاط:</td><td style="padding: 5px 0;">${safeString(contactName) || CONTRACT_WIDE_BLANK}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">بطاقة الرقم القومي (١٤ رقمًا):</td><td style="padding: 5px 0;">${nationalIdBoxes}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">رقم السجل التجاري:</td><td style="padding: 5px 0;">${CONTRACT_WIDE_BLANK}</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">رقم التسجيل الضريبي:</td><td style="padding: 5px 0;">${CONTRACT_WIDE_BLANK}</td></tr>
                        <tr><td colspan="2" style="padding: 5px 0; vertical-align: top;">
                            <div style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 18px;">
                                <span>رقم الهاتف / واتساب: <span dir="ltr">${safeString(phone) || CONTRACT_WIDE_BLANK}</span></span>
                                <span>رقم إضافي (إن وجد): ........................................</span>
                            </div>
                        </td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">البريد الإلكتروني:</td><td style="padding: 5px 0;">..................................................</td></tr>
                        <tr><td style="padding: 5px 0; vertical-align: top;">العنوان:</td><td style="padding: 5px 0;">${safeString(address) || CONTRACT_WIDE_BLANK}</td></tr>
                    </table>
                </div>`;

    /* Static preamble date: the day/month/year stay blank so the field can be
       completed by hand at signing time (no dynamic date injection). */
    const preambleDateLine = 'إنه في يوم: ............................ الموافق: ...... / ...... / ............ م، تم الاتفاق والتراضي بين كل من:';

    const tableBody = `
        <tbody>
            <tr><td style="padding: 0;">
                <div class="contract-text" style="font-size: 14px; margin-bottom: 20px; line-height: 1.8; font-weight: bold;">${preambleDateLine}</div>
                ${firstPartyBlockHtml}
                ${secondPartyBlockHtml}
                <div class="contract-clause-wrapper" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 20px;">
                    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 8px;">التمهيد</div>
                    <div class="contract-text" style="font-size: 14px; line-height: 1.8; text-align: justify; font-weight: bold;">حيث إن كانچو منصة إلكترونية تجارية وتشغيلية لعرض وطلب وتوصيل المنتجات، وحيث إن الطرف الثاني يرغب في الانضمام إليها؛ فقد اتفق الطرفان على تنظيم العلاقة بما يحفظ حقوق كانچو، ويضمن جودة المنتجات. ويعد هذا التمهيد وملاحق العقد جزءًا لا يتجزأ منه.</div>
                </div>
                ${clauseHtml}
                ${commissionTableHtml}
                ${supermarketAnnexHtml}
                <!-- Legal Copies Clause -->
                <div style="page-break-inside: avoid; break-inside: avoid; margin: 15px 0; text-align: center; font-size: 13px; line-height: 1.9; font-weight: bold; color: #4B0082; background-color: #F8F9FA; border: 1px solid #E2E8F0; border-right: 4px solid #F59E0B; border-radius: 6px; padding: 12px 15px;">تحرر هذا العقد من نسختين أصليتين متطابقتين، بِيَد كل طرف نسخة للعمل بموجبها، ويتكون العقد من البنود والملاحق المذكورة أعلاه.</div>
                <!-- Final Signatures Block -->
                <div style="page-break-inside: avoid; break-inside: avoid; margin-top: 20px;">
                    <div class="contract-clause-title" style="font-size: 16px; font-weight: bold; color: #4B0082; background-color: #F5F3FF; padding: 8px 12px; border-right: 4px solid #F59E0B; margin-bottom: 10px;">ملحق مختصر: البيانات والتوقيعات النهائية</div>
                    <div class="contract-text" style="font-size: 14px; margin-bottom: 15px; font-weight: bold; color: #1e293b;">الفئة التجارية: ${safeString(categoryDisplay)} | نسبة مقابل خدمات المنصة: <strong>[ ${displayRateMeter} ]</strong></div>
                    ${vipPreContract ? `<div class="contract-text" style="font-size: 13px; margin-bottom: 15px; font-weight: bold; color: #92400e; background-color: #fffbeb; border: 1px solid #fcd34d; border-right: 4px solid #F59E0B; border-radius: 6px; padding: 10px 12px;">حالة التعاقد: عرض مبدئي / تحت التعاقد (VIP) — هذا المستند عرض مبدئي غير نهائي ولا يترتب عليه أي التزام تعاقدي أو عمولة.</div>` : ''}
                    ${exceptions.length ? `<div class="contract-text" style="font-size: 14px; margin-bottom: 15px; font-weight: bold; color: #1e293b;">استثناءات النسب: ${exceptions.map((ex) => `${safeString(ex.category)}: [ ${toArabicNumerals(ex.rate)}% ]`).join(' — ')}</div>` : ''}
                    <div class="contract-signatures" style="display: flex; align-items: stretch; gap: 12px; width: 100%; margin-bottom: 15px; font-size: 14px; line-height: 1.8; font-weight: bold;">
                        <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; background: #fff;">
                            <div style="color: #4B0082; margin-bottom: 10px; font-weight: bold;">الطرف الأول: ${KANJO_FIRST_PARTY.tradeName}</div>
                            <div>الاسم: م/ محمود الجمل</div>
                            <div>الصفة: مدير التشغيل والتعاقدات</div>
                            <div style="margin-top: auto; padding-top: 18px;">
                                <div style="font-weight: bold;">توقيع المفوض: ..............................</div>
                                <div style="margin-top: 14px; font-weight: bold;">الختم:</div>
                                <div style="min-height: 80px; background: #fff;"></div>
                            </div>
                        </div>
                        <div style="flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; border: 1px solid #E2E8F0; border-radius: 8px; padding: 15px; background: #fff;">
                            <div style="color: #4B0082; margin-bottom: 10px; font-weight: bold;">الطرف الثاني: ${nameDisplay}</div>
                            <div>الاسم: ${safeString(contactName) || CONTRACT_WIDE_BLANK}</div>
                            <div>الصفة: صاحب النشاط</div>
                            <div style="margin-top: auto; padding-top: 18px;">
                                <div style="font-weight: bold;">توقيع صاحب النشاط: ..............................</div>
                                <div style="margin-top: 14px; font-weight: bold;">الختم:</div>
                                <div style="min-height: 80px; background: #fff;"></div>
                            </div>
                        </div>
                    </div>
                    <!-- Social Footer -->
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #E2E8F0; display: flex; justify-content: center; gap: 20px; align-items: center; flex-wrap: wrap; direction: ltr;">
                        ${socialIcon('kanjo.app.eg', SOCIAL_ICONS.facebook)}
                        ${socialIcon('kanjo.app.eg', SOCIAL_ICONS.instagram)}
                        ${socialIcon('@kanjo.app.eg', SOCIAL_ICONS.tiktok)}
                    </div>
                    <div style="text-align: center; margin-top: 10px; font-size: 11px; color: #64748b; font-weight: bold; direction: rtl;">شركة كاند جوو لخدمات التوصيل والتجارة الإلكترونية - جميع الحقوق محفوظة © ٢٠٢٦</div>
                </div>
            </td></tr>
        </tbody>
    `;

    const coverPage = buildCoverPage({ merchantName: nameDisplay, merchantLogo, logoDataUri, blankTemplate });
    const body = coverPage + printBorderAndWatermark + '<table style="width: 100%; border-collapse: collapse;">' + tableHeader + tableBody + tableFooter + '</table>';

    const title = contractHeading;
    return buildDocument({ title, body, fontFaces: assets.fontFaces, businessType: titleBusinessType, merchantName: nameDisplay });
}

/* Category used for the food/medical conditional clauses. */
function category_source(input) {
    return input && input.category ? input.category : '';
}

/* Full standalone HTML document with the brand styles and the print rules that
   mirror public/style.css (@page A4, 15/15/18mm, centred Arabic page numbers). */
function buildDocument({ title, body, fontFaces, businessType, merchantName }) {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${fontFaces}
    * { box-sizing: border-box; }
    html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
    }
    body {
        direction: rtl;
        text-align: justify;
        font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
        line-height: 1.6;
        color: #1e293b;
        font-size: 14px;
    }
    .contract-parties { background-color: #F8F9FA; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
    .contract-text { font-size: 12.5px; line-height: 1.7; margin-bottom: 10px; padding-right: 4px; }
    .contract-clause-wrapper { page-break-inside: avoid; break-inside: avoid; margin-bottom: 35px; }
    .contract-clause-title {
        font-size: 13.5px;
        font-weight: 800;
        color: #4B0082;
        background-color: #F5F3FF;
        padding: 6px 10px;
        border-right: 4px solid #F59E0B;
        border-radius: 0 6px 6px 0;
        margin-top: 12px;
        margin-bottom: 7px;
        line-height: 1.5;
    }
    img { max-width: 100%; }
    table { page-break-inside: auto; }
    tr, td, th { page-break-inside: avoid; }

    @page {
        size: A4;
        margin: 15mm 15mm 18mm;

        @bottom-center {
            content: "صفحة " counter(page, arabic-indic) " من " counter(pages, arabic-indic);
            font-family: 'Cairo', 'Tahoma', 'Arial', sans-serif;
            font-size: 10pt;
            font-weight: 700;
            color: #4B0082;
            vertical-align: middle;
        }
    }

    @page :first {
        margin: 0 !important;
        /* The cover is not part of the numbered document: reset the page
           counter so the first terms page reads "صفحة ١". */
        counter-reset: page 0;

        @bottom-center {
            content: none;
        }
    }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

module.exports = {
    buildContractHtml,
    normalizeContractInput,
    toArabicNumerals,
    getBaseName,
    sanitizeLegalText,
    KANJO_FIRST_PARTY,
    DESOUK_MERCHANT_IDS
};
