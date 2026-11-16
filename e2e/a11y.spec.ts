import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  makeSevere,
  openThread,
  order,
  station,
  toBriefing,
  toPlay,
  toRoom,
  wait,
} from "./helpers.js";

/** Fails on any serious or critical finding against WCAG 2.2 A and AA. */
async function check(page: Page, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const bad = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
  expect(bad).toEqual([]);
  // The scan must have looked at something, colour contrast included.
  expect(results.passes.map((p) => p.id)).toContain("color-contrast");
}

for (const width of [1440, 375]) {
  test.describe(`accessibility at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("start and briefing", async ({ page }) => {
      await page.goto("./");
      await check(page, "start");
      await toBriefing(page);
      await check(page, "briefing");
    });

    test("play: opening, a question, an unanswered thread and an open thread", async ({ page }) => {
      await toPlay(page);
      await check(page, "play at the start");
      await wait(page, 2);
      await order(page, "restart");
      await check(page, "play with a question and an unanswered thread");
      await openThread(page, "cto");
      await check(page, "play with a thread open");
      await openThread(page, "journalist");
      await check(page, "play with the press thread open");
    });

    test("play: severe, the end confirmation, the ending and the debrief", async ({ page }) => {
      await toPlay(page);
      await makeSevere(page);
      await check(page, "play when severe");
      await page.getByRole("button", { name: "End incident" }).click();
      await check(page, "end confirmation");
      await page.getByRole("button", { name: "End it" }).click();
      await check(page, "ended");
      await page.getByRole("button", { name: "Read the debrief" }).click();
      await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
      await check(page, "debrief");
    });

    test("the room: every station, with a question and an unanswered thread", async ({ page }) => {
      await toRoom(page);
      await check(page, "room at the desk");
      await wait(page, 2);
      await order(page, "restart");
      for (const name of ["Log", "Inbox", "Board", "Press"] as const) {
        await station(page, name);
        await check(page, `room at ${name}`);
      }
      await openThread(page, "cto");
      await check(page, "room with a thread open");
    });

    test("the room: severe, paused and with the keys listed", async ({ page }) => {
      await toRoom(page);
      await makeSevere(page);
      await wait(page, 2);
      await station(page, "Press");
      await check(page, "room when severe, at the television");
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await page.keyboard.press("?");
      await check(page, "room paused with the keys listed");
    });
  });
}
