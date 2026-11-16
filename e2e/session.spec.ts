// Milestone M4 in a real browser, against the built site: the debrief and its timeline, saving a
// session to a file, opening one again, and watching a recording.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { resolvedPlay } from "../tests/client/typed-play.js";
import { GAME_URL, makeSevere, order, playSteps, ROOM_URL, settled, toPlay } from "./helpers.js";

const START_URL = "./?tick=600000&view=flat";

/** Plays the typed session to its resolved ending and opens the debrief. */
async function toDebrief(page: Page) {
  await toPlay(page);
  await playSteps(page, resolvedPlay);
  await page.getByRole("button", { name: "Read the debrief" }).click();
  await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
}

/** Presses "Save this session" and returns the saved file's text and name. */
async function saveSession(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save this session" }).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), text: readFileSync(path, "utf8") };
}

async function openFile(page: Page, text: string | Buffer, name = "session.json") {
  await page.getByLabel("Session file").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: typeof text === "string" ? Buffer.from(text, "utf8") : text,
  });
}

const replay = (page: Page) => page.getByRole("region", { name: /^Recorded session/ });
const stepOf = async (page: Page): Promise<[number, number]> => {
  const text = await replay(page).locator(".replay-count").innerText();
  const found = /step (\d+) of (\d+)/.exec(text);
  return [Number(found?.[1]), Number(found?.[2])];
};

test.describe("the debrief", () => {
  test("shows the score, the ending, the length and the seed", async ({ page }) => {
    await toDebrief(page);
    await expect(page.locator(".score-label")).toHaveText("Strong response");
    const facts = page.locator(".facts");
    await expect(facts).toContainText("Resolved");
    await expect(facts).toContainText("Seed7");
    await expect(facts).toContainText("02:14 to");
    for (const name of ["Containment", "Diagnosis", "Communication", "Honesty", "Duties"]) {
      await expect(page.getByRole("region", { name })).toBeVisible();
    }
  });

  test("selecting a line of the score goes to that moment on the timeline", async ({ page }) => {
    await toDebrief(page);
    const moments = page.getByRole("list", { name: "Timeline" }).getByRole("listitem");
    expect(await moments.count()).toBeGreaterThan(6);
    await expect(page.locator("[aria-current='true']")).toHaveCount(0);

    const line = page
      .getByRole("region", { name: "Diagnosis" })
      .getByRole("listitem")
      .filter({ hasText: "You found the root cause" });
    await line.getByRole("button").click();

    const now = page.locator(".moment[aria-current='true']");
    await expect(now).toHaveCount(1);
    await expect(now).toContainText("Cause found");
    await expect(now).toBeFocused();
    await expect(now).toBeInViewport();
    await expect(page.locator(".chart-mark-now")).toHaveCount(1);

    // Another line moves it; there is only ever one.
    await page
      .getByRole("region", { name: "Duties" })
      .getByRole("listitem")
      .first()
      .getByRole("button")
      .click();
    await expect(page.locator(".moment[aria-current='true']")).toHaveCount(1);
    await expect(page.locator(".moment[aria-current='true']")).not.toContainText("Cause found");
  });

  test("every line of the score and every point can be followed to the timeline", async ({
    page,
  }) => {
    await toDebrief(page);
    const lines = page.locator(".dimensions li");
    const count = await lines.count();
    expect(count).toBeGreaterThan(8);
    for (let n = 0; n < count; n++) {
      await expect(lines.nth(n).getByRole("button")).toHaveCount(1);
    }
    const points = page.locator(".points li");
    for (let n = 0; n < (await points.count()); n++) {
      await points.nth(n).getByRole("button").click();
      await expect(page.locator(".moment[aria-current='true']")).toHaveCount(1);
    }
  });

  test("draws the timeline as a chart with one tick for each moment listed", async ({ page }) => {
    await toDebrief(page);
    const moments = await page.locator(".moment").count();
    await expect(page.locator(".chart .chart-mark")).toHaveCount(moments);
    await expect(page.locator(".chart .chart-line")).toHaveCount(1);
    await expect(page.getByRole("img", { name: /^Customers affected from 02:14/ })).toBeVisible();
    // The times down the list never go backwards.
    const clocks = await page.locator(".moment time").allInnerTexts();
    expect(clocks).toEqual([...clocks].sort());
  });

  test("sets the stronger response beside what was done", async ({ page }) => {
    await toDebrief(page);
    const rows = page.locator("table.stronger tbody tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
    expect(await rows.count()).toBeLessThanOrEqual(8);
    await expect(rows.first()).toContainText("02:14");
    await expect(rows.first()).toContainText("Look at the overall picture");
    await expect(rows.first()).toContainText("You did this at 02:14, on time.");
    // Each step says why.
    for (let n = 0; n < (await rows.count()); n++) {
      expect((await rows.nth(n).locator(".stronger-why").innerText()).length).toBeGreaterThan(20);
    }
  });

  test("says what was not done, after a session that ended early", async ({ page }) => {
    await toPlay(page);
    await makeSevere(page);
    await page.getByRole("button", { name: "End incident" }).click();
    await page.getByRole("button", { name: "End it" }).click();
    await page.getByRole("button", { name: "Read the debrief" }).click();
    await expect(page.locator(".facts")).toContainText("Closed by you");
    await expect(page.locator("table.stronger")).toContainText("You did not do this.");
    await expect(page.locator(".moment-bad")).toContainText("Made it worse");
    await expect(page.getByRole("heading", { name: "What you missed" })).toBeVisible();
  });
});

test.describe("saving and opening a session", () => {
  test("a saved session opens again and replays to the same ending and score", async ({ page }) => {
    await toDebrief(page);
    const score = await page.locator(".score-number").innerText();
    const headline = await page.locator(".score + .serif").innerText();
    const moments = await page.locator(".moment").allInnerTexts();

    const saved = await saveSession(page);
    expect(saved.name).toBe("brownout-dial-tone-seed-7.json");
    await expect(page.getByRole("status").last()).toContainText(
      "Saved as brownout-dial-tone-seed-7.json",
    );
    const file = JSON.parse(saved.text) as { format: string; moves: unknown[]; result: object };
    expect(file.format).toBe("brownout-session");
    expect(file.moves).toHaveLength(resolvedPlay.length);
    expect(file.result).toMatchObject({ status: "resolved", score: Number(score) });

    // A different page load, as if on another day: nothing carries over but the file.
    await page.getByRole("button", { name: "All situations" }).click();
    await page.evaluate(() => window.sessionStorage.clear());
    await page.goto(START_URL);
    await openFile(page, saved.text);

    await expect(page.locator(".play")).toHaveAttribute("data-mode", "replay");
    await expect(page.getByText("You are watching a recorded session.")).toBeVisible();
    await expect(page.getByText("The situation has changed since")).toHaveCount(0);
    expect(await stepOf(page)).toEqual([0, resolvedPlay.length]);
    await replay(page).getByRole("button", { name: "To the end" }).click();
    await expect(page.getByRole("status").getByText("The incident is resolved.")).toBeVisible();

    await page.getByRole("button", { name: "Read the debrief" }).click();
    await expect(page.locator(".score-number")).toHaveText(score);
    await expect(page.locator(".score + .serif")).toHaveText(headline);
    expect(await page.locator(".moment").allInnerTexts()).toEqual(moments);
    await expect(page.getByText("recorded session that you watched")).toBeVisible();
  });

  test("saving and opening send nothing anywhere", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "").origin;
    await toDebrief(page);
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    const saved = await saveSession(page);
    await page.getByRole("button", { name: "All situations" }).click();
    await openFile(page, saved.text);
    await expect(page.locator(".play")).toHaveAttribute("data-mode", "replay");
    await replay(page).getByRole("button", { name: "To the end" }).click();
    // The download itself is a blob made in the page. Nothing else may appear, and nothing may
    // go to another origin.
    expect(requests.filter((url) => !url.startsWith("blob:"))).toEqual([]);
    expect(requests.filter((url) => url.startsWith("blob:") && !url.includes(origin))).toEqual([]);
  });

  test("a file that is not a session is refused, and nothing is opened", async ({ page }) => {
    await page.goto(START_URL);
    const refused = page.getByRole("alert");
    await expect(refused).toHaveText("");

    for (const bad of ["not json at all", "{}", '{"format":"brownout-session"}', "[1,2,3]"]) {
      await openFile(page, bad);
      await expect(refused).toContainText("not a BrownOut session");
      await expect(page.getByRole("heading", { name: "Situations" })).toBeVisible();
    }

    // Markup in a file is never drawn, in the message or anywhere else.
    await openFile(page, '{"format":"<img src=x onerror=document.title=1>","version":1}');
    await expect(refused).toContainText("not a BrownOut session");
    await expect(page.locator("img")).toHaveCount(0);
    await expect(page).toHaveTitle(/BrownOut/);
  });

  test("a file larger than 512 KB is refused without being read", async ({ page }) => {
    await page.goto(START_URL);
    await openFile(page, Buffer.alloc(512 * 1024 + 1, "a"));
    await expect(page.getByRole("alert")).toContainText("larger than 512 KB");
    await expect(page.getByRole("heading", { name: "Situations" })).toBeVisible();
  });

  test("a session from a newer version, or for an unknown situation, says so", async ({ page }) => {
    await toDebrief(page);
    const saved = await saveSession(page);
    await page.getByRole("button", { name: "All situations" }).click();
    const file = JSON.parse(saved.text) as Record<string, unknown>;

    await openFile(page, JSON.stringify({ ...file, version: 99 }));
    await expect(page.getByRole("alert")).toContainText("newer version of BrownOut");
    await openFile(page, JSON.stringify({ ...file, scenarioId: "no-such-situation" }));
    await expect(page.getByRole("alert")).toContainText("does not have");
    // A good file clears the message by opening.
    await openFile(page, saved.text);
    await expect(page.locator(".play")).toHaveAttribute("data-mode", "replay");
  });

  test("a file changed by hand still plays from its moves, and says it does not match", async ({
    page,
  }) => {
    await toDebrief(page);
    const saved = await saveSession(page);
    await page.getByRole("button", { name: "All situations" }).click();
    const file = JSON.parse(saved.text) as { moves: unknown[]; log: { text?: string }[] };
    file.moves = file.moves.slice(0, 4);
    file.log = file.log.map((e) => ({ ...e, text: "PLANTED" }));
    await openFile(page, JSON.stringify(file));

    await expect(page.getByText("The situation has changed since this was recorded")).toBeVisible();
    await replay(page).getByRole("button", { name: "To the end" }).click();
    expect(await stepOf(page)).toEqual([4, 4]);
    await expect(page.getByText("The recording stops here")).toBeVisible();
    await expect(page.getByText("PLANTED")).toHaveCount(0);
    await page.getByRole("button", { name: "Read the debrief so far" }).click();
    await expect(page.locator(".facts")).toContainText("Stopped while still running");
  });

  test("a reload in the middle of a session keeps the record, so the save is whole", async ({
    page,
  }) => {
    await toPlay(page);
    await playSteps(page, resolvedPlay.slice(0, 6));
    await page.reload();
    await playSteps(page, resolvedPlay.slice(6));
    await page.getByRole("button", { name: "Read the debrief" }).click();
    const saved = await saveSession(page);
    expect((JSON.parse(saved.text) as { moves: unknown[] }).moves).toHaveLength(
      resolvedPlay.length,
    );
  });
});

test.describe("watching a recording", () => {
  test("the sample plays from the start screen, a step at a time", async ({ page }) => {
    await page.goto(START_URL);
    await expect(page.getByRole("heading", { name: "Watch a session" })).toBeVisible();
    await page.getByRole("button", { name: "Watch the sample" }).click();

    await expect(page.locator(".play")).toHaveAttribute("data-mode", "replay");
    const [at, total] = await stepOf(page);
    expect(at).toBe(0);
    expect(total).toBeGreaterThan(10);
    await expect(replay(page)).toContainText("The opening.");
    await expect(replay(page).getByRole("button", { name: "Back", exact: true })).toBeDisabled();
    await expect(replay(page).getByRole("button", { name: "To the start" })).toBeDisabled();

    const log = page.getByRole("region", { name: "Log" });
    const lines = await log.getByRole("listitem").count();
    await replay(page).getByRole("button", { name: "Forward" }).click();
    expect((await stepOf(page))[0]).toBe(1);
    await expect(replay(page)).toContainText('Typed: "look at the overall picture"');
    expect(await log.getByRole("listitem").count()).toBeGreaterThan(lines);

    await replay(page).getByRole("button", { name: "Back", exact: true }).click();
    expect((await stepOf(page))[0]).toBe(0);
    await expect(log.getByRole("listitem")).toHaveCount(lines);
  });

  test("nothing can be changed while watching", async ({ page }) => {
    await page.goto(START_URL);
    await page.getByRole("button", { name: "Watch the sample" }).click();
    await expect(page.getByLabel("What do you do?")).toHaveCount(0);
    for (const name of ["Pause", "Wait", "Cancel task", "End incident"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    // Step to where the CTO has written, open the thread: it can be read but not answered.
    for (let n = 0; n < 3; n++) await replay(page).getByRole("button", { name: "Forward" }).click();
    await page
      .getByRole("region", { name: "Inbox" })
      .getByRole("button", { name: /^Ramon Villareal/ })
      .click();
    await expect(page.getByLabel("Reply to Ramon Villareal")).toBeDisabled();
    // The clock does not move by itself, however long the page is left.
    const facts = await page.locator(".strip-facts").innerText();
    await page.waitForTimeout(700);
    await expect(page.locator(".strip-facts")).toHaveText(facts);
  });

  test("plays by itself, stops when asked, and stops at the end", async ({ page }) => {
    await page.goto(START_URL);
    await page.getByRole("button", { name: "Watch the sample" }).click();
    await replay(page).getByRole("button", { name: "Play", exact: true }).click();
    await expect(replay(page).getByRole("button", { name: "Stop" })).toBeVisible();
    await expect.poll(async () => (await stepOf(page))[0], { timeout: 10_000 }).toBeGreaterThan(1);
    await replay(page).getByRole("button", { name: "Stop" }).click();
    const [stopped, total] = await stepOf(page);
    await page.waitForTimeout(1800);
    expect((await stepOf(page))[0]).toBe(stopped);

    // From one step before the end, playing takes the last step and then stops by itself.
    await replay(page).getByRole("button", { name: "To the end" }).click();
    await replay(page).getByRole("button", { name: "Back", exact: true }).click();
    await replay(page).getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => (await stepOf(page))[0], { timeout: 10_000 }).toBe(total);
    await expect(replay(page).getByRole("button", { name: "Play", exact: true })).toBeDisabled();
    await expect(page.getByRole("status").getByText("The incident is resolved.")).toBeVisible();
  });

  test("the arrow keys step and Space plays, and the list of keys says so", async ({ page }) => {
    await page.goto(START_URL);
    await page.getByRole("button", { name: "Watch the sample" }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    expect((await stepOf(page))[0]).toBe(2);
    await page.keyboard.press("ArrowLeft");
    expect((await stepOf(page))[0]).toBe(1);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    expect((await stepOf(page))[0]).toBe(0);

    await page.keyboard.press("Space");
    await expect(replay(page).getByRole("button", { name: "Stop" })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(replay(page).getByRole("button", { name: "Play", exact: true })).toBeVisible();

    await page.keyboard.press("?");
    const keys = page.getByRole("region", { name: "Keys" });
    await expect(keys).toContainText("One step forward in the recording.");
    await expect(keys).not.toContainText("Pause or resume the clock");
  });

  test("leaving a sample goes back to the start screen, and it can be played for real", async ({
    page,
  }) => {
    await page.goto(START_URL);
    await page.getByRole("button", { name: "Watch the sample" }).click();
    await page.getByRole("button", { name: "Leave" }).click();
    await expect(page.getByRole("heading", { name: "Situations" })).toBeVisible();

    await page.getByRole("button", { name: "Watch the sample" }).click();
    await replay(page).getByRole("button", { name: "To the end" }).click();
    await page.getByRole("button", { name: "Read the debrief" }).click();
    await expect(page.locator(".moment-bad").first()).toBeVisible();
    await page.getByRole("button", { name: "Play again, same seed" }).click();
    await expect(page.locator(".play")).toHaveAttribute("data-mode", "play");
    await expect(page.getByLabel("What do you do?")).toBeEnabled();
    await expect(page.locator(".strip-facts")).toContainText("02:14");
  });

  test("a player can watch their own session back from the debrief, and return to it", async ({
    page,
  }) => {
    await toDebrief(page);
    const score = await page.locator(".score-number").innerText();
    await page.getByRole("button", { name: "Watch it back" }).click();
    await expect(page.locator(".play")).toHaveAttribute("data-mode", "replay");
    expect(await stepOf(page)).toEqual([0, resolvedPlay.length]);
    await replay(page).getByRole("button", { name: "Forward" }).click();
    await page.getByRole("button", { name: "Leave" }).click();
    await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
    await expect(page.locator(".score-number")).toHaveText(score);
    // The player's own session was not touched by being watched.
    await page.reload();
    await expect(page.getByRole("status").getByText("The incident is resolved.")).toBeVisible();
  });

  test("watching does not disturb a game the player has saved in the tab", async ({ page }) => {
    await toPlay(page);
    await order(page, "find out what changed on auth-core");
    const saved = await page.evaluate(() => window.sessionStorage.getItem("brownout.game"));
    expect(saved).toContain('"moves"');
  });

  test("the room follows a recording: it goes dark and comes back", async ({ page }) => {
    await page.goto(ROOM_URL);
    await page.getByRole("button", { name: "Watch the sample" }).click();
    const room = page.locator(".room");
    await expect(room).toHaveAttribute("data-ready", "true");
    await expect(room).toHaveAttribute("data-level", "1");
    const levels = new Set<string>();
    const [, total] = await stepOf(page);
    for (let n = 0; n < total; n++) {
      await replay(page).getByRole("button", { name: "Forward" }).click();
      levels.add((await room.getAttribute("data-level")) ?? "");
    }
    expect([...levels].sort()).toEqual(["0", "1", "2"]);
    await expect(room).toHaveAttribute("data-level", "0");
    await expect(room).toHaveAttribute("data-clock", "stopped");
    await settled(page);
    // Going back puts the lights back as they were.
    await replay(page).getByRole("button", { name: "To the start" }).click();
    await expect(room).toHaveAttribute("data-level", "1");
    await expect(room).toHaveAttribute("data-clock", "running");
  });

  test("on a phone the controls fit and the recording can be stepped", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(GAME_URL);
    await page.getByRole("button", { name: "Watch the sample" }).click();
    await replay(page).getByRole("button", { name: "Forward" }).click();
    expect((await stepOf(page))[0]).toBe(1);
    await expect(replay(page).getByRole("button", { name: "To the end" })).toBeInViewport();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button")]
        .filter((el) => el.offsetParent !== null && !el.classList.contains("link"))
        .map((el) => ({ name: el.innerText, h: el.getBoundingClientRect().height }))
        .filter((x) => x.h < 44),
    );
    expect(small).toEqual([]);
  });
});
