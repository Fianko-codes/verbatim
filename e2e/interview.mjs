/**
 * End-to-end check of the golden path with a fake microphone.
 *
 *   node e2e/interview.mjs [--wav path/to/participant.wav] [--base http://localhost:3000] [--study demo]
 *
 * Launches the system Chrome with a WAV file as the microphone, opens the demo
 * interview, and waits for the conversation to end on its own (the scripted
 * participant says "let's wrap up"). Prints the transcript, insights and the
 * write-up, then checks the interview shows up on the researcher's dashboard.
 *
 * The whole run is unauthenticated on purpose: participants never have an
 * account, and the demo study is the one published study, so its dashboard is
 * readable by anyone. e2e/auth.mjs covers the authorization rules.
 */
import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null))
    .filter(Boolean),
);
const BASE = args.base ?? "http://localhost:3000";
const STUDY = args.study ?? "demo";
const WAV = args.wav ?? new URL("./participant.wav", import.meta.url).pathname;
const HEADLESS = args.headed ? false : true;

const t0 = Date.now();
const log = (...m) => console.log(`${String(Date.now() - t0).padStart(6)}ms`, ...m);

const browser = await chromium.launch({
  headless: HEADLESS,
  channel: "chrome",
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${WAV}%noloop`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: args.shots ? 2 : 1 });
const page = await ctx.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning" || args.verbose) log("[browser]", msg.type(), msg.text().slice(0, 200));
});
const bodyHas = (re) => page.waitForFunction((src) => new RegExp(src, "i").test(document.body.innerText), re.source, { timeout: 0 });
page.on("pageerror", (err) => log("[pageerror]", err.message));

let ok = true;
try {
  await page.goto(`${BASE}/i/${STUDY}`, { waitUntil: "networkidle" });
  log("intro loaded:", await page.title());
  await page.fill("#name", "E2E Bot");
  await page.click('[data-testid="start-interview"]');
  log("clicked start");

  // Wait for the interviewer's greeting (status label is CSS-uppercased, so match case-insensitively).
  await Promise.race([bodyHas(/verbatim is speaking/), page.waitForTimeout(40_000).then(() => Promise.reject(new Error("agent never spoke")))]);
  log("agent speaking");

  // Optional: exercise the End button after N seconds instead of letting the agent close.
  const endAfter = Number(args["end-after"] ?? 0);
  if (endAfter > 0) {
    await page.waitForTimeout(endAfter * 1000);
    await page.click('button:has-text("End")');
    log("clicked End");
  }

  // Wait for the first participant turn to land in the transcript.
  if (endAfter === 0) {
    await Promise.race([bodyHas(/sprint planning/), page.waitForTimeout(60_000).then(() => Promise.reject(new Error("participant speech not transcribed")))]);
    log("participant transcribed");
  }

  // Live notes should appear (capture_insight tool) within a couple of turns.
  const noteSeen = endAfter > 0 ? false : await Promise.race([
    page.waitForSelector("aside .card", { timeout: 0 }).then(() => true),
    page.waitForTimeout(60_000).then(() => false),
  ]);
  log(noteSeen ? "live note captured" : "no live note within 60s (continuing)");
  if (noteSeen) {
    log("first note:", (await page.locator("aside .card").first().innerText()).replace(/\n/g, " | ").slice(0, 200));
    if (args.shots) await page.screenshot({ path: `${args.shots}/interview-live.png` });
  }

  // Wait for the done screen (agent calls end_interview after "let's wrap up").
  const doneTimeout = Number(args["done-timeout"] ?? 150) * 1000;
  await Promise.race([bodyHas(/That's a wrap/), page.waitForTimeout(doneTimeout).then(() => Promise.reject(new Error("never reached done screen")))]);
  log("done screen reached");

  // Wait for the write-up.
  await page
    .waitForFunction(() => !/Writing up your interview/i.test(document.body.innerText), null, { timeout: 90_000 })
    .catch(() => log("write-up did not finish in time"));
  if (args.shots) await page.screenshot({ path: `${args.shots}/interview-done.png` });
  const doneText = await page.locator("main").innerText();
  console.log("\n===== DONE SCREEN =====\n" + doneText.slice(0, 1500) + "\n=======================\n");
  if (!/Here's what we heard/.test(doneText)) {
    ok = false;
    log("FAIL: no user speech was captured");
  }

  // Follow through to the dashboard. The whole run happens with no account:
  // the participant never has one, and the demo study is published so its
  // results are readable by anyone. Authorization itself is covered by
  // e2e/auth.mjs, which proves every other study stays private.
  const dash = page.locator('a:has-text("See what the researcher sees")');
  const href = await dash.getAttribute("href");
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });

  const readOnly = await page.locator("text=read-only").count();
  log(readOnly > 0 ? "PASS: public dashboard shows the read-only notice" : "FAIL: no read-only notice");
  if (readOnly === 0) ok = false;

  const listed = await page.locator("text=E2E Bot").count();
  log(listed > 0 ? "PASS: interview listed on dashboard" : "FAIL: interview not on dashboard");
  if (listed === 0) ok = false;

  // Open the interview detail and confirm transcript + insights rendered.
  const detailHref = await page.locator('a[href^="/s/"]:has-text("E2E Bot")').first().getAttribute("href");
  await page.goto(`${BASE}${detailHref}`, { waitUntil: "networkidle" });
  const detail = await page.locator("main").innerText();
  const hasTranscript = /transcript/i.test(detail) && (endAfter > 0 || /Google Doc|sprint planning/i.test(detail));
  log(hasTranscript ? "PASS: transcript on detail page" : "FAIL: transcript missing on detail page");
  if (!hasTranscript) ok = false;
  await page.screenshot({ path: new URL("./last-detail.png", import.meta.url).pathname, fullPage: true });
} catch (err) {
  ok = false;
  log("ERROR:", err.message);
  await page.screenshot({ path: new URL("./last-failure.png", import.meta.url).pathname, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
log(ok ? "E2E PASSED" : "E2E FAILED");
process.exit(ok ? 0 : 1);
