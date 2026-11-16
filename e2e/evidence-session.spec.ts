// Writes the screenshots kept as evidence for milestone M4: the debrief with its timeline, the
// start screen's "Watch a session", a refused file, and a recording being watched in the room
// and as a flat page. Run with `npx playwright test --project=evidence e2e/evidence-session.spec.ts`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { resolvedPlay } from "../tests/client/typed-play.js";
import { GAME_URL, playSteps, ROOM_URL, settled, toPlay } from "./helpers.js";

const OUT = join(import.meta.dirname, "..", "testresults", "dod", "m4", "screens");
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
];

const forward = async (page: Page, times: number) => {
  for (let n = 0; n < times; n++) {
    await page
      .getByRole("region", { name: /^Recorded session/ })
      .getByRole("button", { name: "Forward" })
      .click();
  }
};

// The sample session, saved from its debrief exactly as a player would save it, then opened
// again. The file is kept as evidence of what a saved session looks like.
test("a saved session: the sample, saved and opened again", async ({ page }) => {
  await page.goto(GAME_URL);
  await page.getByRole("button", { name: "Watch the sample" }).click();
  const controls = page.getByRole("region", { name: /^Recorded session/ });
  await controls.getByRole("button", { name: "To the end" }).click();
  await page.getByRole("button", { name: "Read the debrief" }).click();
  const score = await page.locator(".score-number").innerText();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save this session" }).click(),
  ]);
  const text = readFileSync(await download.path(), "utf8");
  writeFileSync(join(OUT, "..", "sample-session.json"), text);

  await page.getByRole("button", { name: "All situations" }).click();
  await page.getByLabel("Session file").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: Buffer.from(text, "utf8"),
  });
  await expect(page.getByText("The situation has changed since")).toHaveCount(0);
  await controls.getByRole("button", { name: "To the end" }).click();
  await page.getByRole("button", { name: "Read the debrief" }).click();
  await expect(page.locator(".score-number")).toHaveText(score);
});

for (const size of SIZES) {
  test.describe(`session screens at ${size.width} px`, () => {
    test.use({ viewport: size });

    const shot = async (page: Page, name: string, fullPage = false) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.screenshot({
        path: join(OUT, `${size.width}-${name}.png`),
        animations: "disabled",
        fullPage,
      });
    };

    test("the start screen, and a file that is refused", async ({ page }) => {
      await page.goto(GAME_URL);
      await shot(page, "01-start-watch-a-session", true);
      await page.getByLabel("Session file").setInputFiles({
        name: "notes.json",
        mimeType: "application/json",
        buffer: Buffer.from("{}", "utf8"),
      });
      await expect(page.getByRole("alert")).toContainText("not a BrownOut session");
      await page.getByRole("alert").scrollIntoViewIfNeeded();
      await shot(page, "02-file-refused");
    });

    test("the debrief of a strong session, with a moment selected", async ({ page }) => {
      await toPlay(page);
      await playSteps(page, resolvedPlay);
      await page.getByRole("button", { name: "Read the debrief" }).click();
      await shot(page, "03-debrief-strong", true);
      await page
        .getByRole("region", { name: "Diagnosis" })
        .getByRole("listitem")
        .first()
        .getByRole("button")
        .click();
      await shot(page, "04-debrief-moment-selected");
    });

    test("the sample in flat view, and its debrief", async ({ page }) => {
      await page.goto(GAME_URL);
      await page.getByRole("button", { name: "Watch the sample" }).click();
      await shot(page, "05-replay-flat-opening");
      await forward(page, 9);
      await shot(page, "06-replay-flat-severe");
      await page
        .getByRole("region", { name: /^Recorded session/ })
        .getByRole("button", { name: "To the end" })
        .click();
      await shot(page, "07-replay-flat-end");
      await page.getByRole("button", { name: "Read the debrief" }).click();
      await shot(page, "08-debrief-sample", true);
    });

    test("the sample in the room", async ({ page }) => {
      await page.goto(ROOM_URL);
      await page.getByRole("button", { name: "Watch the sample" }).click();
      await expect(page.locator(".room")).toHaveAttribute("data-ready", "true");
      await forward(page, 9);
      await expect(page.locator(".room")).toHaveAttribute("data-level", "2");
      await settled(page);
      await shot(page, "09-replay-room-severe");
    });
  });
}
