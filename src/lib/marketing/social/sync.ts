import {
  listPlatformSettingsRows,
  readPlatformCredentials,
} from "../repository";
import { fetchMetaAccounts, fetchTikTokAccounts } from "./providers";
import {
  insertSocialMetricRows,
  latestSocialCapturedAt,
} from "./repository";
import type { SocialAccount, SocialSyncResult } from "./types";

const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

type CredentialPlatform = "meta" | "tiktok" | "snapchat";

const READABLE = new Set<string>(["meta", "tiktok", "snapchat"]);
const SUPPORTED = new Set<string>(["meta", "tiktok"]);

async function accountsFor(
  platform: string,
  credentials: Readonly<Record<string, string>>,
): Promise<SocialAccount[]> {
  if (platform === "meta") return fetchMetaAccounts(credentials);
  if (platform === "tiktok") return fetchTikTokAccounts(credentials);
  return [];
}

export type SocialSyncOutcome = {
  results: SocialSyncResult[];
  inserted: number;
};

export async function syncSocialMetrics(
  capturedBy: string | null,
): Promise<SocialSyncOutcome> {
  const settings = await listPlatformSettingsRows();
  const enabled = settings.filter((setting) => setting.enabled);
  const results: SocialSyncResult[] = [];
  let inserted = 0;

  for (const setting of enabled) {
    if (!READABLE.has(setting.platform)) continue;
    const platform = setting.platform as CredentialPlatform;
    if (!SUPPORTED.has(platform)) {
      results.push({
        platform,
        ok: false,
        accounts: 0,
        error:
          platform === "snapchat"
            ? "Snapchat Marketing API لا يوفّر متابعي الحساب العضوي."
            : "هذه المنصة لا توفّر متابعي حساب عضوي عبر واجهة الإعلانات.",
      });
      continue;
    }

    try {
      const credentials = await readPlatformCredentials(platform);
      const accounts = await accountsFor(platform, credentials);
      const count = await insertSocialMetricRows(accounts, capturedBy);
      inserted += count;
      results.push({ platform, ok: true, accounts: count });
    } catch (error) {
      results.push({
        platform,
        ok: false,
        accounts: 0,
        error:
          error instanceof Error ? error.message : "تعذر تحديث أرقام المنصة.",
      });
    }
  }

  return { results, inserted };
}

export async function refreshSocialMetricsIfStale(
  capturedBy: string | null,
): Promise<{ skipped: boolean } & SocialSyncOutcome> {
  const settings = await listPlatformSettingsRows();
  const enabled = settings.filter(
    (setting) => setting.enabled && SUPPORTED.has(setting.platform),
  );
  if (enabled.length === 0) {
    return { skipped: true, results: [], inserted: 0 };
  }

  const latest = await latestSocialCapturedAt();
  if (latest && Date.now() - Date.parse(latest) < REFRESH_AFTER_MS) {
    return { skipped: true, results: [], inserted: 0 };
  }

  return { skipped: false, ...(await syncSocialMetrics(capturedBy)) };
}
