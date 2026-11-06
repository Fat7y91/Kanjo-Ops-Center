import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";
export const runtime = "edge";

/** Only Google's own image hosts may be proxied — never an open relay. */
const ALLOWED_HOSTS = new Set([
  "lh3.googleusercontent.com",
  "drive.google.com",
  "drive.usercontent.google.com",
  "firebasestorage.googleapis.com",
]);

/** Hosts whose URL is already the direct object and needs no rebuilding. */
const PASSTHROUGH_HOSTS = new Set(["firebasestorage.googleapis.com"]);

/** Rewrites an embeddable Drive reference into the direct image endpoint. */
function upstreamUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return null;

  // Firebase Storage object URLs already point at the bytes; keep them intact.
  if (PASSTHROUGH_HOSTS.has(host)) return parsed.toString();

  const id =
    parsed.searchParams.get("id") ??
    parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    "";
  if (!id) return null;

  const size = parsed.searchParams.get("sz") ?? parsed.searchParams.get("w");
  const width = /^\d+$/.test(size ?? "") ? `=w${size}` : "=w1600";
  return `https://lh3.googleusercontent.com/d/${id}${width}`;
}

/**
 * Same-origin image proxy for Google Drive catalog assets.
 *
 * The Ops Center stores Drive links verbatim, but a browser reaching Google
 * directly can be blocked (offices that filter Google, or a client network that
 * cannot resolve `lh3`). Streaming the bytes from this origin removes that
 * dependency: the `<img>` only ever talks to the app's own host. The URL is
 * rebuilt from an allowlisted Drive host and file id, so the route cannot be
 * turned into a generic fetch relay.
 */
export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const target = new URL(request.url).searchParams.get("url");
  const upstream = target ? upstreamUrl(target) : null;
  if (!upstream) {
    return NextResponse.json({ error: "رابط صورة غير صالح." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(upstream, {
      headers: { Accept: "image/*" },
      redirect: "follow",
    });
  } catch {
    return NextResponse.json({ error: "تعذر جلب الصورة." }, { status: 502 });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: "الصورة غير متاحة." },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  const length = response.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(response.body, { status: 200, headers });
}
