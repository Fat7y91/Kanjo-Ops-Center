import fs from 'fs';
import path from 'path';

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const allJs = walk('public/js').map(f => fs.readFileSync(f, 'utf8')).join('\n');
const html = fs.readFileSync('public/index.html', 'utf8');

// Extract function names from onclick=... including with args
const fromHtml = [...html.matchAll(/\b(?:onclick|onchange|onsubmit|oninput|onkeyup)=["']([a-zA-Z_][\w]*)/g)].map(m => m[1]);
const fromJs = [...allJs.matchAll(/onclick=["']([a-zA-Z_][\w]*)/g)].map(m => m[1]);
// Also goToTask style from template literals
const fromJs2 = [...allJs.matchAll(/\$\{[^}]*\b([a-zA-Z_][\w]*)\s*\(/g)]; // too noisy

const needed = [...new Set([...fromHtml, ...fromJs, 'goToTask', 'notifyManager', 'calculateComm', 'resetReportFields', 'loadFinancialProfilesForAccounting', 'refreshFinancialProfileBanner'])];

const missing = [];
for (const fn of needed.sort()) {
  if (!new RegExp('window\\.' + fn + '\\s*=').test(allJs)) missing.push(fn);
}
console.log('Extra critical MISSING:', missing.length ? missing.join(', ') : 'none');

// Compare total logic size
const monolith = fs.readFileSync('public/app.js', 'utf8');
const modularSize = walk('public/js').reduce((s, f) => s + fs.statSync(f).size, 0);
console.log('Monolith bytes:', monolith.length);
console.log('Modular bytes:', modularSize);
console.log('File count:', walk('public/js').length);
walk('public/js').forEach(f => console.log(' -', f, fs.statSync(f).size));
