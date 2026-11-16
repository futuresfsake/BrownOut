import { expect, type Page } from "@playwright/test";
import { dialTone } from "../src/scenarios/dial-tone/scenario.js";
import { SEED, type TypedStep } from "../tests/client/typed-play.js";

/** A fixed seed, and an idle clock so slow that it never ticks during a test. */
export const GAME_URL = `./?seed=${SEED}&tick=600000`;

export const nameOf = (id: string): string =>
  dialTone.stakeholders.find((s) => s.id === id)?.name ?? id;

export async function toBriefing(page: Page, url = GAME_URL) {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Situations" })).toBeVisible();
  await page.getByRole("button", { name: "Read the briefing" }).first().click();
  await expect(page.getByRole("heading", { name: dialTone.title })).toBeVisible();
}

export async function toPlay(page: Page, url = GAME_URL) {
  await toBriefing(page, url);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByLabel("What do you do?")).toBeVisible();
}

/** On narrow screens the panels are tabs. On wide screens there are no tabs to press. */
export async function showPanel(page: Page, panel: "Log" | "Inbox" | "Board") {
  const tab = page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: new RegExp(`^${panel}`) });
  if (await tab.isVisible()) await tab.click();
}

/** Presses Wait, which moves the clock to the next thing that happens. */
export async function wait(page: Page, times = 1) {
  for (let n = 0; n < times; n++) {
    await page.getByRole("button", { name: "Wait", exact: true }).click();
  }
}

/** Orders the harmful restart and waits until the incident is severe. */
export async function makeSevere(page: Page) {
  await order(page, "restart every auth-core node");
  const play = page.locator(".play");
  for (let n = 0; n < 8 && (await play.getAttribute("data-severity")) !== "2"; n++) {
    await wait(page);
  }
  await expect(play).toHaveAttribute("data-severity", "2");
}

export async function order(page: Page, text: string) {
  const box = page.getByLabel("What do you do?");
  await box.fill(text);
  await box.press("Enter");
  await expect(box).toHaveValue("");
}

export async function openThread(page: Page, threadId: string) {
  await showPanel(page, "Inbox");
  const back = page.getByRole("button", { name: "Back to inbox" });
  if (await back.isVisible()) await back.click();
  await page
    .getByRole("region", { name: "Inbox" })
    .getByRole("button", { name: new RegExp(`^${nameOf(threadId)}`) })
    .click();
  await expect(page.getByRole("heading", { name: nameOf(threadId) })).toBeVisible();
}

export async function reply(page: Page, threadId: string, text: string) {
  await openThread(page, threadId);
  const box = page.getByLabel(`Reply to ${nameOf(threadId)}`);
  await box.fill(text);
  await box.press("Enter");
  await expect(box).toHaveValue("");
}

export async function playSteps(page: Page, steps: readonly TypedStep[]) {
  for (const step of steps) {
    if (step.thread) await reply(page, step.thread, step.text);
    else await order(page, step.text);
  }
}
