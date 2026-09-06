/** Renders pitch/deck.html to pitch/deck.pdf with headless Chrome. */
import { chromium } from "playwright";

const here = new URL("./", import.meta.url);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage();
await page.goto(new URL("deck.html", here).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.pdf({
  path: new URL("deck.pdf", here).pathname,
  width: "1280px",
  height: "720px",
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  preferCSSPageSize: true,
});
await browser.close();
console.log("wrote pitch/deck.pdf");
