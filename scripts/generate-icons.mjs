import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "icon.svg");
const svg = fs.readFileSync(svgPath, "utf8");
const html = `<!DOCTYPE html><html><body style="margin:0;background:#FF595E">${svg}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: "load" });
  await page.locator("svg").screenshot({
    path: path.join(root, "public", `icon-${size}.png`),
  });
  console.log(`Wrote icon-${size}.png`);
}

await browser.close();
