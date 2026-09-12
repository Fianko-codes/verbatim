import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { crossOriginRejected, sameOrigin } from "@/lib/auth/guards";
import { fakeVerify, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  attemptKeys,
  clearAttempts,
  createSession,
  findResearcherByUsername,
  isRateLimited,
  recordFailedAttempt,
  sessionCookieOptions,
  sweepExpiredSessions,
} from "@/lib/auth/session";
import { signInInput } from "@/lib/validation";

export const maxDuration = 30;

/** Best-effort client address for rate limiting behind Vercel's proxy. */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOriginRejected();

  const parsed = signInInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a username and password" }, { status: 400 });
  }
  const { username, password } = parsed.data;
  const keys = attemptKeys(username, clientIp(req));

  if (await isRateLimited(keys)) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const researcher = await findResearcherByUsername(username);
  // Spend the same time on an unknown username as on a wrong password, so the
  // response cannot be used to enumerate accounts.
  const valid = researcher ? await verifyPassword(password, researcher.passwordHash) : (await fakeVerify(), false);

  if (!researcher || !valid) {
    await recordFailedAttempt(keys);
    return NextResponse.json({ error: "Incorrect username or password" }, { status: 401 });
  }

  await clearAttempts(keys);
  void sweepExpiredSessions();

  const token = await createSession(researcher.id, req.headers.get("user-agent"));
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return NextResponse.json({
    researcher: { id: researcher.id, username: researcher.username, name: researcher.name },
  });
}
