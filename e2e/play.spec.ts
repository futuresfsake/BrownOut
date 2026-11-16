import { expect, test } from "@playwright/test";
import { dialTone } from "../src/scenarios/dial-tone/scenario.js";
import { resolvedPlay } from "../tests/client/typed-play.js";
import {
  GAME_URL,
  openThread,
  order,
  playSteps,
  reply,
  showPanel,
  toBriefing,
  toPlay,
  wait,
} from "./helpers.js";

test.describe("flat view", () => {
  test("plays Dial Tone from the briefing to the resolved ending by typing", async ({ page }) => {
    const refused: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") refused.push(m.text());
    });
    page.on("pageerror", (e) => refused.push(e.message));

    await toBriefing(page);
    await expect(page.getByText(dialTone.briefing.role).first()).toBeVisible();
    await page.getByRole("button", { name: "Start", exact: true }).click();

    const log = page.getByRole("region", { name: "Log" });
    await expect(log).toContainText("ALERT 02:14");

    await playSteps(page, resolvedPlay);

    await expect(page.getByText("The incident is resolved.").first()).toBeVisible();
    await expect(page.getByLabel("What do you do?")).toBeDisabled();
    await page.getByRole("button", { name: "Read the debrief" }).click();

    await expect(page.getByRole("heading", { name: `Debrief: ${dialTone.title}` })).toBeVisible();
    const score = Number(await page.locator(".score-number").innerText());
    expect(score).toBeGreaterThanOrEqual(85);
    await expect(page.getByRole("heading", { name: "A stronger response" })).toBeVisible();

    // Nothing was blocked by the content security policy and nothing threw.
    expect(refused).toEqual([]);
  });

  test("shows an order at once, then how it was read, then the result", async ({ page }) => {
    await toPlay(page);
    const log = page.getByRole("region", { name: "Log" });
    await order(page, "has anything changed on the auth servers lately");
    await expect(log).toContainText("has anything changed on the auth servers lately");
    await expect(log).toContainText("Read as");
    await expect(log).toContainText("Find out what changed on auth-core");
    await showPanel(page, "Board");
    await expect(page.getByRole("region", { name: "Board" })).toContainText("min left");
    await page.getByRole("button", { name: "Wait", exact: true }).click();
    await expect(log).toContainText("certificate rotation ran on auth-core at 01:52");
    await expect(page.getByRole("region", { name: "Board" })).toContainText(
      "Free. Waiting for an order.",
    );
  });

  test("asks when unsure, and offers the nearest options when lost", async ({ page }) => {
    await toPlay(page);
    await order(page, "restart");
    const question = page.getByRole("group", { name: "Did you mean" });
    await expect(question).toContainText("No time passes until you choose.");
    await expect(page.getByRole("region", { name: "Board" })).toContainText("T+0 min");
    await question.getByRole("button", { name: "Something else" }).click();
    await expect(question).toHaveCount(0);

    await order(page, "asdf qwer zxcv");
    const nearest = page.getByRole("group", { name: /Not understood/ });
    await expect(nearest.getByRole("button")).not.toHaveCount(0);
    await expect(page.getByRole("region", { name: "Board" })).toContainText("T+1 min");
    await nearest.getByRole("button", { name: "None of these" }).click();
    await expect(nearest).toHaveCount(0);
  });

  test("the board shows unknown figures as a dash and the word", async ({ page }) => {
    await toPlay(page);
    const board = page.getByRole("region", { name: "Board" });
    await expect(board.getByText("unknown").first()).toBeVisible();
    await expect(board).toContainText("02:14");
    await expect(board).toContainText(/Normal|Incident running|Severe/);
  });

  test("marks an unanswered thread in words and shows a promise with its due time", async ({
    page,
  }) => {
    await toPlay(page);
    await wait(page);
    const inbox = page.getByRole("region", { name: "Inbox" });
    await expect(inbox.getByRole("button", { name: /Ramon Villareal.*Unanswered/ })).toBeVisible();
    await expect(page.locator(".strip-facts")).toContainText("1 waiting");

    await reply(page, "cto", "No ETA yet. I will update you in ten minutes.");
    await expect(page.getByRole("list", { name: "Your promises to this person" })).toContainText(
      /You promised an update by \d\d:\d\d: open/,
    );
    await page.getByRole("button", { name: "Back to inbox" }).click();
    await expect(inbox.getByRole("button", { name: /Ramon Villareal.*Unanswered/ })).toHaveCount(0);
    await expect(inbox.getByRole("heading", { name: "Press" })).toBeVisible();
  });

  test("the log points to the thread that wrote", async ({ page }) => {
    await toPlay(page);
    await wait(page);
    await page.getByRole("button", { name: "Ramon Villareal wrote to you." }).click();
    await expect(page.getByLabel("Reply to Ramon Villareal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  });

  test("the idle clock moves one minute at a time, and pause stops it", async ({ page }) => {
    await toPlay(page, "./?seed=7&tick=300");
    const board = page.getByRole("region", { name: "Board" });
    await expect(board).toContainText("T+2 min");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(board).toContainText("paused");
    const frozen = await board.locator(".clock").innerText();
    await page.waitForTimeout(1200);
    await expect(board.locator(".clock")).toHaveText(frozen);
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(board.locator(".clock")).not.toHaveText(frozen);
  });

  test("ending early asks first, and can be called off", async ({ page }) => {
    await toPlay(page);
    await page.getByRole("button", { name: "End incident" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("It is not resolved.");
    await dialog.getByRole("button", { name: "Keep going" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel("What do you do?")).toBeEnabled();

    await page.getByRole("button", { name: "End incident" }).click();
    await page.getByRole("button", { name: "End it" }).click();
    await expect(page.getByText("You closed the incident.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Read the debrief" }).click();
    await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
    await page.getByRole("button", { name: "All situations" }).click();
    await expect(page.getByRole("heading", { name: "Situations" })).toBeVisible();
  });

  test("a reload keeps the session", async ({ page }) => {
    await toPlay(page);
    await order(page, "find out what changed on auth-core");
    await page.reload();
    await expect(page.getByRole("region", { name: "Log" })).toContainText(
      "Find out what changed on auth-core",
    );
    await expect(page.getByRole("region", { name: "Board" })).toContainText("T+1 min");
  });

  test("a damaged save is dropped and the start screen opens", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await toPlay(page);
    for (const broken of [
      "not json",
      JSON.stringify({ v: 1, game: { scenarioId: "dial-tone", feed: [], session: { minute: 3 } } }),
    ]) {
      await page.evaluate((text) => window.sessionStorage.setItem("brownout.game", text), broken);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Situations" })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("replaying the same seed gives the same opening", async ({ page }) => {
    await toPlay(page);
    await page.getByRole("button", { name: "End incident" }).click();
    await page.getByRole("button", { name: "End it" }).click();
    await page.getByRole("button", { name: "Read the debrief" }).click();
    await expect(page.getByText("Seed 7.")).toBeVisible();
    await page.getByRole("button", { name: "Play again, same seed" }).click();
    await expect(page.getByRole("region", { name: "Log" })).toContainText("ALERT 02:14");
    await expect(page.getByRole("region", { name: "Board" })).toContainText("T+0 min");
  });
});

test.describe("the page keeps to itself", () => {
  test("loads only its own files and sends nothing while playing", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "").origin;
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));

    await toPlay(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.filter((url) => !url.startsWith(origin) && !url.startsWith("data:"))).toEqual(
      [],
    );

    const loaded = requests.length;
    await order(page, "find out what changed on auth-core");
    await page.getByRole("button", { name: "Wait", exact: true }).click();
    await reply(page, "cto", "No ETA yet. I will update you in ten minutes.");
    await page.getByRole("button", { name: "End incident" }).click();
    await page.getByRole("button", { name: "End it" }).click();
    await page.getByRole("button", { name: "Read the debrief" }).click();
    await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
    expect(requests.slice(loaded)).toEqual([]);
  });

  test("the built page carries a policy that allows no outside origin", async ({ page }) => {
    await page.goto("./");
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).not.toContain("unsafe");
    expect(policy).not.toMatch(/https?:/);
  });
});

test.describe("the idle clock", () => {
  test("one sim minute passes every 15 real seconds by default", async ({ page }) => {
    await page.clock.install();
    await toPlay(page, "./?seed=7");
    const board = page.getByRole("region", { name: "Board" });
    await expect(board).toContainText("T+0 min");
    await page.clock.fastForward(14_000);
    await expect(board).toContainText("T+0 min");
    await page.clock.fastForward(1_000);
    await expect(board).toContainText("T+1 min");
    await page.clock.fastForward(15_000);
    await expect(board).toContainText("T+2 min");
  });
});

test.describe("keyboard only", () => {
  test("plays from the start screen to the debrief without a pointer", async ({ page }) => {
    await page.goto(GAME_URL);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Read the briefing" }).first()).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("button", { name: "Start", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");

    // Pause is the first control on the play screen.
    await page.keyboard.press("Tab");
    const pause = page.getByRole("button", { name: "Pause", exact: true });
    await expect(pause).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
    await page.keyboard.press("Enter");

    // "/" jumps to the decision box from anywhere that is not a field.
    await page.keyboard.press("/");
    const box = page.getByLabel("What do you do?");
    await expect(box).toBeFocused();
    await page.keyboard.type("find out what changed on auth-core");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Log" })).toContainText("on it");

    // A "did you mean" is answered with Tab and Enter.
    await page.keyboard.type("restart");
    await page.keyboard.press("Enter");
    const question = page.getByRole("group", { name: "Did you mean" });
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "Something else" }).focus();
    await page.keyboard.press("Enter");
    await expect(question).toHaveCount(0);

    // Space pauses when focus is not in a field or on a button.
    await page.locator("body").focus();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(pause).toBeVisible();

    // End the incident: the safe answer has focus, the other is one Shift+Tab away.
    await page.getByRole("button", { name: "End incident" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Keep going" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("button", { name: "End it" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("button", { name: "Read the debrief" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
  });

  test("every control on the play screen shows focus", async ({ page }) => {
    await toPlay(page);
    await wait(page);
    await page.locator("body").focus();
    const seen = new Set<string>();
    for (let n = 0; n < 40; n++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        return {
          name: el.getAttribute("aria-label") ?? el.innerText.trim().slice(0, 40) ?? el.id,
          id: el.id,
          ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (!info) continue;
      const key = info.id || info.name;
      if (seen.has(key)) break;
      seen.add(key);
      expect(info.ring, `${key} has no focus ring`).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect([...seen]).toContain("decision-box");
  });
});

test.describe("phone", () => {
  for (const width of [375, 360]) {
    test(`fits ${width} px with no sideways scroll and 44 px targets`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await toPlay(page);
      await wait(page, 2);
      await order(page, "restart");

      const tabs = page.getByRole("navigation", { name: "Panels" });
      await expect(tabs).toBeVisible();

      for (const panel of ["Log", "Inbox", "Board"] as const) {
        await showPanel(page, panel);
        await expect(page.getByRole("region", { name: panel })).toBeVisible();
        // The decision box stays on screen whichever panel is open.
        await expect(page.getByLabel("What do you do?")).toBeInViewport();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${panel} scrolls sideways`).toBeLessThanOrEqual(0);
      }

      await openThread(page, "cto");
      await expect(page.getByLabel("Reply to Ramon Villareal")).toBeVisible();

      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("button, input")]
          .filter((el) => el.offsetParent !== null && !el.classList.contains("link"))
          .map((el) => ({ name: el.innerText || el.id, h: el.getBoundingClientRect().height }))
          .filter((x) => x.h < 44),
      );
      expect(small).toEqual([]);
    });
  }

  test("counts the people waiting on the inbox tab", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await toPlay(page);
    await wait(page);
    await expect(
      page.getByRole("navigation", { name: "Panels" }).getByRole("button", { name: "Inbox (1)" }),
    ).toBeVisible();
  });
});
