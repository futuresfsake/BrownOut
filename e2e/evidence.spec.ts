// Writes the screenshots kept as evidence for milestone M3 stage A. Not part of the normal run:
// `npm run e2e:evidence`. Each state named in docs/03-design/ui-design.md that flat view has is
// captured at the three widths the milestone asks for.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { resolvedPlay } from "../tests/client/typed-play.js";
import {
  makeSevere,
  openThread,
  order,
  playSteps,
  showPanel,
  toBriefing,
  wait,
} from "./helpers.js";

const OUT = join(import.meta.dirname, "..", "testresults", "dod", "m3a", "screens");
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
];

for (const size of SIZES) {
  test.describe(`${size.width} px`, () => {
    test.use({ viewport: size });

    const shot = async (page: Page, name: string) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.screenshot({
        path: join(OUT, `${size.width}-${name}.png`),
        animations: "disabled",
      });
    };

    test("start, briefing and the opening", async ({ page }) => {
      await page.goto("./?seed=7&tick=600000");
      await shot(page, "01-start");
      await toBriefing(page);
      await shot(page, "02-briefing");
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect(page.getByLabel("What do you do?")).toBeVisible();
      await shot(page, "03-play-opening");
      await showPanel(page, "Board");
      await shot(page, "04-board-unknown-figures");
      await page.keyboard.press("Tab");
      await shot(page, "05-focus-ring");
    });

    test("a running task, a question, an unanswered thread, a promise", async ({ page }) => {
      await toBriefing(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await order(page, "has anything changed on the auth servers lately");
      await showPanel(page, "Log");
      await shot(page, "06-log-task-running");
      await wait(page, 2);
      await order(page, "restart");
      await shot(page, "07-did-you-mean");
      await page.getByRole("button", { name: "Something else" }).click();
      await order(page, "asdf qwer zxcv");
      await shot(page, "08-not-understood");
      await page.getByRole("button", { name: "None of these" }).click();
      await showPanel(page, "Inbox");
      await shot(page, "09-inbox-unanswered");
      await openThread(page, "cto");
      await page
        .getByLabel("Reply to Ramon Villareal")
        .fill("No ETA yet. I will update you in ten minutes.");
      await page.getByLabel("Reply to Ramon Villareal").press("Enter");
      await shot(page, "10-thread-promise");
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await showPanel(page, "Board");
      await shot(page, "11-paused");
    });

    test("severe, overdue, the end confirmation and an early ending", async ({ page }) => {
      await toBriefing(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await makeSevere(page);
      await wait(page, 2);
      await expect(page.locator(".play")).toHaveAttribute("data-severity", "2");
      await showPanel(page, "Board");
      await shot(page, "12-severe-board");
      await showPanel(page, "Inbox");
      await shot(page, "13-severe-inbox-overdue");
      await page.getByRole("button", { name: "End incident" }).click();
      await shot(page, "14-end-confirmation");
      await page.getByRole("button", { name: "End it" }).click();
      await showPanel(page, "Log");
      await shot(page, "15-ended-early");
    });

    test("the resolved ending and the debrief", async ({ page }) => {
      await toBriefing(page);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await playSteps(page, resolvedPlay);
      await showPanel(page, "Log");
      await shot(page, "16-resolved");
      await page.getByRole("button", { name: "Read the debrief" }).click();
      await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.screenshot({
        path: join(OUT, `${size.width}-17-debrief.png`),
        fullPage: true,
      });
    });
  });
}
