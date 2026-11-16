// Writes the screenshots kept as evidence for milestone M5: each new situation at its opening
// and under way, in the room and as a flat page, and the start screen listing them.
// Run with `npx playwright test --project=evidence e2e/evidence-wave.spec.ts`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { scenarios } from "../src/scenarios/index.js";
import { order, settled, wait } from "./helpers.js";

const OUT = join(import.meta.dirname, "..", "testresults", "dod", "m5", "screens");
mkdirSync(OUT, { recursive: true });

const shot = async (page: Page, name: string, fullPage = false) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: join(OUT, `${name}.png`), animations: "disabled", fullPage });
};

/** Opens a situation from the start screen by its title and starts it. */
async function begin(page: Page, title: string, view: "flat" | "room") {
  await page.goto(`./?seed=7&tick=600000&view=${view}`);
  await page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "Read the briefing" })
    .click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByLabel("What do you do?")).toBeVisible();
}

test("the start screen lists every situation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./?view=flat");
  await expect(page.getByRole("button", { name: "Read the briefing" })).toHaveCount(
    scenarios.length,
  );
  await shot(page, "1440-00-start", true);
  await page.setViewportSize({ width: 375, height: 812 });
  await shot(page, "375-00-start", true);
});

for (const { catalogue, scenario } of scenarios.filter((e) => e.scenario.id !== "dial-tone")) {
  const first = scenario.investigations[0]?.label ?? "";
  const second = scenario.investigations[1]?.label ?? "";
  const harmful = scenario.mitigations.find((m) => m.kind === "harmful")?.label ?? "";

  test.describe(`${catalogue} ${scenario.title}`, () => {
    test("flat view: the opening, under way, and after the trap", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await begin(page, scenario.title, "flat");
      await shot(page, `1440-${scenario.id}-1-flat-opening`);
      await order(page, first);
      await wait(page, 2);
      await order(page, second);
      await wait(page, 2);
      await shot(page, `1440-${scenario.id}-2-flat-under-way`);
      await order(page, harmful);
      await wait(page, 3);
      await shot(page, `1440-${scenario.id}-3-flat-after-the-trap`);
    });

    test("the room: under way, at the desk and at the board", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await begin(page, scenario.title, "room");
      await expect(page.locator(".room")).toHaveAttribute("data-ready", "true");
      await order(page, first);
      await wait(page, 2);
      await order(page, second);
      await wait(page, 3);
      await settled(page);
      await shot(page, `1440-${scenario.id}-4-room-desk`);
      await page.keyboard.press("Escape");
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("4");
      await settled(page);
      await shot(page, `1440-${scenario.id}-5-room-board`);
    });

    test("a phone: the opening in flat view", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await begin(page, scenario.title, "flat");
      await order(page, first);
      await wait(page, 2);
      await shot(page, `375-${scenario.id}-1-flat`);
    });
  });
}
