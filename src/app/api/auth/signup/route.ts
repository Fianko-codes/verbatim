import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { crossOriginRejected, sameOrigin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, createSession, findResearcherByUsername, sessionCookieOptions } from "@/lib/auth/session";
import { signUpInput } from "@/lib/validation";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOriginRejected();

  const parsed = signUpInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, { status: 400 });
  }
  const { username, password, name } = parsed.data;

  if (await findResearcherByUsername(username)) {
    return NextResponse.json({ error: "That username is taken" }, { status: 409 });
  }

  const id = nanoid(12);
  try {
    await db.insert(schema.researchers).values({
      id,
      username,
      name: name || username,
      passwordHash: await hashPassword(password),
      createdAt: new Date(),
    });
  } catch {
    // The unique index is the real arbiter — two simultaneous signups for the
    // same name both pass the check above, and exactly one insert survives.
    return NextResponse.json({ error: "That username is taken" }, { status: 409 });
  }

  const token = await createSession(id, req.headers.get("user-agent"));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return NextResponse.json({ researcher: { id, username, name: name || username } }, { status: 201 });
}
