/**
 * Captures the screenshots used in the README and the pitch deck.
 *   node pitch/shots.mjs [--base http://localhost:3000] [--study demo]
 * (Live-interview shots come from `node e2e/interview.mjs --shots pitch/shots`.)
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith("--") ? [a.slice(2), arr[i + 1]] : null))
    .filter(Boolean),
);
const BASE = args.base ?? "http://localhost:3000";
const STUDY = args.study ?? "demo";
// The dashboard shots need the account that owns the study — see src/db/seed.ts.
const USER = args.user ?? "demo";
const PASSWORD = args.password ?? process.env.DEMO_RESEARCHER_PASSWORD ?? "verbatim-demo-2026";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function shot(path, name, opts = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: opts.fullPage ?? false });
  console.log("saved", name);
}

// Landing and the participant intro are captured signed out, which is how a
// visitor actually sees them.
await shot("/", "landing");
await shot("/", "landing-full", { fullPage: true });
await shot(`/i/${STUDY}`, "intro");
await shot("/signin", "signin");

// Everything below is the researcher's side, so sign in first.
await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
await page.fill("#username", USER);
await page.fill("#password", PASSWORD);
await page.click('[data-testid="auth-submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 }).catch(() => {});
if (page.url().includes("/signin")) {
  console.error(`Could not sign in as "${USER}". Run pnpm db:seed, or pass --user/--password.`);
  await browser.close();
  process.exit(1);
}
console.log(`signed in as ${USER}`);

await shot(`/s/${STUDY}`, "dashboard");
await shot(`/s/${STUDY}`, "dashboard-full", { fullPage: true });
await shot("/new", "new-study");

// First sample interview detail
await page.goto(`${BASE}/s/${STUDY}`, { waitUntil: "networkidle" });
const first = page.locator('a[href^="/s/"]:has-text("Transcript")').first();
const href = await first.getAttribute("href");
if (href) {
  await shot(href, "interview-detail");
  await shot(href, "interview-detail-full", { fullPage: true });
}
await browser.close();
