// Short text that belongs to an object is drawn on a 2D canvas and used as a texture: the wall
// board, the clock, the television headline, the desk monitor, the phone. It uses the fonts the
// page has already loaded, so nothing is fetched and no worker is needed (DL-36). Anything read
// at length stays in the HTML panels.
import type { RoomSignals } from "../signals/room.js";

export const PALETTE = {
  paper0: "#dde6e1",
  paper1: "#c3d0ca",
  paper2: "#a3b4ad",
  ink: "#0f1b1a",
  ink2: "#34474a",
  signal: "#b52a10",
  edge: "#5f7471",
  rule: "#8da09a",
  /** The floor: graphite, so the pale desks and screens stand out against it. */
  floor: "#22323a",
  /** Room colours: a deep teal wall, a darker side wall, an ochre desk top. */
  wall: "#2f6a75",
  wallSide: "#25535d",
  ceiling: "#1c3a42",
  ochre: "#d9a62e",
} as const;

const MONO = '"IBM Plex Mono", monospace';
const SANS = '"Archivo Variable", "Archivo", sans-serif';
const SERIF = '"Source Serif 4 Variable", "Source Serif 4", serif';

/** The faces the textures draw with. Asked for once, before the first drawing. */
export const TEXTURE_FONTS = [
  `500 40px ${MONO}`,
  `600 40px ${SANS}`,
  `400 40px ${SANS}`,
  `600 40px ${SERIF}`,
];

type Ctx = CanvasRenderingContext2D;

function page(ctx: Ctx, colour: string = PALETTE.paper0) {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}

function rule(ctx: Ctx, x: number, y: number, width: number, colour: string, weight = 2) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, width, weight);
}

/** Cuts text to a width, ending with an ellipsis when it does not fit. */
export function fit(measure: (text: string) => number, text: string, width: number): string {
  if (measure(text) <= width) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Breaks text into lines of a width, at spaces, up to a number of lines. */
export function wrap(
  measure: (text: string) => number,
  text: string,
  width: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = fit(measure, `${kept[maxLines - 1]} ${lines[maxLines] ?? ""}`, width);
  return kept;
}

const measurer = (ctx: Ctx) => (text: string) => ctx.measureText(text).width;

export const BOARD_SIZE = [1024, 512] as const;

export function drawBoard(ctx: Ctx, board: RoomSignals["board"], level: number) {
  const [w, h] = BOARD_SIZE;
  page(ctx);
  const pad = 36;

  ctx.fillStyle = PALETTE.ink2;
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText("STATUS", pad, 50);
  ctx.textAlign = "right";
  ctx.fillStyle = level === 2 ? PALETTE.signal : PALETTE.ink;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText(board.severityWord.toUpperCase(), w - pad, 50);
  ctx.textAlign = "left";
  rule(ctx, pad, 66, w - pad * 2, PALETTE.ink, 3);

  // Left half: the systems, one row each. Right half: the figures, large.
  const mid = w * 0.52;
  const rows = board.systems.slice(0, 5);
  const rowHeight = Math.min(104, (h - 96) / Math.max(rows.length, 1));
  rows.forEach((s, n) => {
    const y = 110 + n * rowHeight;
    ctx.font = `400 28px ${SANS}`;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(fit(measurer(ctx), s.label, mid - pad * 2), pad, y);
    ctx.font = `500 26px ${MONO}`;
    ctx.fillStyle = s.ok ? PALETTE.ink2 : PALETTE.signal;
    // A system that is not well gets a drawn triangle as well as the colour, as in the panel.
    const indent = s.ok ? 0 : 30;
    if (!s.ok) {
      ctx.beginPath();
      ctx.moveTo(pad, y + 34);
      ctx.lineTo(pad + 20, y + 34);
      ctx.lineTo(pad + 10, y + 16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillText(fit(measurer(ctx), s.status, mid - pad * 2 - indent), pad + indent, y + 34);
    rule(ctx, pad, y + 52, mid - pad * 2, PALETTE.rule, 2);
  });

  ctx.fillStyle = PALETTE.rule;
  ctx.fillRect(mid, 84, 2, h - 120);

  const figures = board.figures.slice(0, 3);
  const figureHeight = (h - 100) / Math.max(figures.length, 1);
  figures.forEach((f, n) => {
    const x = mid + pad;
    const y = 114 + n * figureHeight;
    ctx.font = `600 24px ${SANS}`;
    ctx.fillStyle = PALETTE.ink2;
    ctx.fillText(fit(measurer(ctx), f.label.toUpperCase(), w - x - pad), x, y);
    const unknown = f.value === "unknown";
    ctx.font = unknown ? `500 40px ${MONO}` : `500 72px ${MONO}`;
    ctx.fillStyle = unknown ? PALETTE.ink2 : PALETTE.ink;
    const text = unknown ? "– unknown" : f.value;
    ctx.fillText(text, x, y + 76);
    // A figure that changed is underlined in the signal colour.
    if (f.changed) rule(ctx, x, y + 90, ctx.measureText(text).width, PALETTE.signal, 6);
  });
}

export const CLOCK_SIZE = [384, 480] as const;

export function drawClock(ctx: Ctx, clock: RoomSignals["clock"]) {
  const [w, h] = CLOCK_SIZE;
  const c = w / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = PALETTE.paper0;
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = PALETTE.ink;
  ctx.stroke();

  for (let n = 0; n < 12; n++) {
    const a = (n / 12) * Math.PI * 2;
    const long = n % 3 === 0;
    ctx.lineWidth = long ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * (c - 22), c - Math.cos(a) * (c - 22));
    ctx.lineTo(c + Math.sin(a) * (c - (long ? 52 : 40)), c - Math.cos(a) * (c - (long ? 52 : 40)));
    ctx.stroke();
  }

  const hand = (turns: number, length: number, width: number) => {
    const a = turns * Math.PI * 2;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.sin(a) * length, c - Math.cos(a) * length);
    ctx.stroke();
  };
  hand(((clock.hours % 12) + clock.minutes / 60) / 12, c * 0.45, 14);
  hand(clock.minutes / 60, c * 0.7, 9);

  // The time in figures on a plate under the face, so it can be read from the desk without
  // the hands crossing it. A stopped clock says so.
  ctx.fillStyle = PALETTE.paper0;
  ctx.fillRect(72, w + 14, w - 144, 70);
  ctx.lineWidth = 6;
  ctx.strokeRect(72, w + 14, w - 144, 70);
  ctx.fillStyle = clock.running ? PALETTE.ink : PALETTE.signal;
  ctx.textAlign = "center";
  ctx.font = `500 46px ${MONO}`;
  ctx.fillText(clock.text, c, w + 66);
  if (!clock.running) {
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText("STOPPED", c, c + 104);
  }
  ctx.textAlign = "left";
}

export const TV_SIZE = [768, 432] as const;

export function drawTelevision(ctx: Ctx, tv: RoomSignals["tv"]) {
  const [w, h] = TV_SIZE;
  if (!tv.on) {
    page(ctx, PALETTE.ink);
    return;
  }
  page(ctx);
  const pad = 40;
  ctx.fillStyle = PALETTE.ink2;
  ctx.font = `600 24px ${SANS}`;
  ctx.fillText(fit(measurer(ctx), tv.outlet.toUpperCase(), w - pad * 2), pad, 62);
  rule(ctx, pad, 80, w - pad * 2, PALETTE.ink, 3);

  ctx.fillStyle = PALETTE.ink;
  ctx.font = `600 50px ${SERIF}`;
  wrap(measurer(ctx), tv.headline, w - pad * 2, 4).forEach((line, n) => {
    ctx.fillText(line, pad, 150 + n * 60);
  });

  if (tv.waiting !== "off") {
    ctx.fillStyle = PALETTE.signal;
    ctx.fillRect(pad, h - 66, 18, 18);
    ctx.font = `600 24px ${SANS}`;
    ctx.fillText(
      tv.waiting === "overdue"
        ? "PAST THEIR DEADLINE FOR YOUR COMMENT"
        : "WAITING FOR YOUR COMMENT",
      pad + 32,
      h - 48,
    );
  }
}

export const MONITOR_SIZE = [512, 320] as const;

export function drawMonitor(ctx: Ctx, count: number) {
  const [w] = MONITOR_SIZE;
  page(ctx);
  ctx.fillStyle = PALETTE.ink2;
  ctx.font = `600 28px ${SANS}`;
  ctx.fillText("INBOX", 32, 58);
  rule(ctx, 32, 76, w - 64, PALETTE.ink, 3);
  ctx.fillStyle = count > 0 ? PALETTE.signal : PALETTE.ink2;
  ctx.font = `500 132px ${MONO}`;
  ctx.fillText(String(count), 32, 214);
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText(count === 0 ? "NO ONE WAITING" : "WAITING FOR YOU", 32, 272);
}

export const PHONE_SIZE = [256, 448] as const;

export function drawPhone(ctx: Ctx, phone: RoomSignals["phone"], from: string | null) {
  const [w] = PHONE_SIZE;
  if (phone === "off") {
    page(ctx, PALETTE.ink);
    return;
  }
  page(ctx);
  ctx.fillStyle = PALETTE.signal;
  ctx.fillRect(24, 40, 22, 22);
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText(phone === "overdue" ? "OVERDUE" : "WAITING", 58, 62);
  rule(ctx, 24, 84, w - 48, PALETTE.ink, 3);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `600 38px ${SANS}`;
  wrap(measurer(ctx), from ?? "", w - 48, 3).forEach((line, n) => {
    ctx.fillText(line, 24, 146 + n * 46);
  });
}

export const LOGBOOK_SIZE = [512, 384] as const;
const LOGBOOK_ROWS = 12;

/** The page fills as the log grows. The words themselves are in the Log panel. */
export function drawLogbook(ctx: Ctx, lines: number) {
  const [w, h] = LOGBOOK_SIZE;
  page(ctx);
  const top = 34;
  const step = (h - top - 16) / LOGBOOK_ROWS;
  // The margin rule of a paper logbook.
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(96, 12, 3, h - 24);
  const shown = Math.min(lines, LOGBOOK_ROWS);
  for (let n = 0; n < LOGBOOK_ROWS; n++) {
    const y = top + n * step;
    rule(ctx, 20, y + step - 6, w - 40, PALETTE.rule, 2);
    if (n >= shown) continue;
    // Each written line: a time in the margin and a stroke of ink whose length varies.
    ctx.fillStyle = PALETTE.ink2;
    ctx.fillRect(24, y + step - 22, 58, 8);
    ctx.fillStyle = PALETTE.ink;
    const length = 0.45 + (((n * 37 + lines * 11) % 50) / 100) * 1;
    ctx.fillRect(112, y + step - 22, (w - 150) * Math.min(length, 0.95), 8);
  }
}

export const BUBBLE_SIZE = [256, 96] as const;

/** What Mika says: a few words in a speech bubble, with a tail pointing down. */
export function drawBubble(ctx: Ctx, text: string) {
  const [w, h] = BUBBLE_SIZE;
  ctx.clearRect(0, 0, w, h);
  if (text === "") return;
  ctx.fillStyle = PALETTE.paper0;
  ctx.fillRect(6, 6, w - 12, h - 26);
  ctx.lineWidth = 6;
  ctx.strokeStyle = PALETTE.ink;
  ctx.strokeRect(6, 6, w - 12, h - 26);
  ctx.beginPath();
  ctx.moveTo(w / 2 - 14, h - 20);
  ctx.lineTo(w / 2 + 6, h - 20);
  ctx.lineTo(w / 2 - 4, h - 3);
  ctx.closePath();
  ctx.fillStyle = PALETTE.paper0;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `600 40px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, 56);
  ctx.textAlign = "left";
}
