/**
 * Authentication and authorization checks against a running server.
 *
 *   node e2e/auth.mjs [--base http://localhost:3000] [--study demo]
 *
 * Creates two throwaway researchers, gives each a study, and then tries every
 * way one could reach the other's data: dashboard pages, the polling endpoint,
 * synthesis, interview detail, recordings and timelines. Also checks that the
 * participant flow still works with no account at all, and that a participant
 * cannot write into an interview they did not start.
 *
 * Exits non-zero if any check fails.
 */
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null))
    .filter(Boolean),
);
const BASE = args.base ?? "http://localhost:3000";
const DEMO_STUDY = args.study ?? "demo";
const ORIGIN = new URL(BASE).origin;

let pass = 0;
let fail = 0;
const failures = [];

function check(ok, label, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

/** A cookie jar per simulated browser, so sessions do not leak between actors. */
function jar() {
  const cookies = new Map();
  return {
    header: () =>
      [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === "") cookies.delete(name);
        else cookies.set(name, value);
      }
      return res;
    },
    raw: cookies,
  };
}

async function call(j, path, { method = "GET", body, origin = ORIGIN, redirect = "manual" } = {}) {
  const headers = { cookie: j.header() };
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
  });
  j.absorb(res);
  return res;
}

const suffix = Math.random().toString(36).slice(2, 8);
const alice = { jar: jar(), username: `alice-${suffix}`, password: "correct-horse-battery", studyId: null };
const bob = { jar: jar(), username: `bob-${suffix}`, password: "another-long-password", studyId: null };
const anon = jar();

async function signUp(actor) {
  const res = await call(actor.jar, "/api/auth/signup", {
    method: "POST",
    body: { username: actor.username, password: actor.password, name: actor.username },
  });
  return res;
}

async function createStudy(actor, title) {
  const res = await call(actor.jar, "/api/studies", {
    method: "POST",
    body: {
      title,
      goal: `Understand what ${title} participants actually do, in enough words to pass validation.`,
      topics: [{ question: "Walk me through the last time you did this, start to finish." }],
      durationMinutes: 3,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, id: data.id };
}

try {
  /* ---------------------------------------------------------------- */
  section("Password rules and account creation");

  const weak = await call(jar(), "/api/auth/signup", {
    method: "POST",
    body: { username: `weak-${suffix}`, password: "short" },
  });
  check(weak.status === 400, "short password is rejected", `got ${weak.status}`);

  const aliceSignup = await signUp(alice);
  check(aliceSignup.status === 201, "alice can create an account", `got ${aliceSignup.status}`);
  check(alice.jar.raw.has("verbatim_session"), "signup sets a session cookie");

  const dupe = await call(jar(), "/api/auth/signup", {
    method: "POST",
    body: { username: alice.username, password: "yet-another-long-password" },
  });
  check(dupe.status === 409, "duplicate username is rejected", `got ${dupe.status}`);

  const bobSignup = await signUp(bob);
  check(bobSignup.status === 201, "bob can create an account", `got ${bobSignup.status}`);

  /* ---------------------------------------------------------------- */
  section("Session cookie hardening");

  const setCookie = aliceSignup.headers.getSetCookie().find((c) => c.startsWith("verbatim_session="));
  check(/HttpOnly/i.test(setCookie ?? ""), "session cookie is HttpOnly");
  check(/SameSite=Lax/i.test(setCookie ?? ""), "session cookie is SameSite=Lax");
  check(/Path=\//i.test(setCookie ?? ""), "session cookie is scoped to /");
  const secureExpected = BASE.startsWith("https://");
  check(
    secureExpected === /;\s*Secure/i.test(setCookie ?? ""),
    secureExpected ? "session cookie is Secure over https" : "session cookie omits Secure on plain http (dev)",
  );
  check(
    !(setCookie ?? "").includes(alice.password),
    "session cookie does not contain the password",
  );

  /* ---------------------------------------------------------------- */
  section("Sign-in");

  const wrongPw = await call(jar(), "/api/auth/signin", {
    method: "POST",
    body: { username: alice.username, password: "definitely-not-the-password" },
  });
  check(wrongPw.status === 401, "wrong password is rejected", `got ${wrongPw.status}`);

  const noSuchUser = await call(jar(), "/api/auth/signin", {
    method: "POST",
    body: { username: `ghost-${suffix}`, password: "definitely-not-the-password" },
  });
  const wrongPwBody = await wrongPw.json().catch(() => ({}));
  const noUserBody = await noSuchUser.json().catch(() => ({}));
  check(
    noSuchUser.status === wrongPw.status && noUserBody.error === wrongPwBody.error,
    "unknown user and wrong password are indistinguishable",
    `${noSuchUser.status}/${noUserBody.error} vs ${wrongPw.status}/${wrongPwBody.error}`,
  );

  const freshJar = jar();
  const goodSignIn = await call(freshJar, "/api/auth/signin", {
    method: "POST",
    body: { username: alice.username, password: alice.password },
  });
  check(goodSignIn.status === 200, "correct password signs in", `got ${goodSignIn.status}`);

  /* ---------------------------------------------------------------- */
  section("Cross-origin requests");

  const csrf = await call(alice.jar, "/api/studies", {
    method: "POST",
    origin: "https://evil.example",
    body: { title: "CSRF study", goal: "x".repeat(20), topics: [{ question: "Tell me about it please." }] },
  });
  check(csrf.status === 403, "cross-origin POST is rejected", `got ${csrf.status}`);

  const csrfSignout = await call(alice.jar, "/api/auth/signout", {
    method: "POST",
    origin: "https://evil.example",
  });
  check(csrfSignout.status === 403, "cross-origin sign-out is rejected", `got ${csrfSignout.status}`);
  check(alice.jar.raw.has("verbatim_session"), "alice is still signed in after the rejected sign-out");

  /* ---------------------------------------------------------------- */
  section("Study ownership");

  const aliceStudy = await createStudy(alice, "Alice onboarding research");
  check(aliceStudy.res.status === 201 && Boolean(aliceStudy.id), "alice can create a study", `got ${aliceStudy.res.status}`);
  alice.studyId = aliceStudy.id;

  const bobStudy = await createStudy(bob, "Bob checkout research");
  check(bobStudy.res.status === 201 && Boolean(bobStudy.id), "bob can create a study", `got ${bobStudy.res.status}`);
  bob.studyId = bobStudy.id;

  const anonCreate = await call(anon, "/api/studies", {
    method: "POST",
    body: { title: "Anon study", goal: "x".repeat(20), topics: [{ question: "Tell me about it please." }] },
  });
  check(anonCreate.status === 401, "signed-out study creation is rejected", `got ${anonCreate.status}`);

  const own = await call(alice.jar, `/api/studies/${alice.studyId}`);
  check(own.status === 200, "alice can read her own study bundle", `got ${own.status}`);

  const other = await call(alice.jar, `/api/studies/${bob.studyId}`);
  check(other.status === 404, "alice cannot read bob's study bundle", `got ${other.status}`);

  // 404 rather than 401: the response must not confirm the id exists.
  const anonBundle = await call(anon, `/api/studies/${bob.studyId}`);
  check(anonBundle.status === 404, "signed-out read of a private study bundle is rejected", `got ${anonBundle.status}`);


  const crossSynth = await call(alice.jar, `/api/studies/${bob.studyId}/synthesize`, { method: "POST" });
  check(crossSynth.status === 404, "alice cannot synthesise bob's study", `got ${crossSynth.status}`);

  const anonSynth = await call(anon, `/api/studies/${bob.studyId}/synthesize`, { method: "POST" });
  check(anonSynth.status === 401, "signed-out synthesis is rejected", `got ${anonSynth.status}`);

  /* ---------------------------------------------------------------- */
  section("Dashboard pages");

  const anonDash = await call(anon, `/s/${bob.studyId}`);
  const anonDashLoc = anonDash.headers.get("location") ?? "";
  check(
    anonDash.status === 307 || anonDash.status === 302,
    "signed-out dashboard redirects",
    `got ${anonDash.status}`,
  );
  check(anonDashLoc.includes("/signin"), "signed-out dashboard redirects to /signin", anonDashLoc);

  const crossDash = await call(alice.jar, `/s/${bob.studyId}`, { redirect: "follow" });
  const crossDashBody = await crossDash.text();
  check(crossDash.status === 404, "alice gets 404 on bob's dashboard", `got ${crossDash.status}`);
  check(!crossDashBody.includes("Bob checkout research"), "bob's study title does not leak into the 404 page");

  const ownDash = await call(alice.jar, `/s/${alice.studyId}`, { redirect: "follow" });
  const ownDashBody = await ownDash.text();
  check(ownDash.status === 200 && ownDashBody.includes("Alice onboarding research"), "alice sees her own dashboard");

  const anonNew = await call(anon, "/new");
  check(
    (anonNew.status === 307 || anonNew.status === 302) && (anonNew.headers.get("location") ?? "").includes("/signin"),
    "signed-out /new redirects to /signin",
    `got ${anonNew.status}`,
  );

  const anonStudies = await call(anon, "/studies");
  check(
    (anonStudies.status === 307 || anonStudies.status === 302) &&
      (anonStudies.headers.get("location") ?? "").includes("/signin"),
    "signed-out /studies redirects to /signin",
    `got ${anonStudies.status}`,
  );

  const aliceStudies = await call(alice.jar, "/studies", { redirect: "follow" });
  const aliceStudiesBody = await aliceStudies.text();
  check(aliceStudiesBody.includes("Alice onboarding research"), "alice's study list shows her study");
  check(!aliceStudiesBody.includes("Bob checkout research"), "alice's study list omits bob's study");

  /* ---------------------------------------------------------------- */
  section("The published demo study");

  // The demo is the one study anyone may read. Everything below must work with
  // no account at all — that is the point of publishing it.
  const demoPage = await call(anon, `/s/${DEMO_STUDY}`, { redirect: "follow" });
  const demoPageBody = await demoPage.text();
  check(demoPage.status === 200, "signed-out visitor can open the demo dashboard", `got ${demoPage.status}`);
  check(demoPageBody.includes("Meeting notes"), "the demo dashboard renders its content signed out");
  check(demoPageBody.includes("read-only"), "the demo dashboard says it is read-only");

  const demoApi = await call(anon, `/api/studies/${DEMO_STUDY}`);
  check(demoApi.status === 200, "signed-out visitor can poll the demo study bundle", `got ${demoApi.status}`);

  const demoData = await demoApi.json().catch(() => ({}));
  const demoInterview = demoData.interviews?.[0];
  check(Boolean(demoInterview), "the demo bundle carries its sample interviews");

  if (demoInterview) {
    const demoDetail = await call(anon, `/s/${DEMO_STUDY}/${demoInterview.id}`, { redirect: "follow" });
    check(demoDetail.status === 200, "signed-out visitor can open a demo interview detail page", `got ${demoDetail.status}`);

    const demoTimeline = await call(anon, `/api/interviews/${demoInterview.id}/timeline`);
    check(demoTimeline.status === 200, "signed-out visitor can fetch a demo timeline", `got ${demoTimeline.status}`);
  }

  // Reading a published study must not confer writing to it.
  const anonDemoSynth = await call(anon, `/api/studies/${DEMO_STUDY}/synthesize`, { method: "POST" });
  check(anonDemoSynth.status === 401, "signed-out visitor cannot synthesise the demo study", `got ${anonDemoSynth.status}`);

  const bobDemoSynth = await call(bob.jar, `/api/studies/${DEMO_STUDY}/synthesize`, { method: "POST" });
  check(bobDemoSynth.status === 404, "a signed-in stranger cannot synthesise the demo study", `got ${bobDemoSynth.status}`);

  // And publishing one study must not have widened any other.
  const anonAliceStudy = await call(anon, `/api/studies/${alice.studyId}`);
  check(anonAliceStudy.status === 404, "a private study is still 404 for a signed-out visitor", `got ${anonAliceStudy.status}`);

  const anonAlicePage = await call(anon, `/s/${alice.studyId}`);
  check(
    (anonAlicePage.status === 307 || anonAlicePage.status === 302) &&
      (anonAlicePage.headers.get("location") ?? "").includes("/signin"),
    "a private study still redirects a signed-out visitor to sign-in",
    `got ${anonAlicePage.status}`,
  );

  /* ---------------------------------------------------------------- */
  section("Open redirect");

  // A signed-in visitor hitting /signin is bounced to `next`. That must never
  // be a URL pointing off-site, or the sign-in page becomes a phishing hop.
  for (const evil of ["//evil.example", "/\\evil.example", "https://evil.example", "/\tevil"]) {
    const res = await call(alice.jar, `/signin?next=${encodeURIComponent(evil)}`);
    const loc = res.headers.get("location") ?? "";
    const offsite = /^(https?:)?\/\//i.test(loc) && !loc.startsWith(ORIGIN);
    check(!offsite, `signed-in /signin does not redirect off-site for ${JSON.stringify(evil)}`, loc);
  }

  /* ---------------------------------------------------------------- */
  section("Participant flow stays unauthenticated");

  const participant = jar();
  const intro = await call(participant, `/i/${alice.studyId}`, { redirect: "follow" });
  const introBody = await intro.text();
  check(intro.status === 200, "participant can open the interview page with no account", `got ${intro.status}`);
  check(introBody.includes("Alice onboarding research"), "interview page shows the study title");
  check(
    !introBody.includes(alice.username),
    "interview page does not expose the owning researcher's username",
  );

  const demoIntro = await call(jar(), `/i/${DEMO_STUDY}`, { redirect: "follow" });
  check(demoIntro.status === 200, "the seeded demo interview link still works", `got ${demoIntro.status}`);

  /* ---------------------------------------------------------------- */
  section("Interview write authorization");

  // Start a real interview so there is a genuine grant to test against. This
  // needs the AssemblyAI token mint, so a 502 here means the key is missing
  // rather than an authorization failure.
  const start = await call(participant, "/api/interviews", {
    method: "POST",
    body: { studyId: alice.studyId, participantLabel: "Auth Bot" },
  });
  const startBody = await start.json().catch(() => ({}));
  const interviewId = startBody.interviewId;

  if (start.status === 502) {
    console.log("  SKIP  interview write checks — could not mint a Voice Agent token (no ASSEMBLYAI_API_KEY?)");
  } else {
    check(start.status === 200 && Boolean(interviewId), "participant can start an interview", `got ${start.status}`);
    check(participant.raw.has("verbatim_participant"), "starting an interview sets a participant grant cookie");

    const grantCookie = start.headers.getSetCookie().find((c) => c.startsWith("verbatim_participant="));
    check(/HttpOnly/i.test(grantCookie ?? ""), "participant grant cookie is HttpOnly");
    check(/SameSite=Lax/i.test(grantCookie ?? ""), "participant grant cookie is SameSite=Lax");

    const ownTurn = await call(participant, `/api/interviews/${interviewId}/turns`, {
      method: "POST",
      body: { idx: 0, role: "user", text: "I keep everything in a notebook.", atMs: 1000 },
    });
    check(ownTurn.status === 200, "participant can write a turn to their own interview", `got ${ownTurn.status}`);

    const stranger = jar();
    const strangerTurn = await call(stranger, `/api/interviews/${interviewId}/turns`, {
      method: "POST",
      body: { idx: 1, role: "user", text: "Injected by a stranger.", atMs: 2000 },
    });
    check(strangerTurn.status === 404, "a stranger cannot write a turn to someone else's interview", `got ${strangerTurn.status}`);

    const strangerInsight = await call(stranger, `/api/interviews/${interviewId}/insights`, {
      method: "POST",
      body: { theme: "Fabricated", quote: "Words the participant never said.", note: "" },
    });
    check(strangerInsight.status === 404, "a stranger cannot fabricate an insight", `got ${strangerInsight.status}`);

    const bobWrite = await call(bob.jar, `/api/interviews/${interviewId}/turns`, {
      method: "POST",
      body: { idx: 2, role: "user", text: "Injected by another researcher.", atMs: 3000 },
    });
    check(bobWrite.status === 404, "another researcher cannot write into alice's interview", `got ${bobWrite.status}`);

    const strangerComplete = await call(stranger, `/api/interviews/${interviewId}/complete`, {
      method: "POST",
      body: { durationSeconds: 10 },
    });
    check(strangerComplete.status === 404, "a stranger cannot complete someone else's interview", `got ${strangerComplete.status}`);

    const crossOriginTurn = await call(participant, `/api/interviews/${interviewId}/turns`, {
      method: "POST",
      origin: "https://evil.example",
      body: { idx: 3, role: "user", text: "Cross-origin write.", atMs: 4000 },
    });
    check(crossOriginTurn.status === 403, "cross-origin interview write is rejected", `got ${crossOriginTurn.status}`);

    /* ------------------------------------------------------------ */
    section("Recording and transcript access");

    const anonAudio = await call(anon, `/api/interviews/${interviewId}/audio`);
    check(anonAudio.status === 404, "signed-out recording access is rejected", `got ${anonAudio.status}`);

    const participantAudio = await call(participant, `/api/interviews/${interviewId}/audio`);
    check(
      participantAudio.status === 404,
      "a participant grant does not unlock the recording",
      `got ${participantAudio.status}`,
    );

    const bobAudio = await call(bob.jar, `/api/interviews/${interviewId}/audio`);
    check(bobAudio.status === 404, "another researcher cannot fetch the recording", `got ${bobAudio.status}`);

    const bobTimeline = await call(bob.jar, `/api/interviews/${interviewId}/timeline`);
    check(bobTimeline.status === 404, "another researcher cannot fetch the timeline", `got ${bobTimeline.status}`);

    const anonTimeline = await call(anon, `/api/interviews/${interviewId}/timeline`);
    check(anonTimeline.status === 404, "signed-out timeline access is rejected", `got ${anonTimeline.status}`);

    /* ------------------------------------------------------------ */
    section("Interview detail page");

    const bobDetail = await call(bob.jar, `/s/${alice.studyId}/${interviewId}`, { redirect: "follow" });
    const bobDetailBody = await bobDetail.text();
    check(bobDetail.status === 404, "another researcher gets 404 on the interview detail page", `got ${bobDetail.status}`);
    check(!bobDetailBody.includes("Auth Bot"), "the participant label does not leak into the 404 page");

    const anonDetail = await call(anon, `/s/${alice.studyId}/${interviewId}`);
    check(
      (anonDetail.status === 307 || anonDetail.status === 302) &&
        (anonDetail.headers.get("location") ?? "").includes("/signin"),
      "signed-out interview detail redirects to /signin",
      `got ${anonDetail.status}`,
    );

    const aliceDetail = await call(alice.jar, `/s/${alice.studyId}/${interviewId}`, { redirect: "follow" });
    const aliceDetailBody = await aliceDetail.text();
    check(aliceDetail.status === 200, "alice can open her own interview detail page", `got ${aliceDetail.status}`);
    check(aliceDetailBody.includes("notebook"), "alice sees the transcript turn that was written");

    // The stranger's injected turn must never have landed.
    check(!aliceDetailBody.includes("Injected by a stranger"), "the stranger's turn was never persisted");
    check(!aliceDetailBody.includes("Injected by another researcher"), "the other researcher's turn was never persisted");
  }

  /* ---------------------------------------------------------------- */
  section("Sign-out");

  const signOut = await call(alice.jar, "/api/auth/signout", { method: "POST" });
  check(signOut.status === 200, "alice can sign out", `got ${signOut.status}`);
  check(!alice.jar.raw.has("verbatim_session"), "sign-out clears the session cookie");

  const afterSignOut = await call(alice.jar, `/api/studies/${alice.studyId}`);
  check(afterSignOut.status === 404, "the study bundle is unreachable after sign-out", `got ${afterSignOut.status}`);

  // Alice's other browser (freshJar, from the sign-in section) is a separate
  // session and must still work: signing out one device is not signing out all.
  const secondSessionStillLive = await call(freshJar, `/api/studies/${alice.studyId}`);
  check(
    secondSessionStillLive.status === 200,
    "signing out one browser leaves the other session working",
    `got ${secondSessionStillLive.status}`,
  );

  // Capture that token, sign the session out, then replay it: the row must be
  // gone server-side, not merely dropped by the client.
  const capturedToken = freshJar.raw.get("verbatim_session") ?? "";
  const replay = jar();
  replay.raw.set("verbatim_session", capturedToken);

  const secondSignOut = await call(freshJar, "/api/auth/signout", { method: "POST" });
  check(secondSignOut.status === 200, "the second session can sign out too", `got ${secondSignOut.status}`);

  const replayRes = await call(replay, `/api/studies/${alice.studyId}`);
  check(replayRes.status === 404, "a signed-out session token cannot be replayed", `got ${replayRes.status}`);
  /* ---------------------------------------------------------------- */
  // Last, on purpose: this section deliberately burns failed attempts, and the
  // per-IP counter is shared by every check above.
  section("Brute-force rate limiting");

  // A dedicated account so locking it out cannot affect the other checks.
  const target = { jar: jar(), username: `target-${suffix}`, password: "a-perfectly-fine-password" };
  const targetSignup = await signUp(target);
  check(targetSignup.status === 201, "rate-limit target account created", `got ${targetSignup.status}`);

  let sawLimit = false;
  let attempts = 0;
  for (let i = 0; i < 14; i += 1) {
    const res = await call(jar(), "/api/auth/signin", {
      method: "POST",
      body: { username: target.username, password: `guess-${i}` },
    });
    attempts += 1;
    if (res.status === 429) {
      sawLimit = true;
      break;
    }
  }
  check(sawLimit, "repeated wrong passwords are rate limited", `no 429 after ${attempts} attempts`);

  // And the lockout must hold even when the right password finally arrives.
  const lockedOut = await call(jar(), "/api/auth/signin", {
    method: "POST",
    body: { username: target.username, password: target.password },
  });
  check(lockedOut.status === 429, "the correct password is refused while locked out", `got ${lockedOut.status}`);

} catch (err) {
  fail += 1;
  failures.push(`threw: ${err.message}`);
  console.error("\nERROR:", err);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("Failed checks:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail === 0 ? 0 : 1);
