import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { crossOriginRejected, sameOrigin } from "@/lib/auth/guards";
import { SESSION_COOKIE, destroySession, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOriginRejected();

  const jar = await cookies();
  // Delete the server-side row first: clearing only the cookie would leave a
  // valid session behind for anyone who captured the token.
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return NextResponse.json({ ok: true });
}
