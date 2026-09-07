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
  const tail = s.slice(start);
  const attempts = [
    () => candidate,
    // Small models forget to close an array before the next key, or mismatch closers.
    () => repairStructure(candidate),
    // …put raw double quotes inside string values.
    () => escapeInnerQuotes(candidate),
    () => repairStructure(escapeInnerQuotes(candidate)),
    // …or hit max_tokens mid-document. Close whatever is open.
    () => repairTruncatedJson(tail),
    () => repairTruncatedJson(repairStructure(tail)),
    () => repairTruncatedJson(repairStructure(escapeInnerQuotes(tail))),
  ];
  let firstErr: unknown;
  for (const make of attempts) {
    try {
      return JSON.parse(make());
    } catch (err) {
      firstErr ??= err;
    }
  }
  throw firstErr;
}

/**
 * Structural repair for the two mistakes small models make most:
 *  - an object key appearing while an array is still open (`["a","b","key":…`)
 *    → the array is closed before the key;
 *  - a closer that doesn't match the innermost opener (`{"a":[1,2},"b":3}`)
 *    → it's replaced with the expected one.
 */
export function repairStructure(s: string): string {
  const stack: string[] = []; // expected closers
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') {
      // Consume the whole string token.
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "\\") j += 2;
        else if (s[j] === '"') break;
        else j++;
      }
      const token = s.slice(i, Math.min(j + 1, s.length));
      let k = j + 1;
      while (k < s.length && /\s/.test(s[k])) k++;
      const isKey = s[k] === ":";
      if (isKey) {
        // Keys only belong directly inside objects: close any arrays first.
        while (stack.length && stack[stack.length - 1] === "]") {
          stack.pop();
          const trimmed = out.replace(/\s*,\s*$/, "");
          out = trimmed + "]" + (out.length !== trimmed.length ? "," : "");
        }
      }
      out += token;
      i = j + 1;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
      out += ch;
    } else if (ch === "}" || ch === "]") {
      if (!stack.length) {
        // Nothing to close — drop the stray closer.
      } else {
        // A closer of the wrong kind is treated as a typo for the expected one
        // (`[1,2}` → `[1,2]`); a truncation pass closes anything left open later.
        out += stack.pop();
      }
    } else out += ch;
    i++;
  }
  return out;
}

/**
 * Escape double quotes that appear *inside* JSON string values. A quote is
 * treated as the closing one only if the next non-space character could
 * legally follow a string (`,` `}` `]` `:`), otherwise it's escaped.
 */
export function escapeInnerQuotes(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inStr) {
      out += ch;
      if (ch === '"') inStr = true;
      continue;
    }
    if (ch === "\\") {
      out += ch + (s[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      const next = s[j];
      if (next === undefined || next === "," || next === "}" || next === "]" || next === ":") {
        out += ch;
        inStr = false;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Best-effort repair for JSON cut off mid-stream: drop a dangling partial
 * token, then close any open strings, arrays and objects.
 */
export function repairTruncatedJson(s: string): string {
  const scan = (str: string) => {
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    let strStart = -1;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        strStart = i;
      } else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
    return { stack, inStr, strStart };
  };

  let out = s.replace(/\\$/, "");
  const first = scan(out);
  if (first.inStr) {
    const before = out.slice(0, first.strStart).trimEnd();
    const prev = before[before.length - 1];
    const inObject = first.stack[first.stack.length - 1] === "}";
    // An unterminated string in key position can't be completed — drop it. A value gets closed.
    out = inObject && (prev === "{" || prev === ",") ? before : out + '"';
  }
  out = out
    .replace(/(?<=[:,[]\s*)(?:t|tr|tru|f|fa|fal|fals|n|nu|nul|-|\d+\.|\d+[eE][+-]?)$/, "") // partial literal
    .replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, "") // dangling "key":
    .replace(/,\s*$/, ""); // trailing comma
  const { stack } = scan(out);
  return out + stack.reverse().join("");
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
    if (process.env.LLM_DEBUG === "full") console.log(`[llm] raw (${raw.length} chars):\n${raw}\n[/llm]`);
    else if (process.env.LLM_DEBUG) console.log(`[llm] raw (${raw.length} chars):`, raw.slice(0, 400), "…", raw.slice(-300));
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
