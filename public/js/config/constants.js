/* Kanjo Ops — Global Constants */

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

    '8492': { name: 'أ/ محمود', role: 'admin' }, 

    '3715': { name: 'المؤسسين', role: 'founder' }, 

    '5082': { name: 'قسم الحسابات', role: 'accounting' },

    '6204': { name: 'سارة', role: 'rep', team: 'Fox Team' }, 

    '9153': { name: 'مصطفى', role: 'rep', team: 'Fox Team' }, 

    '4827': { name: 'أحمد جمعه', role: 'rep', team: 'Power Team' }, 

    '7591': { name: 'يوسف', role: 'rep', team: 'Power Team' } 

};

const teamMembers = { 'Fox Team': 'سارة، مصطفى', 'Power Team': 'أحمد جمعه، يوسف' };

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
window.KANJO_REP_PAYROLL = KANJO_REP_PAYROLL;

export { userImageMap, teamImageMap, categories, users, teamMembers, KANJO_REP_PAYROLL };
