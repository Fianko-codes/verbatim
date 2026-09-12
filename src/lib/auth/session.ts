import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { eq, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Researcher } from "@/db/schema";

export const SESSION_COOKIE = "verbatim_session";

/** Absolute lifetime of a session, and the idle window after which it dies. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Only touch `lastSeenAt` once an hour so a polling dashboard is not a write storm. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** The cookie holds the raw token; the table holds only this digest. */
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export type Viewer = Pick<Researcher, "id" | "username" | "name">;

export function sessionCookieOptions(maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Mint a session row and return the token to put in the cookie. */
export async function createSession(researcherId: string, userAgent?: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(schema.sessions).values({
    id: digest(token),
    researcherId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    userAgent: userAgent?.slice(0, 200) ?? null,
  });
  return token;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.id, digest(token)));
}

/** Sign every browser out of an account (used after a password change). */
export async function destroyAllSessions(researcherId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.researcherId, researcherId));
}

/**
 * Resolve the signed-in researcher from the request cookie, or null.
 *
 * Expiry is enforced in the query rather than after it, so a stale row can
 * never authenticate anyone even if the sweep below has not run.
 */
export async function currentViewer(): Promise<Viewer | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = digest(token);
  const now = new Date();
  const rows = await db
    .select({
      expiresAt: schema.sessions.expiresAt,
      lastSeenAt: schema.sessions.lastSeenAt,
      researcherId: schema.researchers.id,
      username: schema.researchers.username,
      name: schema.researchers.name,
    })
    .from(schema.sessions)
    .innerJoin(schema.researchers, eq(schema.researchers.id, schema.sessions.researcherId))
    .where(eq(schema.sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const idleDeadline = new Date(row.lastSeenAt.getTime() + IDLE_TTL_MS);
  if (row.expiresAt <= now || idleDeadline <= now) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }

  if (now.getTime() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(schema.sessions).set({ lastSeenAt: now }).where(eq(schema.sessions.id, id));
  }

  return { id: row.researcherId, username: row.username, name: row.name };
}

/** Opportunistic cleanup of dead session rows; safe to call and ignore. */
export async function sweepExpiredSessions() {
  const now = new Date();
  await db
    .delete(schema.sessions)
    .where(
      or(lt(schema.sessions.expiresAt, now), lt(schema.sessions.lastSeenAt, new Date(now.getTime() - IDLE_TTL_MS))),
    )
    .catch(() => {});
}

/** Look up an account by login name (always compared lower-cased). */
export async function findResearcherByUsername(username: string) {
  const rows = await db
    .select()
    .from(schema.researchers)
    .where(eq(schema.researchers.username, username.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Windowed failed-attempt counter, applied to two different keys with two
 * different thresholds.
 *
 * The per-username limit is tight, because ten wrong guesses at one account is
 * always an attack. The per-IP limit is deliberately much looser: a whole
 * office behind one NAT, or a school, shares an address, and a tight per-IP
 * limit would let one person's typos lock out their colleagues. The IP limit is
 * there to blunt password spraying across many accounts, not to police one
 * person signing in.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS_PER_USER = 10;
export const MAX_ATTEMPTS_PER_IP = 60;

export type AttemptKey = { key: string; max: number };

export function attemptKeys(username: string, ip: string): AttemptKey[] {
  return [
    { key: `user:${username}`, max: MAX_ATTEMPTS_PER_USER },
    { key: `ip:${ip}`, max: MAX_ATTEMPTS_PER_IP },
  ];
}

export async function isRateLimited(keys: AttemptKey[]): Promise<boolean> {
  const cutoff = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  for (const { key, max } of keys) {
    const rows = await db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.key, key)).limit(1);
    const row = rows[0];
    if (row && row.windowStartedAt > cutoff && row.count >= max) return true;
  }
  return false;
}

export async function recordFailedAttempt(keys: AttemptKey[]) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  for (const { key } of keys) {
    const rows = await db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.key, key)).limit(1);
    const row = rows[0];
    if (!row || row.windowStartedAt <= cutoff) {
      // Either the first failure or the first one after the window rolled over.
      await db
        .insert(schema.loginAttempts)
        .values({ key, count: 1, windowStartedAt: now })
        .onConflictDoUpdate({ target: schema.loginAttempts.key, set: { count: 1, windowStartedAt: now } });
    } else {
      await db.update(schema.loginAttempts).set({ count: row.count + 1 }).where(eq(schema.loginAttempts.key, key));
    }
  }
}

/**
 * Clear the counters after a successful sign-in — but only the username's.
 * The IP counter deliberately survives, so an attacker cannot reset the
 * spraying budget by signing in to an account they do control.
 */
export async function clearAttempts(keys: AttemptKey[]) {
  for (const { key } of keys) {
    if (!key.startsWith("user:")) continue;
    await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.key, key)).catch(() => {});
  }
}
