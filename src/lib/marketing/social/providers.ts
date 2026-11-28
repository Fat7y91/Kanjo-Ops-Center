import type { SocialAccount } from "./types";

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 7000;

type MetaPage = {
  id?: string;
  name?: string;
  followers_count?: number;
  fan_count?: number;
  instagram_business_account?: {
    id?: string;
    username?: string;
    followers_count?: number;
  };
};

type MetaList = {
  data?: MetaPage[];
  error?: { message?: string };
};

const PAGE_FIELDS =
  "id,name,followers_count,fan_count,instagram_business_account{id,username,followers_count}";
const PAGE_FIELDS_BASIC = "id,name,followers_count,fan_count";

async function graphGet(
  path: string,
  accessToken: string,
  fields: string,
): Promise<MetaPage | MetaPage[]> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  const body = (await response.json().catch(() => null)) as
    | MetaList
    | MetaPage
    | null;

  if (!response.ok) {
    const message =
      body && "error" in body && body.error?.message
        ? body.error.message
        : "تعذر قراءة بيانات Meta.";
    throw new Error(message);
  }
  if (body && "error" in body && body.error?.message) {
    throw new Error(body.error.message);
  }
  if (Array.isArray((body as MetaList | null)?.data)) {
    return (body as MetaList).data ?? [];
  }
  return (body ?? {}) as MetaPage;
}

function toAccounts(page: MetaPage): SocialAccount[] {
  if (!page.id) return [];
  const followers = page.followers_count ?? page.fan_count ?? 0;
  const likes = page.fan_count ?? 0;
  const accounts: SocialAccount[] = [
    {
      platform: "meta",
      accountId: page.id,
      accountName: page.name || page.id,
      followers,
      likes,
    },
  ];

  const instagram = page.instagram_business_account;
  if (instagram?.id) {
    accounts.push({
      platform: "instagram",
      accountId: instagram.id,
      accountName: instagram.username || instagram.id,
      followers: instagram.followers_count ?? 0,
      likes: 0,
    });
  }
  return accounts;
}

export async function fetchMetaAccounts(
  credentials: Readonly<Record<string, string>>,
): Promise<SocialAccount[]> {
  const accessToken = (credentials.accessToken ?? "").trim();
  if (!accessToken) throw new Error("رمز وصول Meta غير محفوظ.");

  const pageId = (credentials.pageId ?? "").trim();
  const path = pageId || "me/accounts";

  let payload: MetaPage | MetaPage[];
  try {
    payload = await graphGet(path, accessToken, PAGE_FIELDS);
  } catch {
    payload = await graphGet(path, accessToken, PAGE_FIELDS_BASIC);
  }

  const pages = Array.isArray(payload) ? payload : [payload];
  return pages.flatMap(toAccounts);
}

type TikTokUser = {
  open_id?: string;
  display_name?: string;
  follower_count?: number;
  likes_count?: number;
};

type TikTokResponse = {
  data?: { user?: TikTokUser };
  error?: { code?: string; message?: string };
};

export async function fetchTikTokAccounts(
  credentials: Readonly<Record<string, string>>,
): Promise<SocialAccount[]> {
  const accessToken = (credentials.accessToken ?? "").trim();
  if (!accessToken) throw new Error("رمز وصول TikTok غير محفوظ.");

  const url = new URL("https://open.tiktokapis.com/v2/user/info/");
  url.searchParams.set(
    "fields",
    "open_id,display_name,follower_count,likes_count",
  );

  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = (await response.json().catch(() => null)) as
    | TikTokResponse
    | null;

  if (!response.ok) {
    throw new Error(body?.error?.message || "تعذر قراءة بيانات TikTok.");
  }
  if (body?.error?.code && body.error.code !== "ok") {
    throw new Error(body.error.message || "رفض TikTok قراءة بيانات الحساب.");
  }

  const user = body?.data?.user;
  if (!user?.open_id) throw new Error("لم يُرجع TikTok حساباً متاحاً.");

  return [
    {
      platform: "tiktok",
      accountId: user.open_id,
      accountName: user.display_name || "TikTok",
      followers: Number(user.follower_count ?? 0),
      likes: Number(user.likes_count ?? 0),
    },
  ];
}
