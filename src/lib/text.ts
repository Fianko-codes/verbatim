/** Text helpers shared by the browser (tool handler) and the server (analysis). */

export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Guarantee a quote is verbatim: keep it if its normalised form appears in the
 * source; otherwise return the source sentence with the most word overlap.
 */
export function enforceVerbatim(quote: string, source: string): string {
  const q = norm(quote);
  const src = norm(source);
  if (q && src.includes(q)) return quote.trim().replace(/^["'“”]|["'“”]$/g, "");
  const sentences = source.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return source.trim();
  const qWords = new Set(q.split(" ").filter(Boolean));
  let best = sentences[0];
  let bestScore = -1;
  for (const s of sentences) {
    const words = norm(s).split(" ");
    const score = words.filter((w) => qWords.has(w)).length / Math.max(1, words.length);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best.trim();
}

export function titleCase(s: string) {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
