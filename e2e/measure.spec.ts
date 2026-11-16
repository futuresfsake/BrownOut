// Frame-rate readings for the 3D room (NFR-11, US-38). This is a measurement, not a check: it
// writes what it saw to testresults/dod/m3b/frame-rates.txt and fails only if it could not
// measure. Run with `npm run e2e:measure` on the machine whose reading is wanted.
//
// The camera is kept moving for the whole reading, because the room draws nothing when it is
// still. Each reading names the graphics card that drew it, so a reading taken in software is
// never mistaken for one from a real device.
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { makeSevere, settled, toRoom, wait } from "./helpers.js";

const OUT = join(import.meta.dirname, "..", "testresults", "dod", "m3b");
mkdirSync(OUT, { recursive: true });

interface Reading {
  name: string;
  viewport: string;
  pixelRatio: number;
  renderer: string;
  frames: number;
  seconds: number;
  average: number;
  median: number;
  /** The frame rate that 99 frames in 100 beat. */
  low: number;
  slowest: number;
  calls: number;
  triangles: number;
}

const readings: Reading[] = [];

/** Keeps the camera moving for some seconds and times every frame the browser shows. */
async function measure(page: Page, name: string, seconds: number): Promise<Reading> {
  const result = await page.evaluate(async (ms) => {
    const keys = ["2", "4", "5", "3", "1"];
    const gaps: number[] = [];
    let last = performance.now();
    const started = last;
    let nextMove = last;
    let move = 0;
    await new Promise<void>((done) => {
      const tick = (now: number) => {
        gaps.push(now - last);
        last = now;
        // A new move every 520 ms: each takes 500, so the camera hardly rests.
        if (now >= nextMove) {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: keys[move % keys.length] ?? "1" }),
          );
          move += 1;
          nextMove = now + 520;
        }
        if (now - started < ms) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    const canvas = document.querySelector<HTMLCanvasElement>(".room canvas");
    const gl = canvas?.getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl
      ? String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
      : "none";
    return { gaps: gaps.slice(1), renderer, pixelRatio: window.devicePixelRatio };
  }, seconds * 1000);

  const sorted = [...result.gaps].sort((a, b) => a - b);
  const at = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
  const total = result.gaps.reduce((sum, gap) => sum + gap, 0);
  const room = page.locator(".room");
  const size = page.viewportSize();
  const reading: Reading = {
    name,
    viewport: `${size?.width ?? 0} x ${size?.height ?? 0}`,
    pixelRatio: result.pixelRatio,
    renderer: result.renderer,
    frames: result.gaps.length,
    seconds: total / 1000,
    average: (result.gaps.length / total) * 1000,
    median: 1000 / at(0.5),
    low: 1000 / at(0.99),
    slowest: sorted.at(-1) ?? 0,
    calls: Number(await room.getAttribute("data-calls")),
    triangles: Number(await room.getAttribute("data-triangles")),
  };
  readings.push(reading);
  return reading;
}

test.describe.configure({ mode: "serial" });

test("laptop: 1440 x 900, camera moving, lights at level 1", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await toRoom(page);
  const r = await measure(page, "laptop, incident running", 8);
  expect(r.frames).toBeGreaterThan(30);
});

test("laptop: 1440 x 900, camera moving, browned out with the television on", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await toRoom(page);
  await makeSevere(page);
  await wait(page, 2);
  await settled(page);
  const r = await measure(page, "laptop, severe", 8);
  expect(r.frames).toBeGreaterThan(30);
});

test("phone layout: 375 x 740 at pixel ratio 3", async ({ browser }) => {
  // Not a phone: this machine, at a phone's size and pixel density. It shows that the phone
  // layout costs no more to draw than the wide one. Slowing the processor in the browser was
  // tried as a stand-in for a phone and dropped: the same run gave anything from 7 to 39 frames
  // a second, nearly all of it time spent in the slowing itself.
  const context = await browser.newContext({
    viewport: { width: 375, height: 740 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    baseURL: "http://localhost:4173/",
  });
  const page = await context.newPage();
  await toRoom(page);
  await makeSevere(page);
  await wait(page, 2);
  await settled(page);
  const r = await measure(page, "phone layout on this machine, severe", 8);
  expect(r.frames).toBeGreaterThan(30);
  await context.close();
});

test.afterAll(() => {
  if (readings.length === 0) return;
  const cpu = cpus()[0]?.model.trim() ?? "unknown";
  const n = (value: number, digits = 0) => value.toFixed(digits);
  const lines = [
    "Frame-rate readings for the 3D room",
    "===================================",
    "",
    "Taken by e2e/measure.spec.ts against the built site, with the camera moving between",
    "stations for the whole of each reading. The room draws nothing when it is still.",
    "",
    `Processor: ${cpu}`,
    `Drawn by:  ${readings[0]?.renderer ?? "unknown"}`,
    "",
    ...readings.flatMap((r) => [
      r.name,
      `  window ${r.viewport}, device pixel ratio ${n(r.pixelRatio, 1)}`,
      `  ${r.frames} frames in ${n(r.seconds, 1)} s`,
      `  frames a second: average ${n(r.average)}, median ${n(r.median)}, 99 in 100 above ${n(r.low)}`,
      `  slowest frame ${n(r.slowest, 1)} ms`,
      `  last frame: ${r.calls} draw calls, ${r.triangles} triangles`,
      "",
    ]),
    "How to read this",
    "  The targets in docs/03-design/ui-design.md name two devices: a mid-range laptop with",
    "  integrated graphics (60 frames a second while the camera moves) and a mid-range phone",
    "  (30 or more). A reading counts toward a target only if the line 'Drawn by' above names",
    "  such a device. A reading drawn by a separate graphics card says the room is not slow in",
    "  itself; it does not say the target is met.",
    "  The phone-layout reading is not a phone. It is this machine at a phone's size and pixel",
    "  density. The room draws at a pixel ratio of at most 1.5 on a narrow screen whatever the",
    "  device reports. No reading in this file comes from a phone.",
    "",
  ];
  writeFileSync(join(OUT, "frame-rates.txt"), `${lines.join("\n")}`);
});
