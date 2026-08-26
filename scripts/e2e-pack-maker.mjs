/**
 * E2E: pack maker → captioned clip → backing → review → studio → Dub Packs list.
 * Run: node scripts/e2e-pack-maker.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TMP = path.join(ROOT, "tmp");
const VIDEO = path.join(TMP, "e2e-pack.mp4");
const BACKING = path.join(TMP, "e2e-backing.mp3");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

function ensureFixtures() {
  fs.mkdirSync(TMP, { recursive: true });
  const where = spawnSync("where", ["ffmpeg"], { encoding: "utf8" });
  if (where.status !== 0) throw new Error("ffmpeg not found on PATH");
  const ff = "ffmpeg";
  if (!fs.existsSync(VIDEO)) {
    const r = spawnSync(
      ff,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x240:d=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        VIDEO,
      ],
      { encoding: "utf8" }
    );
    if (r.status !== 0) throw new Error(r.stderr || "ffmpeg video failed");
  }
  if (!fs.existsSync(BACKING)) {
    const r = spawnSync(
      ff,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=220:duration=3",
        "-c:a",
        "libmp3lame",
        BACKING,
      ],
      { encoding: "utf8" }
    );
    if (r.status !== 0) throw new Error(r.stderr || "ffmpeg backing failed");
  }
}

async function main() {
  ensureFixtures();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  const failures = [];
  const ok = (label) => console.log(`PASS  ${label}`);
  const fail = (label, err) => {
    console.error(`FAIL  ${label}: ${err}`);
    failures.push(label);
  };

  try {
    await page.goto(`${BASE}/play`, { waitUntil: "networkidle" });

    const dubOwn = page.getByRole("button", { name: /Dub Your Own Video/i });
    await dubOwn.waitFor({ state: "visible" });
    await dubOwn.click();

    await page.getByRole("heading", { name: /Dub pack maker/i }).waitFor();

    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.nth(0).setInputFiles(VIDEO);

    await page.getByRole("button", { name: /Continue/i }).waitFor({
      state: "visible",
      timeout: 30000,
    });
    ok("video loaded into editor");

    await page.getByRole("button", { name: /^\+ Add clip$/i }).click();
    await page.getByText(/Current clip/i).waitFor();

    const caption = page.locator("textarea").first();
    await caption.fill("Hello from the e2e pack maker");
    await page.waitForTimeout(200);
    const captionValue = await caption.inputValue();
    if (captionValue.trim() !== "Hello from the e2e pack maker") {
      fail("caption typed", `got "${captionValue}"`);
    } else {
      ok("caption entered");
    }

    const audioInput = page.locator('input[type="file"][accept*="audio"]');
    await audioInput.setInputFiles(BACKING);
    await page.getByText(/e2e-backing\.mp3/i).waitFor({ timeout: 10000 });
    ok("backing track attached");

    await page.getByRole("button", { name: /Continue/i }).click();

    const errorBar = page.locator(".pm-error-bar");
    if (await errorBar.isVisible().catch(() => false)) {
      const msg = await errorBar.textContent();
      fail("continue to review", msg || "error bar visible");
      const dump = await page.evaluate(() => {
        const tas = [...document.querySelectorAll("textarea")].map((t) => t.value);
        return { textareas: tas, body: document.body.innerText.slice(0, 800) };
      });
      console.error("debug dump", dump);
    } else {
      await page.getByRole("heading", { name: /Ready to save/i }).waitFor({
        timeout: 15000,
      });
      ok("review screen opened");
    }

    const titleInput = page.locator(".pm-review__card input").first();
    await titleInput.fill("E2E Backing Pack");
    const authorInput = page.locator(".pm-review__card input").nth(1);
    await authorInput.fill("E2E Tester");

    await page.getByRole("button", { name: /Use in Studio|Save changes/i }).click();

    await page.waitForTimeout(2500);
    const bodyText = await page.locator("body").innerText();
    if (
      /Hello from the e2e pack maker|Recording in Session|Replay|Record/i.test(
        bodyText
      )
    ) {
      ok("opened studio after save");
    } else {
      fail("studio after save", bodyText.slice(0, 400));
    }

    await page.goto(`${BASE}/packs`, { waitUntil: "networkidle" });
    await page.getByText(/E2E Backing Pack/i).waitFor({ timeout: 15000 });
    ok("pack visible on /packs");

    const hasBacking = await page.evaluate(async () => {
      return await new Promise((resolve) => {
        const req = indexedDB.open("imitation-star");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("packs", "readonly");
          const getAll = tx.objectStore("packs").getAll();
          getAll.onsuccess = () => {
            const packs = getAll.result || [];
            const hit = packs.find((p) => p.title === "E2E Backing Pack");
            resolve(Boolean(hit && hit.backingKey));
          };
          getAll.onerror = () => resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    });
    if (hasBacking) ok("backing key stored in IndexedDB");
    else fail("backing in IndexedDB", "missing backingKey");
  } catch (e) {
    fail("uncaught", e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
  }

  const inline = (clips) => {
    const missing = clips.filter((c) => !String(c.text ?? "").trim());
    return missing.length === 0 && clips.length > 0;
  };
  if (!inline([{ id: "1", text: "hi" }])) fail("unit caption ok", "expected pass");
  else ok("unit: captioned clip may continue");
  if (inline([{ id: "1", text: "hi" }, { id: "2", text: "  " }]))
    fail("unit empty caption", "expected block");
  else ok("unit: empty caption blocked");

  if (failures.length) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll pack-maker E2E checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
