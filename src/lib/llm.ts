import { z } from "zod";

/**
 * Minimal AssemblyAI LLM Gateway client (OpenAI-compatible chat completions).
 * Docs: https://www.assemblyai.com/docs/llm-gateway/quickstart
 *
 * The gateway takes the RAW api key (no Bearer prefix). Model ids are exact,
 * versioned strings — set LLM_MODEL to upgrade (e.g. "claude-sonnet-4-6")
 * once the account has access; the default is the model every account can use.
 */

const GATEWAY_URL = process.env.LLM_GATEWAY_URL ?? "https://llm-gateway.assemblyai.com/v1/chat/completions";
export const LLM_MODEL = process.env.LLM_MODEL ?? "qwen3.5-4b-32k-fast";

type Message = { role: "system" | "user" | "assistant"; content: string };

export class LLMError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export async function chatText(opts: {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<string> {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) throw new LLMError("ASSEMBLYAI_API_KEY is not set");

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: opts.model ?? LLM_MODEL,
          messages: opts.messages,
          max_tokens: opts.maxTokens ?? 800,
          temperature: opts.temperature ?? 0.2,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      });
    } catch (err) {
      // Network failure or timeout — retry with backoff.
      lastErr = new LLMError(`LLM Gateway request failed: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? "";
    }
    const body = await res.text();
    lastErr = new LLMError(`LLM Gateway HTTP ${res.status}: ${body.slice(0, 300)}`, res.status);
    // Retry on rate-limit / server errors only.
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after")) || 1.5 * (attempt + 1);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    throw lastErr;
  }
  throw lastErr instanceof Error ? lastErr : new LLMError("LLM Gateway failed");
}

/** Pull the first JSON object/array out of a model response, tolerating fences, prose and truncation. */
export function extractJson(text: string): unknown {
  let s = text.trim();
  // Strip <think>…</think> blocks some models emit.
  s = s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fence) s = fence[1].trim();
  const start = Math.min(...["{", "["].map((c) => (s.indexOf(c) === -1 ? Infinity : s.indexOf(c))));
  if (!Number.isFinite(start)) throw new Error("No JSON found in model output");
  const endObj = s.lastIndexOf("}");
  const endArr = s.lastIndexOf("]");
  const end = Math.max(endObj, endArr);
  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    // Small models hit max_tokens mid-document. Close whatever is open and try again.
    const repaired = repairTruncatedJson(s.slice(start));
    try {
      return JSON.parse(repaired);
    } catch {
      throw err;
    }
  }
}

/**
 * Best-effort repair for JSON cut off mid-stream: drop a dangling partial
 * token, then close any open strings, arrays and objects.
 */
export function repairTruncatedJson(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastGood = 0; // index just past the last structurally complete value
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') {
        inStr = false;
        lastGood = i + 1;
      }
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      lastGood = i + 1;
    } else if (ch === "," || ch === ":") lastGood = i + 1;
    else if (/[0-9a-z]/i.test(ch)) lastGood = i + 1; // numbers / true / false / null
  }
  let out = inStr ? s : s.slice(0, lastGood);
  if (inStr) out += '"';
  // Remove a trailing comma or a dangling `"key":` before closing.
  out = out.replace(/,\s*$/, "").replace(/,?\s*"[^"]*"\s*:\s*$/, "");
  // Re-derive the open stack for the trimmed string.
  const open: string[] = [];
  let q = false;
  let e = false;
  for (const ch of out) {
    if (q) {
      if (e) e = false;
      else if (ch === "\\") e = true;
      else if (ch === '"') q = false;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === "{" || ch === "[") open.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") open.pop();
  }
  return out + open.reverse().join("");
}

/**
 * Ask for JSON and validate it against a zod schema. Retries once with the
 * validation error fed back to the model.
 */
export async function chatJSON<T>(opts: {
  system?: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<T> {
  const messages: Message[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chatText({
      messages:
        attempt === 0
          ? messages
          : [
              ...messages,
              { role: "assistant", content: lastProblem.slice(0, 2000) },
              {
                role: "user",
                content:
                  "That was not valid JSON matching the required shape. Reply with ONLY the corrected JSON object — no prose, no code fences.",
              },
            ],
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      model: opts.model,
      timeoutMs: opts.timeoutMs,
    });
    if (process.env.LLM_DEBUG) console.log(`[llm] raw (${raw.length} chars):`, raw.slice(0, 400), "…", raw.slice(-300));
    try {
      const parsed = opts.schema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;
      lastProblem = raw;
      console.warn("[llm] schema mismatch", parsed.error.issues.slice(0, 3));
    } catch (err) {
      lastProblem = raw;
      console.warn(`[llm] JSON parse failed (${raw.length} chars)`, err instanceof Error ? err.message : err);
    }
  }
  throw new LLMError("Model did not return valid JSON after retry");
}
