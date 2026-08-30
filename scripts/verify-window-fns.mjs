import fs from 'fs';
import path from 'path';

const html = fs.readFileSync('public/dashboard.html', 'utf8');
const onclicks = [...html.matchAll(/onclick="([a-zA-Z_][\w]*)\s*\(/g)].map(m => m[1]);
const unique = [...new Set(onclicks)].sort();

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
const missing = [];
for (const fn of unique) {
  const re = new RegExp('window\\.' + fn + '\\s*=');
  if (!re.test(allJs)) missing.push(fn);
  else console.log('OK', fn);
}
console.log('\nTotal onclick handlers:', unique.length);
console.log('MISSING:', missing.length ? missing.join(', ') : 'none');

const others = [...html.matchAll(/on(?:change|submit|input|keyup)="([a-zA-Z_][\w]*)\s*\(/g)].map(m => m[1]);
const otherUnique = [...new Set(others)];
const missing2 = [];
for (const fn of otherUnique) {
  const re = new RegExp('window\\.' + fn + '\\s*=');
  if (!re.test(allJs)) missing2.push(fn);
  else console.log('OK-event', fn);
}
console.log('Other event MISSING:', missing2.length ? missing2.join(', ') : 'none');

const dyn = [...allJs.matchAll(/onclick=["']([a-zA-Z_][\w]*)/g)].map(m => m[1]);
const dynUnique = [...new Set(dyn)].sort();
const missing3 = [];
for (const fn of dynUnique) {
  const re = new RegExp('window\\.' + fn + '\\s*=');
  if (!re.test(allJs)) missing3.push(fn);
  else console.log('OK-dyn', fn);
}
console.log('Dynamic MISSING:', missing3.length ? missing3.join(', ') : 'none');
console.log('Dynamic count:', dynUnique.length);
