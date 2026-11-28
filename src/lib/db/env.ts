export type EnvSource = Record<string, string | undefined>;

export class MissingEnvError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Missing required environment variable: ${key}`);
    this.name = "MissingEnvError";
    this.key = key;
  }
}

export function optionalEnv(
  key: string,
  source: EnvSource = process.env,
): string | undefined {
  const value = source[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function requireEnv(
  key: string,
  source: EnvSource = process.env,
): string {
  const value = optionalEnv(key, source);
  if (!value) throw new MissingEnvError(key);
  return value;
}

export function requireAnyEnv(
  keys: readonly string[],
  source: EnvSource = process.env,
): string {
  for (const key of keys) {
    const value = optionalEnv(key, source);
    if (value) return value;
  }
  throw new MissingEnvError(keys.join(" or "));
}
