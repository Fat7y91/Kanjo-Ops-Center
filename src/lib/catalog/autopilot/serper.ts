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

function validBarcode(value: string): boolean {
  return /^\d{8,14}$/.test(value.trim());
}

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
 * Tier 3: exact barcode first, then DeepSeek's clean query, then a locally
 * cleaned name. Returns the first high-confidence product photo.
 */
export async function findWebProductImage(input: {
  barcode: string;
  query: string | null;
  name: string;
  unit: string;
}): Promise<WebImageMatch | null> {
  if (!process.env.SERPER_API_KEY) return null;

  const queries: string[] = [];
  if (validBarcode(input.barcode)) queries.push(input.barcode.trim());

  const cleaned =
    (input.query ?? "").trim() ||
    cleanImageQuery(input.name, input.unit);
  if (cleaned.length >= 3) queries.push(cleaned);
  if (!queries.includes(input.name) && input.name.trim().length >= 3) {
    queries.push(input.name.trim());
  }

  // At most two searches per item: a 20-item batch stays under the edge
  // runtime's outbound subrequest ceiling.
  for (const query of queries.slice(0, 2)) {
    const images = await searchImages(query);
    const selected = selectProductImage(images);
    if (selected) return { ...selected, query };
  }
  return null;
}
