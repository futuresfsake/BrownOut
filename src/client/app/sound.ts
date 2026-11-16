// Sound is optional and off until the player turns it on (O-08). Every sound is made here with
// the Web Audio API: there are no audio files and no speech, and nothing is fetched. Each sound
// has something on screen that says the same thing, so playing muted loses nothing.
import type { Game } from "./game.js";

export type Cue = "message" | "alert" | "worse" | "done";

/** What on screen says the same thing as each sound. Shown on the keys panel and tested. */
export const SEEN_AS: Record<Cue, string> = {
  message: "The phone lamp, the count on the desk monitor and a line in the log.",
  alert: "A line in the log, in the signal colour.",
  worse: "The room lights, the wall board and the status strip.",
  done: "Mika's lamp goes out and the result is written in the log.",
};

/** The little of a game that decides what is heard. */
export interface Heard {
  feedLength: number;
  severity: number;
  taskId: string | null;
}

export const heardOf = (game: Game, severity: number): Heard => ({
  feedLength: game.feed.length,
  severity,
  taskId: game.session.task?.id ?? null,
});

/**
 * The sounds for one change of the game, in the order they play. At most one of each: three
 * messages arriving in the same minute buzz once.
 */
export function cuesFor(before: Heard, game: Game, severity: number): Cue[] {
  const cues = new Set<Cue>();
  for (const item of game.feed.slice(before.feedLength)) {
    if (item.who === "alert") cues.add("alert");
    if (item.who === "inbox") cues.add("message");
  }
  if (severity > before.severity) cues.add("worse");
  const taskId = game.session.task?.id ?? null;
  if (before.taskId !== null && taskId !== before.taskId) cues.add("done");
  return (["alert", "worse", "message", "done"] as const).filter((c) => cues.has(c));
}

interface Tone {
  /** Seconds after the cue starts. */
  at: number;
  seconds: number;
  /** Hertz at the start, and at the end if it slides. */
  from: number;
  to?: number;
  shape: OscillatorType;
  /** Loudness at its peak, 0 to 1. Kept low: this is a room, not an alarm. */
  peak: number;
}

/** Each cue as a few plain tones. Short, quiet, and none repeats faster than three a second. */
export const TONES: Record<Cue, readonly Tone[]> = {
  // A phone buzzing on a desk: two low pulses.
  message: [
    { at: 0, seconds: 0.14, from: 150, shape: "square", peak: 0.05 },
    { at: 0.22, seconds: 0.14, from: 150, shape: "square", peak: 0.05 },
  ],
  // A pager: two notes, the second higher.
  alert: [
    { at: 0, seconds: 0.16, from: 880, shape: "sine", peak: 0.09 },
    { at: 0.2, seconds: 0.24, from: 1175, shape: "sine", peak: 0.09 },
  ],
  // The room hum sagging as the power drops.
  worse: [{ at: 0, seconds: 1.1, from: 120, to: 72, shape: "sawtooth", peak: 0.06 }],
  // A soft click.
  done: [{ at: 0, seconds: 0.05, from: 1400, to: 700, shape: "triangle", peak: 0.07 }],
};

/** How long a cue lasts, so the next one can follow it and not play over it. */
export const lengthOf = (cue: Cue): number => Math.max(...TONES[cue].map((t) => t.at + t.seconds));

export interface Speaker {
  play: (cues: readonly Cue[]) => void;
  close: () => void;
}

/**
 * Opens the audio output. Call it from a press of a button: browsers allow sound only after the
 * player has done something. Returns null where there is no Web Audio.
 */
export function openSpeaker(): Speaker | null {
  if (typeof window.AudioContext !== "function") return null;
  let context: AudioContext;
  try {
    context = new window.AudioContext();
  } catch {
    return null;
  }
  return {
    play(cues) {
      void context.resume().catch(() => undefined);
      let start = context.currentTime + 0.02;
      for (const cue of cues) {
        for (const tone of TONES[cue]) {
          const from = start + tone.at;
          const until = from + tone.seconds;
          const voice = context.createOscillator();
          const level = context.createGain();
          voice.type = tone.shape;
          voice.frequency.setValueAtTime(tone.from, from);
          if (tone.to) voice.frequency.linearRampToValueAtTime(tone.to, until);
          // Fade in and out over a few milliseconds, so a tone never starts or ends with a pop.
          level.gain.setValueAtTime(0, from);
          level.gain.linearRampToValueAtTime(tone.peak, from + 0.012);
          level.gain.setValueAtTime(tone.peak, Math.max(from + 0.012, until - 0.03));
          level.gain.linearRampToValueAtTime(0, until);
          voice.connect(level).connect(context.destination);
          voice.start(from);
          voice.stop(until + 0.02);
        }
        start += lengthOf(cue) + 0.12;
      }
    },
    close() {
      void context.close().catch(() => undefined);
    },
  };
}
