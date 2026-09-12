import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { authSecret } from "./secret";

/**
 * Participants are never authenticated — they arrive on a share link with no
 * account and no identity. But an interview still needs a boundary: without
 * one, anyone who guesses an interview id could write turns and fabricated
 * "verbatim" notes into someone else's transcript, or re-trigger the write-up.
 *
 * So when an interview starts, the server hands the browser a signed grant for
 * that one interview id, in an HTTP-only cookie. It proves nothing about who
 * the participant is; it only proves this browser is the one that started this
 * interview. No database row, no personal data, no login.
 */
export const PARTICIPANT_COOKIE = "verbatim_participant";

/** Grants outlive the longest allowed interview by a wide margin, and no more. */
const GRANT_TTL_MS = 6 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

/** `<interviewId>.<expiresAt>.<hmac>` */
export function createGrant(interviewId: string, now = Date.now()): string {
  const payload = `${interviewId}.${now + GRANT_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

function grantsInterview(token: string, interviewId: string, now = Date.now()): boolean {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const provided = Buffer.from(token.slice(idx + 1), "base64url");
  const expected = Buffer.from(sign(payload), "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return false;

  const sep = payload.lastIndexOf(".");
  if (sep <= 0) return false;
  const expiresAt = Number(payload.slice(sep + 1));
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  return payload.slice(0, sep) === interviewId;
}

/**
 * A browser may legitimately hold grants for several interviews (a judge doing
 * the demo twice, someone in two studies), so the cookie carries a short list
 * and the newest grant wins on overflow.
 */
const MAX_GRANTS = 5;

export function appendGrant(existing: string | undefined, interviewId: string): string {
  const now = Date.now();
  const kept = (existing ?? "")
    .split("|")
    .filter(Boolean)
    .filter((t) => {
      const idx = t.lastIndexOf(".");
      const sep = idx > 0 ? t.lastIndexOf(".", idx - 1) : -1;
      if (sep <= 0) return false;
      const exp = Number(t.slice(sep + 1, idx));
      return Number.isFinite(exp) && exp > now;
    });
  return [createGrant(interviewId, now), ...kept].slice(0, MAX_GRANTS).join("|");
}

/** True when the caller's cookie carries a live grant for this interview. */
export async function hasParticipantGrant(interviewId: string): Promise<boolean> {
  const raw = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  if (!raw) return false;
  return raw.split("|").some((t) => t && grantsInterview(t, interviewId));
}

export function participantCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(GRANT_TTL_MS / 1000),
  };
}
