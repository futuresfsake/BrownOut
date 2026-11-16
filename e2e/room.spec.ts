// The 3D room, driven in a real browser against the built site. A headless browser draws WebGL
// in software, so these prove what the room does, not how fast it does it: the frame-rate
// readings are taken separately (see testresults/dod/m3b/frame-rates.txt).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { resolvedPlay } from "../tests/client/typed-play.js";
import {
  frames,
  GAME_URL,
  makeSevere,
  openThread,
  order,
  playSteps,
  ROOM_URL,
  settled,
  station,
  toBriefing,
  toPlay,
  toRoom,
  wait,
} from "./helpers.js";

const room = (page: Page) => page.locator(".room");
const box = (page: Page) => page.getByLabel("What do you do?");
const stations = (page: Page) => page.getByRole("navigation", { name: "Stations" });

test.describe("the room keeps to itself", () => {
  test("loads only its own files, breaks no policy, and sends nothing while playing", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "").origin;
    const requests: string[] = [];
    const refused: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    // A browser reports anything the content security policy refuses as a console error.
    page.on("console", (m) => {
      if (m.type() === "error") refused.push(m.text());
    });
    page.on("pageerror", (e) => refused.push(e.message));

    await toRoom(page);
    expect(requests.some((url) => url.includes("/assets/Room-"))).toBe(true);
    expect(requests.filter((url) => !url.startsWith(origin) && !url.startsWith("data:"))).toEqual(
      [],
    );

    const loaded = requests.length;
    await page.getByRole("button", { name: "Turn sound on" }).click();
    await order(page, "find out what changed on auth-core");
    await wait(page, 2);
    await makeSevere(page);
    await wait(page, 2);
    for (const label of ["Log", "Inbox", "Board", "Press", "Desk"] as const) {
      await station(page, label);
    }
    expect(requests.slice(loaded)).toEqual([]);
    expect(refused).toEqual([]);
  });
});

test.describe("the room", () => {
  test("plays Dial Tone from the briefing to the resolved ending", async ({ page }) => {
    await toRoom(page);
    await playSteps(page, resolvedPlay);
    await expect(page.getByRole("status").getByText("The incident is resolved.")).toBeVisible();
    await expect(room(page)).toHaveAttribute("data-level", "0");
    await expect(room(page)).toHaveAttribute("data-clock", "stopped");
    await page.getByRole("button", { name: "Read the debrief" }).click();
    await expect(page.getByRole("heading", { name: /^Debrief/ })).toBeVisible();
  });

  test("opens in the room by default, with no panel at the desk", async ({ page }) => {
    await toRoom(page, "./?seed=7&tick=600000");
    await expect(page.locator(".play")).toHaveAttribute("data-view", "room");
    await expect(room(page)).toHaveAttribute("data-station", "desk");
    await expect(page.locator(".play")).toHaveAttribute("data-panel", "none");
    await expect(page.locator(".col:visible")).toHaveCount(0);
  });

  test("each station opens its panel, and the box and the strip stay on screen", async ({
    page,
  }) => {
    await toRoom(page);
    const panels = { Log: "log", Inbox: "inbox", Board: "board", Press: "press" } as const;
    for (const [label, panel] of Object.entries(panels)) {
      await station(page, label as keyof typeof panels);
      await expect(room(page)).toHaveAttribute("data-station", panel);
      await expect(page.locator(".play")).toHaveAttribute("data-panel", panel);
      await expect(page.locator(".col:visible")).toHaveCount(1);
      await expect(box(page)).toBeInViewport();
      await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeInViewport();
      await expect(page.locator(".strip-facts")).toBeInViewport();
    }
    await expect(page.getByRole("heading", { name: "Press", exact: true })).toBeVisible();
    await station(page, "Inbox");
    await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
    // The phone lists people; the press is at the television.
    await expect(page.locator(".col-inbox")).not.toContainText("Carla Whitlock");
  });

  test("keys 1 to 5 move between stations and Escape returns to the desk", async ({ page }) => {
    await toRoom(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const keys = { "2": "log", "3": "inbox", "4": "board", "5": "press", "1": "desk" };
    for (const [key, id] of Object.entries(keys)) {
      await page.keyboard.press(key);
      await expect(room(page)).toHaveAttribute("data-station", id);
    }
    await page.keyboard.press("4");
    await page.keyboard.press("Escape");
    await expect(room(page)).toHaveAttribute("data-station", "desk");

    // A number typed into the box is text, not a move.
    await box(page).fill("");
    await box(page).press("3");
    await expect(box(page)).toHaveValue("3");
    await expect(room(page)).toHaveAttribute("data-station", "desk");
  });

  test("every station is reachable with Tab and Enter, and names its object", async ({ page }) => {
    await toRoom(page);
    const buttons = stations(page).getByRole("button");
    await expect(buttons).toHaveCount(5);
    await expect(buttons.nth(3)).toHaveAccessibleName("4 Board");
    await expect(buttons.nth(3)).toHaveAccessibleDescription("The wall board");
    await expect(buttons.nth(0)).toHaveAttribute("aria-current", "page");

    await buttons.nth(0).focus();
    for (const id of ["log", "inbox", "board", "press"]) {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect(room(page)).toHaveAttribute("data-station", id);
    }
    await expect(buttons.nth(4)).toHaveAttribute("aria-current", "page");
  });

  test("clicking an object goes to its station", async ({ page }) => {
    await toRoom(page);
    const canvas = page.locator(".room canvas");
    const size = await canvas.boundingBox();
    if (!size) throw new Error("no canvas");
    // From the desk the wall board is left of centre and the television is to the right.
    await canvas.click({ position: { x: size.width * 0.32, y: size.height * 0.42 } });
    await expect(room(page)).toHaveAttribute("data-station", "board");
    await page.keyboard.press("Escape");
    await settled(page);
    await canvas.click({ position: { x: size.width * 0.74, y: size.height * 0.4 } });
    await expect(room(page)).toHaveAttribute("data-station", "press");
  });

  test("the room shows what needs attention, from the same state as the panels", async ({
    page,
  }) => {
    await toRoom(page);
    await expect(room(page)).toHaveAttribute("data-level", "1");
    await expect(room(page)).toHaveAttribute("data-phone", "off");
    await expect(room(page)).toHaveAttribute("data-tv", "false");
    await expect(room(page)).toHaveAttribute("data-mika", "false");

    await order(page, "find out what changed on auth-core");
    await expect(room(page)).toHaveAttribute("data-mika", "true");
    await wait(page);
    await expect(room(page)).toHaveAttribute("data-mika", "false");

    await wait(page);
    await expect(room(page)).toHaveAttribute("data-phone", "on");
    await expect(stations(page).getByRole("button", { name: /Inbox \(1\)/ })).toBeVisible();
    await expect(room(page).locator(".visually-hidden")).toContainText(
      "Phone lit: Ramon Villareal is waiting.",
    );

    await makeSevere(page);
    await expect(room(page)).toHaveAttribute("data-level", "2");
    await expect(room(page)).toHaveAttribute("data-strip", "true");
    await wait(page, 2);
    await expect(room(page)).toHaveAttribute("data-tv", "true");
    await expect(stations(page).getByRole("button", { name: /Press \(1\)/ })).toBeVisible();
  });

  test("pausing stops the clock in the room and says so", async ({ page }) => {
    await toRoom(page);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(room(page)).toHaveAttribute("data-clock", "stopped");
    await expect(room(page).getByText("Paused", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(room(page)).toHaveAttribute("data-clock", "running");
  });

  test("draws no frames while nothing changes", async ({ page }) => {
    await toRoom(page);
    await station(page, "Board");
    const before = await frames(page);
    await page.waitForTimeout(1500);
    expect(await frames(page)).toBe(before);
    // Something changing draws again.
    await order(page, "find out what changed on auth-core");
    await expect.poll(() => frames(page)).toBeGreaterThan(before);
  });

  test("stays inside the budget for draw calls and triangles at every station", async ({
    page,
  }) => {
    await toRoom(page);
    await makeSevere(page);
    await wait(page, 2);
    for (const label of ["Desk", "Log", "Inbox", "Board", "Press"] as const) {
      await station(page, label);
      const calls = Number(await room(page).getAttribute("data-calls"));
      const triangles = Number(await room(page).getAttribute("data-triangles"));
      expect(calls, `${label}: draw calls`).toBeGreaterThan(0);
      expect(calls, `${label}: draw calls`).toBeLessThan(80);
      expect(triangles, `${label}: triangles`).toBeLessThan(60_000);
    }
  });

  test("with reduced motion a move is a cut, not a glide", async ({ browser }) => {
    const count = async (reducedMotion: "reduce" | "no-preference") => {
      const context = await browser.newContext({
        reducedMotion,
        viewport: { width: 1440, height: 900 },
        baseURL: "http://localhost:4173/",
      });
      const page = await context.newPage();
      await toRoom(page);
      const before = await frames(page);
      await station(page, "Board");
      const drawn = (await frames(page)) - before;
      await context.close();
      return drawn;
    };
    const cut = await count("reduce");
    const glide = await count("no-preference");
    expect(cut).toBeGreaterThan(0);
    expect(cut).toBeLessThanOrEqual(4);
    expect(glide).toBeGreaterThan(cut);
  });
});

test.describe("switching views", () => {
  // Short, so that the log is longer than its column and has somewhere to scroll.
  test.use({ viewport: { width: 1280, height: 560 } });

  test("keeps the session, the typed text, the open thread and the place in the log", async ({
    page,
  }) => {
    await toRoom(page);
    await order(page, "find out what changed on auth-core");
    await wait(page, 2);
    await makeSevere(page);
    await wait(page, 3);

    await station(page, "Log");
    const log = page.locator(".col-log");
    expect(await log.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(80);
    await log.evaluate((el) => (el.scrollTop = 40));
    await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBe(40);
    await box(page).fill("half an order");
    const clock = await page.locator(".strip-facts").innerText();
    const lines = await log.locator("li").count();

    await page.getByRole("button", { name: "Flat view" }).click();
    await expect(page.locator(".play")).toHaveAttribute("data-view", "flat");
    await expect(page.locator(".room")).toHaveCount(0);
    await expect(box(page)).toHaveValue("half an order");
    await expect(page.locator(".strip-facts")).toHaveText(clock);
    await expect(log.locator("li")).toHaveCount(lines);
    await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBe(40);

    await page.getByRole("button", { name: "3D view" }).click();
    await expect(room(page)).toHaveAttribute("data-ready", "true");
    await expect(room(page)).toHaveAttribute("data-station", "log");
    await expect(box(page)).toHaveValue("half an order");
    await expect(page.locator(".strip-facts")).toHaveText(clock);
    await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBe(40);
  });

  test("a thread opened in one view is open in the other", async ({ page }) => {
    await toRoom(page);
    await wait(page, 2);
    await openThread(page, "cto");
    await page.getByLabel("Reply to Ramon Villareal").fill("half a reply");
    await page.getByRole("button", { name: "Flat view" }).click();
    await expect(page.getByRole("heading", { name: "Ramon Villareal" })).toBeVisible();
    await page.getByRole("button", { name: "3D view" }).click();
    await expect(page.getByRole("heading", { name: "Ramon Villareal" })).toBeVisible();
  });

  test("remembers the view chosen, and the address bar wins over it", async ({ page }) => {
    await toRoom(page, "./?seed=7&tick=600000");
    await page.getByRole("button", { name: "Flat view" }).click();
    await page.reload();
    await expect(page.locator(".play")).toHaveAttribute("data-view", "flat");
    await page.goto(ROOM_URL);
    await expect(page.locator(".play")).toHaveAttribute("data-view", "room");
  });
});

test.describe("when the room cannot be drawn", () => {
  /** A browser with no WebGL 2: asking a canvas for it gives nothing. */
  const withoutWebGL = (page: Page) =>
    page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
        if (kind.startsWith("webgl")) return null;
        return (real as (this: HTMLCanvasElement, kind: string) => unknown).call(this, kind);
      } as typeof real;
    });

  test("starts in flat view, says why, and never downloads the 3D code", async ({ page }) => {
    const fetched: string[] = [];
    page.on("request", (r) => fetched.push(new URL(r.url()).pathname));
    await withoutWebGL(page);
    await toPlay(page, ROOM_URL);
    await expect(page.locator(".play")).toHaveAttribute("data-view", "flat");
    await expect(page.getByText("This browser cannot draw the 3D room")).toBeVisible();
    await expect(page.getByRole("button", { name: "3D view" })).toBeDisabled();
    expect(fetched.filter((p) => /Room/.test(p))).toEqual([]);

    // The game is all there.
    await order(page, "find out what changed on auth-core");
    await expect(page.getByRole("region", { name: "Log" })).toContainText("on it");
    await page.getByRole("button", { name: "Close this note" }).click();
    await expect(page.getByText("This browser cannot draw the 3D room")).toHaveCount(0);
  });

  test("falls back to flat view when the graphics context is lost and does not return", async ({
    page,
  }) => {
    await toRoom(page);
    await order(page, "find out what changed on auth-core");
    await box(page).fill("still here");
    await page.locator(".room canvas").evaluate((canvas: HTMLCanvasElement) => {
      canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
    });
    await expect(page.locator(".play")).toHaveAttribute("data-view", "flat", { timeout: 8000 });
    await expect(page.getByText("The 3D room stopped drawing")).toBeVisible();
    await expect(box(page)).toHaveValue("still here");
    await expect(page.getByRole("region", { name: "Log" })).toContainText("on it");
  });
});

test.describe("loading the 3D code", () => {
  const isRoomChunk = (url: string) => /\/assets\/Room-[^/]+\.js$/.test(new URL(url).pathname);

  test("is one separate file, under 300 KB compressed", () => {
    const assets = join(import.meta.dirname, "..", "dist", "assets");
    const chunks = readdirSync(assets).filter((name) => /^Room-.+.js$/.test(name));
    expect(chunks).toHaveLength(1);
    const compressed = gzipSync(readFileSync(join(assets, chunks[0] ?? ""))).length;
    expect(compressed).toBeLessThan(300 * 1024);
    // The first download does not carry three.js.
    const first = readdirSync(assets).filter((name) => /^index-.+.js$/.test(name));
    expect(first).toHaveLength(1);
    expect(readFileSync(join(assets, first[0] ?? ""), "utf8")).not.toContain("WebGLRenderer");
  });

  test("the start screen does not ask for it, the briefing does", async ({ page }) => {
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (isRoomChunk(r.url())) fetched.push(r.url());
    });
    await page.goto(ROOM_URL);
    await expect(page.getByRole("button", { name: "Read the briefing" }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(fetched).toEqual([]);

    await toBriefing(page, ROOM_URL);
    await expect.poll(() => fetched.length).toBe(1);
  });

  test("the page is usable while the 3D code is still on its way", async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) => isRoomChunk(url.href),
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await toBriefing(page, ROOM_URL);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await expect(page.getByText("Loading the room.")).toBeVisible();
    // The game does not wait for the room.
    await order(page, "find out what changed on auth-core");
    await expect(page.locator(".strip-facts")).toContainText("02:15");
    release();
    await expect(room(page)).toHaveAttribute("data-ready", "true");
    await expect(room(page)).toHaveAttribute("data-mika", "true");
  });

  test("flat view never downloads it", async ({ page }) => {
    const fetched: string[] = [];
    page.on("request", (r) => {
      if (isRoomChunk(r.url())) fetched.push(r.url());
    });
    await toPlay(page, GAME_URL);
    await order(page, "find out what changed on auth-core");
    await page.waitForLoadState("networkidle");
    expect(fetched).toEqual([]);
  });
});

test.describe("sound and the list of keys", () => {
  test("sound is off until it is turned on, and then a message makes a sound", async ({ page }) => {
    await page.addInitScript(() => {
      const counter = window as unknown as { tones: number };
      counter.tones = 0;
      const real = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (this: AudioContext) {
        counter.tones += 1;
        return real.call(this);
      };
    });
    const tones = () => page.evaluate(() => (window as unknown as { tones: number }).tones);

    await toRoom(page);
    const toggle = page.getByRole("button", { name: "Turn sound on" });
    await expect(toggle).toHaveAttribute("data-sound", "off");
    await wait(page, 2);
    await expect(room(page)).toHaveAttribute("data-phone", "on");
    expect(await tones()).toBe(0);

    await toggle.click();
    await expect(page.getByRole("button", { name: "Turn sound off" })).toBeVisible();
    // Turning it on plays nothing by itself.
    expect(await tones()).toBe(0);
    await makeSevere(page);
    expect(await tones()).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Turn sound off" }).click();
    const quiet = await tones();
    await wait(page, 2);
    expect(await tones()).toBe(quiet);
  });

  test("the keys are listed on a panel that opens from the strip and with ?", async ({ page }) => {
    await toRoom(page);
    await page.getByRole("button", { name: "Keys", exact: true }).click();
    const panel = page.getByRole("region", { name: "Keys" });
    await expect(panel).toContainText("1 to 5");
    await expect(panel).toContainText("Esc");
    await expect(panel).toContainText("Space");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("?");
    await expect(panel).toBeVisible();
    // Flat view has no stations to list.
    await page.getByRole("button", { name: "Flat view" }).click();
    await expect(panel).not.toContainText("1 to 5");
    await page.getByRole("button", { name: "Close this list" }).click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe("the room on a phone", () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true });

  test("fits 375 px with no sideways scroll, 44 px targets and the log under the room", async ({
    page,
  }) => {
    await toRoom(page);
    await wait(page, 2);
    // At the desk there is space under the room, and the log is the most useful thing there.
    await expect(page.locator(".play")).toHaveAttribute("data-panel", "log");
    await expect(page.locator(".col-log")).toBeVisible();

    for (const label of ["Log", "Inbox", "Board", "Press", "Desk"] as const) {
      await station(page, label);
      await expect(box(page)).toBeInViewport();
      await expect(page.locator(".room canvas")).toBeInViewport();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${label} scrolls sideways`).toBeLessThanOrEqual(0);
    }

    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, input")]
        .filter((el) => el.offsetParent !== null && !el.classList.contains("link"))
        .map((el) => ({ name: el.innerText || el.id, h: el.getBoundingClientRect().height }))
        .filter((x) => x.h < 44),
    );
    expect(small).toEqual([]);
  });

  test("swiping the room moves one station along, and stops at the ends", async ({ page }) => {
    await toRoom(page);
    const size = await page.locator(".room").boundingBox();
    if (!size) throw new Error("no room");
    const y = size.y + size.height / 2;
    const swipe = async (fromX: number, toX: number) => {
      await page.mouse.move(size.x + fromX, y);
      await page.mouse.down();
      await page.mouse.move(size.x + toX, y + 4, { steps: 4 });
      await page.mouse.up();
    };
    await swipe(300, 80);
    await expect(room(page)).toHaveAttribute("data-station", "log");
    await swipe(300, 80);
    await expect(room(page)).toHaveAttribute("data-station", "inbox");
    await swipe(80, 300);
    await swipe(80, 300);
    await expect(room(page)).toHaveAttribute("data-station", "desk");
    await swipe(80, 300);
    await expect(room(page)).toHaveAttribute("data-station", "desk");
    // A short drag, or one that is mostly up and down, is not a swipe.
    await swipe(200, 170);
    await expect(room(page)).toHaveAttribute("data-station", "desk");
  });

  test("plays to the resolved ending on a phone", async ({ page }) => {
    await toRoom(page);
    await playSteps(page, resolvedPlay);
    await expect(page.getByRole("status").getByText("The incident is resolved.")).toBeVisible();
  });
});
