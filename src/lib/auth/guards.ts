import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Interview, Study } from "@/db/schema";
import { hasParticipantGrant } from "./participant";
import { type Viewer, currentViewer } from "./session";

export { currentViewer };
export type { Viewer };

/* ------------------------------------------------------------------ *
 * Pages
 * ------------------------------------------------------------------ */

/** Server-component guard: bounce to sign-in, preserving where they were headed. */
export async function requireViewer(returnTo?: string): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) redirect(returnTo ? `/signin?next=${encodeURIComponent(returnTo)}` : "/signin");
  return viewer;
}

/* ------------------------------------------------------------------ *
 * API routes
 * ------------------------------------------------------------------ */

export type ApiFailure = { ok: false; response: NextResponse };
export type ApiViewer = { ok: true; viewer: Viewer };

export async function requireApiViewer(): Promise<ApiViewer | ApiFailure> {
  const viewer = await currentViewer();
  if (!viewer) {
    return { ok: false, response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  }
  return { ok: true, viewer };
}

/**
 * Reject cross-site state-changing requests.
 *
 * The session cookie is SameSite=Lax, which already keeps it off cross-site
 * form posts. This is the belt to that pair of braces, and costs one header
 * comparison.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Browsers always attach Origin to a cross-site POST, so an absent header
  // means a non-browser caller (curl, a script) — which carries no ambient
  // cookies and therefore cannot be the confused deputy CSRF depends on.
  if (!origin) return true;
  try {
    const sent = new URL(origin).host;
    const hosts = [req.headers.get("host"), req.headers.get("x-forwarded-host")].filter(Boolean);
    return hosts.includes(sent);
  } catch {
    return false;
  }
}

export function crossOriginRejected(): NextResponse {
  return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
}

/* ------------------------------------------------------------------ *
 * Ownership
 * ------------------------------------------------------------------ */

/**
 * Load a study only if this researcher owns it.
 *
 * The ownership predicate is part of the query, not a check after the fact, so
 * there is no window in which a non-owner's row is in hand. A study belonging
 * to someone else is indistinguishable from one that does not exist.
 */
export async function getOwnedStudy(studyId: string, viewer: Viewer): Promise<Study | null> {
  const rows = await db
    .select()
    .from(schema.studies)
    .where(and(eq(schema.studies.id, studyId), eq(schema.studies.researcherId, viewer.id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Load an interview only if this researcher owns the study it belongs to. */
export async function getOwnedInterview(
  interviewId: string,
  viewer: Viewer,
): Promise<{ interview: Interview; study: Study } | null> {
  const rows = await db
    .select({ interview: schema.interviews, study: schema.studies })
    .from(schema.interviews)
    .innerJoin(schema.studies, eq(schema.studies.id, schema.interviews.studyId))
    .where(and(eq(schema.interviews.id, interviewId), eq(schema.studies.researcherId, viewer.id)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Interview write endpoints are called by the participant's browser, which has
 * no account. Access is granted by either:
 *   - a signed participant grant for this exact interview, or
 *   - a signed-in researcher who owns the study.
 *
 * Anything else is a 404, so interview ids cannot be probed for existence.
 */
export async function authorizeInterviewWrite(
  interviewId: string,
): Promise<{ ok: true; interview: Interview; as: "participant" | "researcher" } | ApiFailure> {
  const rows = await db
    .select()
    .from(schema.interviews)
    .where(eq(schema.interviews.id, interviewId))
    .limit(1);
  const interview = rows[0];

  if (await hasParticipantGrant(interviewId)) {
    // The grant is signed for this id, so a matching cookie proves this browser
    // started this interview — but the row still has to exist.
    if (!interview) return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
    return { ok: true, interview, as: "participant" };
  }

  const viewer = await currentViewer();
  if (viewer && interview) {
    const owned = await getOwnedInterview(interviewId, viewer);
    if (owned) return { ok: true, interview: owned.interview, as: "researcher" };
  }

  return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
}

/** Page-level equivalent of `getOwnedStudy`: a non-owner sees the 404 page. */
export async function requireOwnedStudy(studyId: string, viewer: Viewer): Promise<Study> {
  const study = await getOwnedStudy(studyId, viewer);
  if (!study) notFound();
  return study;
}

/* ------------------------------------------------------------------ *
 * Public studies
 * ------------------------------------------------------------------ */

export type ReadAccess = { study: Study; isOwner: boolean };

/**
 * Read access to a study's results: the owner, or anyone at all if the study is
 * published.
 *
 * `isPublic` is off for every study the app creates and there is no UI to turn
 * it on — only the seed sets it, for the demo. So this widens exactly one
 * study, and `isOwner` still tells callers whether the viewer may change
 * anything. Read and write are decided separately: publishing a study never
 * grants a stranger the ability to synthesise it or spend its API budget.
 */
export async function getReadableStudy(studyId: string, viewer: Viewer | null): Promise<ReadAccess | null> {
  const rows = await db.select().from(schema.studies).where(eq(schema.studies.id, studyId)).limit(1);
  const study = rows[0];
  if (!study) return null;

  const isOwner = Boolean(viewer && study.researcherId === viewer.id);
  if (isOwner || study.isPublic) return { study, isOwner };
  return null;
}

/** The interview equivalent: readable if its study is owned by the viewer or published. */
export async function getReadableInterview(
  interviewId: string,
  viewer: Viewer | null,
): Promise<{ interview: Interview; study: Study; isOwner: boolean } | null> {
  const rows = await db
    .select({ interview: schema.interviews, study: schema.studies })
    .from(schema.interviews)
    .innerJoin(schema.studies, eq(schema.studies.id, schema.interviews.studyId))
    .where(eq(schema.interviews.id, interviewId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const isOwner = Boolean(viewer && row.study.researcherId === viewer.id);
  if (isOwner || row.study.isPublic) return { ...row, isOwner };
  return null;
}

/**
 * Page guard for a results page. A signed-out visitor is only sent to sign-in
 * when the study is private — a published one just renders, which is the whole
 * point of publishing it.
 */
export async function requireReadableStudy(studyId: string, returnTo: string): Promise<ReadAccess & { viewer: Viewer | null }> {
  const viewer = await currentViewer();
  const access = await getReadableStudy(studyId, viewer);
  if (access) return { ...access, viewer };
  if (!viewer) redirect(`/signin?next=${encodeURIComponent(returnTo)}`);
  notFound();
}
