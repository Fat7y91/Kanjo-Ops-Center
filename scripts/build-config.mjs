/**
 * Kanjo Ops — Build-time configuration generator & validator
 * =====================================================================
 * Reads sensitive runtime values from the environment (process.env or a
 * local `.env` file) and writes them into
 * `public/js/config/drive-config.generated.js` — an ES module that the app
 * imports. This keeps credentials OUT of hand-edited source code.
 *
 * Supported variables
 * ---------------------------------------------------------------------
 *   KANJO_DRIVE_SCRIPT_URL   : deployed Google Apps Script `/exec` URL
 *                              that uploads merchant documents to Drive
 *   KANJO_DRIVE_SCRIPT_TOKEN : shared token agreed with scripts/drive/Code.gs
 *
 * Behaviour (zero-downtime by design)
 * ---------------------------------------------------------------------
 *   1. If both env vars are present (CI secrets, `.env`, exported shell):
 *        → values are validated and written into the generated module.
 *   2. If an env var is missing but a previously generated
 *      `drive-config.generated.js` exists with valid values:
 *        → the existing file is PRESERVED and a loud warning is printed.
 *          This keeps the deployed site working during the transition,
 *          even before the CI secrets are configured.
 *   3. If a value IS provided but invalid → the build FAILS FAST.
 *   4. With `--required` and a missing value → the build FAILS FAST.
 *   5. If nothing is available at all → the build FAILS FAST.
 *
 * Usage
 * ---------------------------------------------------------------------
 *   node scripts/build-config.mjs               # regenerate/preserve
 *   node scripts/build-config.mjs --required    # fail fast if missing
 *   node scripts/build-config.mjs --check       # validate only, no write
 *   node scripts/build-config.mjs --env-file /path/to/.env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUT_REL = path.join('public', 'js', 'config', 'drive-config.generated.js');
const OUT_ABS = path.join(root, OUT_REL);

/* ─────────────────────────── tiny .env loader ─────────────────────────── */
/**
 * Parses a dotenv-style file (KEY=value, optional `export ` prefix,
 * `#` comments, single/double quotes) without any external dependency.
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.replace(/^export\s+/, '');
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/** @param {string} filePath @returns {Record<string, string>} */
function loadEnvFile(filePath) {
  try {
    return parseDotenv(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

/* ─────────────────────────────── helpers ──────────────────────────────── */

/** @param {string} message */
function fail(message) {
  console.error('\n[build-config] FATAL: ' + message);
  console.error('[build-config] Regenerate with: node scripts/build-config.mjs');
  process.exit(1);
}

/** @param {string} message */
function warn(message) {
  console.warn('\n[build-config] WARNING: ' + message);
}

const PLACEHOLDER_PATTERN = /^(your[-_]|changeme|change[-_]me|todo|example|xxx|placeholder)/i;

/**
 * Strictly validates a candidate value for a config key.
 * @param {string} key
 * @param {string} value
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateValue(key, value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { ok: false, reason: key + ' is empty' };
  if (trimmed.length < 16) return { ok: false, reason: key + ' looks too short (min 16 chars)' };
  if (PLACEHOLDER_PATTERN.test(trimmed)) {
    return { ok: false, reason: key + ' looks like an unfilled placeholder' };
  }
  if (key === 'KANJO_DRIVE_SCRIPT_URL') {
    let parsed = null;
    try {
      parsed = new URL(trimmed);
    } catch (_) {
      return { ok: false, reason: key + ' is not a valid URL' };
    }
    if (parsed.protocol !== 'https:') {
      return { ok: false, reason: key + ' must use https:' };
    }
    if (!/\.googleusercontent\.com$/.test(parsed.hostname) && !/script\.google\.com/.test(parsed.hostname)) {
      return { ok: false, reason: key + ' does not look like a Google Apps Script Web App URL' };
    }
    if (!/\/exec(\/.*)?$/.test(parsed.pathname)) {
      return { ok: false, reason: key + ' must point to the /exec endpoint of a Web App' };
    }
  }
  return { ok: true };
}

/* ─────────────────────── resolve + validate config ────────────────────── */

/**
 * Reads the currently committed generated file (used as the zero-downtime
 * baseline when an env var is not yet provided).
 * @returns {{ url: string, token: string } | null}
 */
function readBaseline() {
  try {
    const src = fs.readFileSync(OUT_ABS, 'utf8');
    const urlMatch = src.match(/KANJO_DRIVE_SCRIPT_URL\s*=\s*["']([^"']+)["']/);
    const tokenMatch = src.match(/KANJO_DRIVE_SCRIPT_TOKEN\s*=\s*["']([^"']+)["']/);
    if (!urlMatch || !tokenMatch) return null;
    const url = urlMatch[1].replace(/\\"/g, '"');
    const token = tokenMatch[1].replace(/\\"/g, '"');
    return { url, token };
  } catch (_) {
    return null;
  }
}

function writeGenerated(url, token) {
  const body = `/* AUTO-GENERATED by scripts/build-config.mjs — DO NOT EDIT. */
/* Runtime values are injected from the environment (CI secrets / .env) at
   build time so credentials never live in hand-edited source. See
   scripts/build-config.mjs and .env.example. */

const KANJO_DRIVE_SCRIPT_URL = ${JSON.stringify(url)};

const KANJO_DRIVE_SCRIPT_TOKEN = ${JSON.stringify(token)};

window.KANJO_DRIVE_SCRIPT_URL = KANJO_DRIVE_SCRIPT_URL;

window.KANJO_DRIVE_SCRIPT_TOKEN = KANJO_DRIVE_SCRIPT_TOKEN;

export { KANJO_DRIVE_SCRIPT_URL, KANJO_DRIVE_SCRIPT_TOKEN };
`;
  fs.writeFileSync(OUT_ABS, body, 'utf8');
  console.log('\n[build-config] Wrote ' + OUT_REL);
}

/* ───────────────────────────────── main ───────────────────────────────── */

const args = process.argv.slice(2);
const required = args.includes('--required');
const checkOnly = args.includes('--check');
let envFilePath = path.join(root, '.env');
const envFlagIndex = args.indexOf('--env-file');
if (envFlagIndex !== -1 && args[envFlagIndex + 1]) {
  envFilePath = path.resolve(args[envFlagIndex + 1]);
}

const fileEnv = loadEnvFile(envFilePath);
const providedUrl = String(process.env.KANJO_DRIVE_SCRIPT_URL || fileEnv.KANJO_DRIVE_SCRIPT_URL || '').trim();
const providedToken = String(process.env.KANJO_DRIVE_SCRIPT_TOKEN || fileEnv.KANJO_DRIVE_SCRIPT_TOKEN || '').trim();

const urlPresent = Boolean(providedUrl);
const tokenPresent = Boolean(providedToken);

if (required && !urlPresent) fail('KANJO_DRIVE_SCRIPT_URL is missing (set it in CI secrets, .env, or the shell).');
if (required && !tokenPresent) fail('KANJO_DRIVE_SCRIPT_TOKEN is missing (set it in CI secrets, .env, or the shell).');

/* Validate whatever was provided — an invalid value always fails fast. */
if (urlPresent) {
  const r = validateValue('KANJO_DRIVE_SCRIPT_URL', providedUrl);
  if (!r.ok) fail('Invalid KANJO_DRIVE_SCRIPT_URL: ' + r.reason);
}
if (tokenPresent) {
  const r = validateValue('KANJO_DRIVE_SCRIPT_TOKEN', providedToken);
  if (!r.ok) fail('Invalid KANJO_DRIVE_SCRIPT_TOKEN: ' + r.reason);
}

/* Choose the source of truth, honouring zero-downtime for the transition. */
let finalUrl = '';
let finalToken = '';
let source = '';

if (urlPresent && tokenPresent) {
  finalUrl = providedUrl;
  finalToken = providedToken;
  source = 'environment';
} else {
  const baseline = readBaseline();
  if (baseline) {
    const bUrlOk = validateValue('KANJO_DRIVE_SCRIPT_URL', baseline.url).ok;
    const bTokenOk = validateValue('KANJO_DRIVE_SCRIPT_TOKEN', baseline.token).ok;
    if (bUrlOk && bTokenOk) {
      finalUrl = baseline.url;
      finalToken = baseline.token;
      source = 'baseline (committed generated file)';
      if (urlPresent || tokenPresent) {
        warn(
          'Only one of the two env vars was provided; using the committed ' +
          'baseline for BOTH. Set both KANJO_DRIVE_SCRIPT_URL and ' +
          'KANJO_DRIVE_SCRIPT_TOKEN to avoid surprises.'
        );
      } else {
        warn(
          'Env vars not set — reusing the committed baseline ' + OUT_REL + ' for ' +
          'zero-downtime deploys. To enforce strict configuration, set the CI ' +
          'secrets and run with --required.'
        );
      }
    } else {
      fail('Committed baseline ' + OUT_REL + ' is invalid and no env vars were provided.');
    }
  } else {
    fail(
      'No env values for KANJO_DRIVE_SCRIPT_URL / KANJO_DRIVE_SCRIPT_TOKEN and no ' +
      'baseline at ' + OUT_REL + '. Refusing to build a broken config.'
    );
  }
}

console.log('\n[build-config] Config source : ' + source);
console.log('[build-config] URL            : ' + (urlPresent || source === 'environment' ? finalUrl : finalUrl));
console.log('[build-config] Token          : ' + (finalToken ? finalToken.slice(0, 4) + '…' + finalToken.slice(-2) + ' (masked)' : '(empty)'));

if (checkOnly) {
  console.log('\n[build-config] OK — configuration is valid.\n');
  process.exit(0);
}

writeGenerated(finalUrl, finalToken);
console.log('[build-config] Done.\n');
