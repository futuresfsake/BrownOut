// Writes the screenshots of the 3D room kept as evidence for milestone M3 stage B:
// every station at each light level, at the three widths. Run with `npm run e2e:evidence`.
// A headless browser draws WebGL in software, so these show what is drawn, not how fast.
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  makeSevere,
  order,
  ROOM_URL,
  settled,
  station,
  toBriefing,
  toPlay,
  toRoom,
  wait,
} from "./helpers.js";

const OUT = join(import.meta.dirname, "..", "testresults", "dod", "m3b", "screens");
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
];

const STATIONS = ["Desk", "Log", "Inbox", "Board", "Press"] as const;

for (const size of SIZES) {
  test.describe(`room at ${size.width} px`, () => {
    test.use({ viewport: size });

    const shot = async (page: Page, name: string) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await settled(page);
      await page.screenshot({
        path: join(OUT, `${size.width}-${name}.png`),
        animations: "disabled",
      });
    };

    const everyStation = async (page: Page, prefix: string) => {
      for (const [n, name] of STATIONS.entries()) {
        await station(page, name);
        await shot(page, `${prefix}-${n + 1}-${name.toLowerCase()}`);
      }
      await station(page, "Desk");
    };

    test("level 1: the incident running, with the phone lit and a task under way", async ({
      page,
    }) => {
      await toRoom(page);
      await shot(page, "l1-0-opening");
      await order(page, "find out what changed on auth-core");
      await shot(page, "l1-0-mika-lamp-on");
      await wait(page, 2);
      await settled(page);
      await everyStation(page, "l1");
    });

    test("level 2: browned out, the emergency strip on, the television on", async ({ page }) => {
      await toRoom(page);
      await makeSevere(page);
      await wait(page, 2);
      await expect(page.locator(".room")).toHaveAttribute("data-level", "2");
      await expect(page.locator(".room")).toHaveAttribute("data-tv", "true");
      await everyStation(page, "l2");
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      await shot(page, "l2-0-paused");
    });

    test("level 0: after recovery", async ({ page }) => {
      await toRoom(page);
      await order(page, "find out what changed on auth-core");
      await wait(page);
      await order(page, "roll back the certificate bundle on the bad nodes");
      for (let n = 0; n < 12; n++) {
        if ((await page.locator(".room").getAttribute("data-level")) === "0") break;
        await wait(page);
      }
      await expect(page.locator(".room")).toHaveAttribute("data-level", "0");
      await everyStation(page, "l0");
    });

    test("object states: pointed at, focused by keyboard, and the list of keys", async ({
      page,
    }) => {
      await toRoom(page);
      await wait(page, 2);
      const canvas = page.locator(".room canvas");
      const box = await canvas.boundingBox();
      if (!box) throw new Error("no canvas");
      // Pointing at the television from the desk outlines it.
      await page.mouse.move(box.x + box.width * 0.74, box.y + box.height * 0.4);
      await shot(page, "state-1-object-pointed-at");
      await page.mouse.move(2, 2);
      // Tabbing to a station's button outlines its object.
      await page
        .getByRole("navigation", { name: "Stations" })
        .getByRole("button", { name: /Board/ })
        .focus();
      await shot(page, "state-2-object-focused-by-keyboard");
      await page.keyboard.press("?");
      await shot(page, "state-3-keys");
    });

    test("room states: loading, and the two ways the room can be missing", async ({ page }) => {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route(
        (url) => url.pathname.includes("/assets/Room-"),
        async (route) => {
          await held;
          await route.continue();
        },
      );
      await toBriefing(page, ROOM_URL);
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await expect(page.getByText("Loading the room.")).toBeVisible();
      await page.screenshot({
        path: join(OUT, `${size.width}-state-4-loading.png`),
        animations: "disabled",
      });
      release();
      await expect(page.locator(".room")).toHaveAttribute("data-ready", "true");
      await settled(page);

      await page.locator(".room canvas").evaluate((canvas: HTMLCanvasElement) => {
        canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
      });
      await expect(page.getByText("The 3D room stopped drawing")).toBeVisible({ timeout: 8000 });
      await page.screenshot({
        path: join(OUT, `${size.width}-state-5-context-lost.png`),
        animations: "disabled",
      });
    });

    test("room states: a browser that cannot draw it", async ({ page }) => {
      await page.addInitScript(() => {
        const real = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
          if (kind.startsWith("webgl")) return null;
          return (real as (this: HTMLCanvasElement, kind: string) => unknown).call(this, kind);
        } as typeof real;
      });
      await toPlay(page, ROOM_URL);
      await expect(page.getByText("This browser cannot draw the 3D room")).toBeVisible();
      await page.screenshot({
        path: join(OUT, `${size.width}-state-6-3d-unavailable.png`),
        animations: "disabled",
      });
    });
  });
}

// A short recording of a message arriving and the lights going down, as ui-design.md asks.
test("recording: a message arrives, then the room browns out", async ({ browser }) => {
  const dir = join(OUT, "..");
  const context = await browser.newContext({
    viewport: { width: 960, height: 600 },
    baseURL: "http://localhost:4173/",
    recordVideo: { dir: join(dir, "video-tmp"), size: { width: 960, height: 600 } },
  });
  const page = await context.newPage();
  await toRoom(page);
  await page.waitForTimeout(700);
  await wait(page, 2);
  await expect(page.locator(".room")).toHaveAttribute("data-phone", "on");
  await page.waitForTimeout(1500);
  await order(page, "restart every auth-core node");
  await page.waitForTimeout(900);
  for (let n = 0; n < 8; n++) {
    if ((await page.locator(".room").getAttribute("data-level")) === "2") break;
    await wait(page);
    await page.waitForTimeout(900);
  }
  await expect(page.locator(".room")).toHaveAttribute("data-level", "2");
  await page.waitForTimeout(1800);
  await station(page, "Board");
  await page.waitForTimeout(1500);
  const video = page.video();
  await context.close();
  await video?.saveAs(join(dir, "level-change-and-message.webm"));
  rmSync(join(dir, "video-tmp"), { recursive: true, force: true });
});
