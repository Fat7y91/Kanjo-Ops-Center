/* ============================================================================
   Qema / Kanjo Dashboard taxonomy — STATIC, IN-MEMORY, ZERO READS.
   ----------------------------------------------------------------------------
   Single source of truth for the export pipeline's smart taxonomy enforcement.
   Nothing here is ever fetched from Firestore; the whole file is a plain
   in-memory constant set so exports are synchronous and deterministic.

   Exposed on `window.QEMA_TAXONOMY` (the app loads every service as an ES module
   from main.js / dashboard.html, so catalog.js reads it at call time without a
   static import — which keeps catalog.js runnable in the vm-based test harness).
   ============================================================================ */

/* Merchant activity label -> Qema dashboard vendor type. */
export const VENDOR_TYPE_MAPPING = {
  "حلويات": "الحلو",
  "مطعم": "مطعم",
  "كافيه": "قهوة وعصاير",
  "عطارة": "محمصة وعطارة",
  "خضار": "خضار وفاكهة",
  "سوبر ماركت": "سوبر ماركت",
  "صيدلية": "صيدلية",
  "مكتبة": "مكتبات وهدايا",
  "بيطري": "ادوية بيطرية",
  "كهرباء": "أدوات كهربائية",
  "مخبز": "مخبز",
  "جزارة": "جزارة ودواجن وأسماك",
  "تجميل": "مستحضرات التجميل",
  "منظفات": "منظفات",
  "موبايلات": "موبايلات واكسسوارات"
};

/* Qema vendor type -> { categoryName: 'ID:n' }. Only the categories listed for a
   vendor are legal for that vendor; anything else is rejected by the importer. */
export const DASHBOARD_CATEGORIES_TAXONOMY = {
  "الحلو": {"أم علي": "ID:175","بان كيك": "ID:173","زلابيا": "ID:170","سينابون": "ID:169","طواجن": "ID:171","فريسكا": "ID:168","كريب": "ID:166","كيك": "ID:174","مشروبات": "ID:176","آيس كوفي": "ID:184","بوبا": "ID:178","زبادو": "ID:179","سموذي": "ID:180","صودا": "ID:182","عصير": "ID:183","فرابيه": "ID:185","ماتشا": "ID:177","ميلك شيك": "ID:181","مولتن": "ID:167","وافل": "ID:172"},
  "مطعم": {"إضافات": "ID:149","اللمة": "ID:163","برجر": "ID:12","بطاطس": "ID:165","بيتي": "ID:148","طواجن": "ID:150","عروض": "ID:152","فراخ": "ID:164","فطائر": "ID:161","كرسبي": "ID:8","كشري": "ID:151","مشروبات": "ID:17","مقبلات": "ID:147","مشويات": "ID:9","أسماك": "ID:10","حواوشي": "ID:7","مصري": "ID:11","بيتزا": "ID:15","شاورما": "ID:14","ساندوتشات": "ID:4","باستا": "ID:1","كريب": "ID:13","سلطات": "ID:16","حلويات": "ID:37"},
  "محمصة وعطارة": {"تمور": "ID:160","مكسرات": "ID:128","محمص": "ID:129","التسالي": "ID:130","البهارات": "ID:131","الأعشاب": "ID:132","البقوليات": "ID:133","العسل": "ID:134","مجفف": "ID:135","القهوة": "ID:136","السناكس": "ID:137","الخلطات": "ID:138"},
  "خضار وفاكهة": {"تمور": "ID:159","الخضار": "ID:139","خضرة": "ID:140","للطبخ": "ID:141","الفاكهة": "ID:142","الموسمية": "ID:143","عضوي": "ID:146","مستوردة": "ID:144","مجهزة": "ID:145"},
  "قهوة وعصاير": {"كيك": "ID:156","وافل": "ID:157","قهوة": "ID:40","باردة": "ID:41","فريش": "ID:42","الساخن": "ID:43","ميلك شيك": "ID:44","سموزي": "ID:45","كوكتيل": "ID:46","حلويات": "ID:47"},
  "سوبر ماركت": {"مجمدات": "ID:153","توفير": "ID:28","بقالة": "ID:32","ثلاجة": "ID:29","تسالي": "ID:33","لحوم": "ID:31","طازج": "ID:38","مشروبات": "ID:34","منظفات": "ID:35","مخبوزات": "ID:30","ورقيات": "ID:36"},
  "صيدلية": {"مسكنات": "ID:18","مزمنة": "ID:20","الأطفال": "ID:24","حفاضات": "ID:155","المرأة": "ID:27","الشخصية": "ID:23","فيتامينات": "ID:25","البشرة": "ID:21","الشعر": "ID:22","مستلزمات": "ID:26","الأم": "ID:39","المناعة": "ID:19"},
  "مكتبات وهدايا": {"مدرسية": "ID:57","مكتبية": "ID:58","الرسم": "ID:59","اكسسوارات": "ID:60","المناسبات": "ID:61","نسائية": "ID:62","رجالية": "ID:63","أطفال": "ID:65","بوكسات": "ID:66","منزلية": "ID:67"},
  "ادوية بيطرية": {"الأدوية": "ID:118","الحشرات": "ID:119","كلاب": "ID:120","قطط": "ID:121","الطيور": "ID:122","أعلاف": "ID:123","العناية": "ID:124","مستلزمات": "ID:125","سبلايز": "ID:126","المزارع": "ID:127"},
  "أدوات كهربائية": {"الإضاءة": "ID:100","المشترك": "ID:101","البطاريات": "ID:102","الأدوات": "ID:103","مستلزمات": "ID:104","الأجهزة": "ID:105","للسيارات": "ID:106","كشافات": "ID:107"},
  "مخبز": {"الخبز": "ID:48","المعجنات": "ID:49","الفطائر": "ID:50","حلويات": "ID:51","كيك": "ID:52","بسكوت": "ID:53","ساندوتشات": "ID:54","شرقي": "ID:55","صحي": "ID:56"},
  "جزارة ودواجن وأسماك": {"لحوم": "ID:79","قطعيات": "ID:84","مجهزة": "ID:81","حلويات": "ID:82","فراخ": "ID:83","متبل": "ID:85","طيور": "ID:86","أسماك": "ID:87","فيليه": "ID:88","سي فود": "ID:89","مجمدات": "ID:91"},
  "مستحضرات التجميل": {"ماكياج": "ID:108","البشرة": "ID:109","الشعر": "ID:110","الأظافر": "ID:111","العطور": "ID:112","الجسم": "ID:113","رموش": "ID:114","مستلزمات": "ID:115","الشفاه": "ID:116","بوكسات": "ID:117"},
  "منظفات": {"الملابس": "ID:92","المطبخ": "ID:93","الحمام": "ID:94","الأسطح": "ID:95","معطرات": "ID:96","مستلزمات": "ID:97","العشرات": "ID:98","الأطفال": "ID:99","حفاضات": "ID:158"},
  "موبايلات واكسسوارات": {"موبايلات": "ID:68","جرابات": "ID:69","شواحن": "ID:70","باوربانك": "ID:71","سماعات": "ID:72","للسيارات": "ID:73","سمارت": "ID:74","اكسسوارات": "ID:75","التصوير": "ID:76","جيمنج": "ID:77","مستلزمات": "ID:78"}
};

/* Qema variant attribute groups -> { id, options: { optionName: 'ATTR:<valueId>' } }.
   Dictionaries are the dashboard spec verbatim. The exported cells are:
     attribute name  = `ID:<groupId> | <groupName>`
     attribute value = `ID:<valueId> | ATTR:<groupId> | <optionName>` */
export const DASHBOARD_VARIANTS_TAXONOMY = {
  "الحجم": {"id": "ID:1", "options": {"صغير": "ATTR:1","وسط": "ATTR:2","كبير": "ATTR:3","جامبو": "ATTR:4","صاروخ": "ATTR:5","شرقي": "ATTR:6","سنجل": "ATTR:48","عائلي": "ATTR:49","دبل": "ATTR:50","اكس لارج": "ATTR:51","دبل لارج": "ATTR:56"}},
  "الطعم": {"id": "ID:2", "options": {"عادي": "ATTR:7","حار": "ATTR:8"}},
  "نوع العيش": {"id": "ID:3", "options": {"عيش سوري": "ATTR:9","عيش فينو": "ATTR:10","بلدي": "ATTR:44","فرنساوي": "ATTR:45","كيزر": "ATTR:46","سادة": "ATTR:47"}},
  "الصوص": {"id": "ID:4", "options": {"صوص أحمر": "ATTR:11","صوص أبيض": "ATTR:12"}},
  "تحويجة القهوة": {"id": "ID:5", "options": {"سادة": "ATTR:13","محوج": "ATTR:14","فاتح": "ATTR:15","غامق": "ATTR:16","مشكل": "ATTR:17","تركي": "ATTR:18","كويتي": "ATTR:19","العميد": "ATTR:20","ديل": "ATTR:21","بندق": "ATTR:22"}},
  "الوزن": {"id": "ID:6", "options": {"جرام": "ATTR:23","ثمن كيلو": "ATTR:24","ربع كيلو": "ATTR:25","نص كيلو": "ATTR:26","750 جرام": "ATTR:27","كيلو": "ATTR:28"}},
  "حجم العبوة": {"id": "ID:7", "options": {"10 ملل": "ATTR:29","20 ملل": "ATTR:30","30 ملل": "ATTR:31","40 ملل": "ATTR:32","50 ملل": "ATTR:33","60 ملل": "ATTR:34","70 ملل": "ATTR:35","80 ملل": "ATTR:36","90 ملل": "ATTR:37","100 ملل": "ATTR:38"}},
  "العدد": {"id": "ID:8", "options": {"قطعتين": "ATTR:39","3 قطع": "ATTR:40","4 قطع": "ATTR:41","5 قطع": "ATTR:42","بوكس 6 قطع": "ATTR:43","8 قطع": "ATTR:57","10 قطع": "ATTR:58","12 قطعة": "ATTR:59","14 قطعة": "ATTR:60","15 قطعة": "ATTR:61","16 قطعة": "ATTR:62","18 قطعة": "ATTR:63","20 قطعة": "ATTR:64","25 قطعة": "ATTR:65","30 قطعة": "ATTR:66","35 قطعة": "ATTR:67"}},
  "نوع العجينة": {"id": "ID:9", "options": {"شرقي": "ATTR:52","إيطالي": "ATTR:53","عادي": "ATTR:54","ملفوف": "ATTR:55"}}
};

/* Real merchant_products.category values in THIS app are emoji-prefixed and can
   combine verticals (e.g. "🍔 مطاعم وكافيهات" contains both مطعم and كافيه, which
   the source map sends to different Qema types). This alias table makes the
   resolution deterministic for every value actually present in the data. */
export const APP_VENDOR_TYPE_ALIASES = {
  "🍔 مطاعم وكافيهات": "مطعم",
  "مطاعم وكافيهات": "مطعم",
  "مطاعم": "مطعم",
  "كافيهات": "كافيه",
  "🍰 حلويات": "حلويات",
  "💄 كوزماتكس": "تجميل",
  "كوزماتكس": "تجميل",
  "🥐 مخبوزات": "مخبز",
  "مخبوزات": "مخبز",
  "🐟 أسماك": "جزارة",
  "أسماك": "جزارة",
  "🥩 جزارة": "جزارة",
  "📱 إكسسوارات موبايل": "موبايلات",
  "إكسسوارات موبايل": "موبايلات",
  "🐾 مستلزمات الحيوانات الأليفة": "بيطري",
  "مستلزمات الحيوانات الأليفة": "بيطري",
  "💊 صيدليات وعناية شخصية": "صيدلية",
  "صيدليات وعناية شخصية": "صيدلية"
};

/* Collision resolver. Some option names exist in more than one attribute group
   (شرقي: الحجم vs نوع العجينة, عادي: الطعم vs نوع العجينة, سادة: نوع العيش vs
   تحويجة القهوة). Most-specific-first order reproduces the live alias semantics:
   a bare "عادي" is a taste (never a crust), a bare "سادة" is a coffee blend
   (never bread), and "شرقي" is a crust (never a size). */
export const QEMA_VARIANT_GROUP_PRIORITY = [
  "تحويجة القهوة",
  "الطعم",
  "الصوص",
  "نوع العجينة",
  "نوع العيش",
  "الوزن",
  "حجم العبوة",
  "العدد",
  "الحجم"
];

/* In-memory auto-translation for data-entry shorthand. Before strict validation
   the export swaps common English/Latin abbreviations and attribute labels for
   their official Arabic values, so "M"/"L"/"XL" pass as وسط/كبير/اكس لارج
   instead of triggering the unmapped-variant halt. Never fetched from the DB. */
export const VARIANT_ALIASES = {
  names: {
    "size": "الحجم", "مقاس": "الحجم", "الحجم": "الحجم"
  },
  options: {
    "s": "صغير", "small": "صغير", "ص": "صغير",
    "m": "وسط", "medium": "وسط", "و": "وسط",
    "l": "كبير", "large": "كبير", "ك": "كبير",
    "xl": "اكس لارج", "x-large": "اكس لارج"
  }
};

if (typeof window !== 'undefined') {
  window.QEMA_TAXONOMY = {
    VENDOR_TYPE_MAPPING,
    DASHBOARD_CATEGORIES_TAXONOMY,
    DASHBOARD_VARIANTS_TAXONOMY,
    APP_VENDOR_TYPE_ALIASES,
    QEMA_VARIANT_GROUP_PRIORITY,
    VARIANT_ALIASES
  };
}
