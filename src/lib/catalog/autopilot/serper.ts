import "server-only";

import {
  cleanImageQuery,
  selectProductImage,
  type SerperImage,
} from "./web-image";

export type WebImageMatch = {
  url: string;
  title: string;
  query: string;
};

async function searchImages(query: string): Promise<SerperImage[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key || !query.trim()) return [];

  let response: Response;
  try {
    response = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 10,
        gl: "eg",
        hl: "ar",
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("[autopilot] serper request failed", error);
    return [];
  }

  if (!response.ok) {
    console.error(`[autopilot] serper status ${response.status}`);
    return [];
  }

  try {
    const payload = (await response.json()) as { images?: SerperImage[] };
    return Array.isArray(payload.images) ? payload.images : [];
  } catch {
    return [];
  }
}

/**
 * Tier 3: DeepSeek's clean Arabic name/brand query, then a locally cleaned
 * name. Barcodes are never searched: an EAN prefix can match an unrelated
 * brand, and local scale codes are not globally unique.
 */
export async function findWebProductImage(input: {
  barcode: string;
  query: string | null;
  name: string;
  unit: string;
}): Promise<WebImageMatch | null> {
  if (!process.env.SERPER_API_KEY) return null;

  const queries: string[] = [];
  const cleaned =
    (input.query ?? "").trim() ||
    cleanImageQuery(input.name, input.unit);
  if (cleaned.length >= 3) queries.push(cleaned);
  const localQuery = cleanImageQuery(input.name, input.unit);
  if (localQuery.length >= 3 && !queries.includes(localQuery)) {
    queries.push(localQuery);
  }

  // At most two searches per item: a 20-item batch stays under the edge
  // runtime's outbound subrequest ceiling.
  for (const query of queries.slice(0, 2)) {
    const images = await searchImages(query);
    const selected = selectProductImage(images, query);
    if (selected) return { ...selected, query };
  }
  return null;
}
