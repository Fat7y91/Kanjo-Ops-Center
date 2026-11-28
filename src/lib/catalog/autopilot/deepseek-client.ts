import "server-only";

/**
 * Shared DeepSeek chat completion transport.
 *
 * Returns the raw assistant content, or null when the key is absent, the call
 * fails or the upstream answer is empty. Callers keep their own prompts and
 * validation so a provider outage degrades to local rules instead of failing
 * the whole import batch.
 */
export async function fetchDeepSeekContent(
  system: string,
  user: string,
): Promise<string | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
    .replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(35_000),
    });
  } catch (error) {
    console.error("[autopilot] deepseek request failed", error);
    return null;
  }

  if (!response.ok) {
    console.error(`[autopilot] deepseek status ${response.status}`);
    return null;
  }

  try {
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return payload.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
