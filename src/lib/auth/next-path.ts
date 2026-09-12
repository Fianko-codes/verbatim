/**
 * Validate a `?next=` destination.
 *
 * Only a path on this origin is ever allowed. Rejecting anything whose second
 * character is `/` or `\` closes the protocol-relative hole: browsers read
 * `//evil.example` and, in several parsers, `/\evil.example` as an absolute URL
 * with the scheme inherited — which would turn the sign-in page into an open
 * redirect an attacker could put in a phishing link.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/studies"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.length > 1 && (next[1] === "/" || next[1] === "\\")) return fallback;
  // A backslash anywhere early, or a scheme, means someone is being clever.
  if (next.includes("\\") || /^\/[a-z0-9+.-]*:/i.test(next)) return fallback;
  return next;
}
