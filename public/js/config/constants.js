/* Kanjo Ops — Global Constants */

import { KANJO_DRIVE_SCRIPT_URL, KANJO_DRIVE_SCRIPT_TOKEN } from './drive-config.generated.js';

const userImageMap = {

    'سارة': 'Sara Zabady.png',

    'مصطفى': 'Mostafa ibrahim.png',

    'أحمد جمعه': 'Ahmed Gomaa.png',

    'يوسف': 'YOUSEF AYMAN.png'

};



const teamImageMap = {

    'Fox Team': 'Fox Team.png',

    'Power Team': 'Power Team.png'

};

const categories = ["🍔 مطاعم وكافيهات", "🛒 سوبر ماركت", "💊 صيدليات وعناية شخصية", "🐟 أسماك", "🍽️ أطقم صيني", "🔌 أدوات كهربائية", "🧹 أدوات نظافة", "📱 إكسسوارات موبايل", "📦 بيع جملة وقطاعي", "🥩 جزارة", "🍎 خضار وفاكهة", "🍗 دواجن", "🔧 سباكة", "🛠️ صيانة وخدمات منزلية", "🍹 عصائر فريش", "🌿 عطارة وتوابل", "⚡ فني كهرباء", "💄 كوزماتكس", "🎮 كنترول", "🧸 لعب أطفال", "🧀 لبنة برازيلي", "🥐 مخبوزات", "🐾 مستلزمات الحيوانات الأليفة", "🍳 مستلزمات المطبخ", "🥜 مسليات", "🛏️ مفروشات", "📚 مكتبات", "⚽ ملابس وأدوات رياضية", "🧼 منظفات", "🎁 هدايا", "💐 ورود", "🍰 حلويات"];

const users = { 

    '8492': { name: 'أ/ محمود', role: 'admin', kanjoBlackBox: true }, 

    '3715': { name: 'المؤسسين', role: 'founder' }, 

    '5082': { name: 'قسم الحسابات', role: 'accounting' },

    '6204': { name: 'سارة', role: 'rep', team: 'Fox Team' }, 

    '9153': { name: 'مصطفى', role: 'rep', team: 'Fox Team' }, 

    '4827': { name: 'أحمد جمعه', role: 'rep', team: 'Power Team' }, 

    '7591': { name: 'يوسف', role: 'rep', team: 'Power Team' },

    '2468': { name: 'يوزر إدخال البيانات', role: 'data_entry' },

    '8899': { name: 'مكتب التسويق', role: 'marketing' },

    /* Product review & audit team (مراجعة وتدقيق المنتجات). Read + update
       across every merchant/vendor catalog so typos, variants, prices,
       descriptions and images can be refined before launch, but NEVER delete.
       Enforced client-side (no delete controls) and server-side
       (firestore.rules grants update only). */
    '3141': { name: 'مراجعة وتدقيق المنتجات', role: 'product_audit' }

};

/* PIN that unlocks the product-audit account, kept as a named constant so any
   future guard can share a single source of truth. */
const PRODUCT_AUDIT_PIN = '3141';

/* PIN that unlocks the integrated marketing view inside the main dashboard
   (بوابة التسويق). Kept as a named constant so the login routing and the
   marketing section's access helper share a single source of truth. */
const MARKETING_PIN = '8899';

const teamMembers = { 'Fox Team': 'سارة، مصطفى', 'Power Team': 'أحمد جمعه، يوسف' };

/* ─── Google Drive Integration (Merchant Documents) ───
   KANJO_DRIVE_SCRIPT_URL   : URL of the deployed Google Apps Script Web App
                              (…/exec endpoint) that creates the merchant folder
                              on Google Drive and uploads the documents.
   KANJO_DRIVE_SCRIPT_TOKEN : Shared token agreed between the app and the Apps
                              Script code (see scripts/drive/Code.gs). It is NOT
                              a security boundary — it only stops casual callers.
   Both values are imported from `./drive-config.generated.js`, which is written
   at build time by scripts/build-config.mjs from environment variables (CI
   secrets or .env), so credentials are never hardcoded in source. If empty, the
   upload feature is disabled and the UI shows a clear message instead of
   failing silently. */

/** أساسيات رواتب المناديب (مصدر موحّد للحسابات والتصدير) */
const KANJO_REP_PAYROLL = [
    { name: 'سارة', team: 'Fox Team', base: 5000 },
    { name: 'مصطفى', team: 'Fox Team', base: 5000 },
    { name: 'أحمد جمعه', team: 'Power Team', base: 5000 },
    { name: 'يوسف', team: 'Power Team', base: 3000 }
];

window.userImageMap = userImageMap;
window.teamImageMap = teamImageMap;
window.categories = categories;
window.users = users;
window.teamMembers = teamMembers;
window.MARKETING_PIN = MARKETING_PIN;
window.PRODUCT_AUDIT_PIN = PRODUCT_AUDIT_PIN;
window.KANJO_REP_PAYROLL = KANJO_REP_PAYROLL;
window.KANJO_DRIVE_SCRIPT_URL = KANJO_DRIVE_SCRIPT_URL;
window.KANJO_DRIVE_SCRIPT_TOKEN = KANJO_DRIVE_SCRIPT_TOKEN;
window.KANJO_CATALOG_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzuhM_6hVjfAEUvWmLkLRKCKGunp_h1DRy722Sz5AIWiLpxgLElOgad5W0TcUz0RHhg/exec";

export { userImageMap, teamImageMap, categories, users, teamMembers, MARKETING_PIN, PRODUCT_AUDIT_PIN, KANJO_REP_PAYROLL, KANJO_DRIVE_SCRIPT_URL, KANJO_DRIVE_SCRIPT_TOKEN };
