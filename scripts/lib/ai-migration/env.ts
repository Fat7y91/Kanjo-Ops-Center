import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvLocal(): void {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${key}`);
  return value.trim();
}

export function optionalEnv(key: string): string {
  return String(process.env[key] ?? '').trim();
}

export function redactError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of ['DEEPSEEK_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const value = process.env[key];
    if (value) message = message.split(value).join('[redacted]');
  }
  return message;
}
