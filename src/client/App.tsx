import { useCallback, useEffect, useMemo, useState } from "react";
import type { Scenario } from "../engine/schema.js";
import { findScenario, scenarios } from "../scenarios/index.js";
import {
  boardView,
  deserialise,
  newGame,
  replay,
  serialise,
  threadViews,
  type Game,
  type Move,
} from "./app/game.js";
import { sampleFor } from "./app/samples.js";
import { describeMove, loadSession } from "./app/session-file.js";
import type { View } from "./room/load.js";
import { Briefing } from "./screens/Briefing.js";
import { Debrief } from "./screens/Debrief.js";
import { Play } from "./screens/Play.js";
import { Start } from "./screens/Start.js";

type Screen = "start" | "briefing" | "play" | "debrief" | "watch" | "watch-debrief";
const SAVE_KEY = "brownout.game";

/** A recorded session being watched. It is never saved and never changes the player's own game. */
interface Recording {
  scenario: Scenario;
  seed: number;
  moves: Move[];
  /** One game for each point in the record, the opening first. */
  steps: Game[];
  exact: boolean;
  step: number;
  /** Where "Leave" goes back to: the start screen, or the player's own debrief. */
  from: "start" | "debrief";
}

/** Reads a whole-number setting from the address bar, e.g. ?seed=7&tick=500. */
function param(name: string): number | undefined {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null || !/^\d{1,9}$/.test(raw)) return undefined;
  return Number(raw);
}

/** ?view=flat or ?view=room opens the play screen in that view. Anything else is ignored. */
function askedView(): View | null {
  const raw = new URLSearchParams(window.location.search).get("view");
  return raw === "flat" || raw === "room" ? raw : null;
}

const scenarioById = (id: string): Scenario | undefined => findScenario(id)?.scenario;

function loadSaved(): Game | null {
  try {
    const game = deserialise(
      window.sessionStorage.getItem(SAVE_KEY),
      scenarios.map((e) => e.scenario.id),
    );
    const scenario = game ? scenarioById(game.scenarioId) : undefined;
    if (!game || !scenario) return null;
    // A save that cannot be drawn is dropped here, not left to break the page on every reload.
    boardView(scenario, game.session);
    threadViews(scenario, game.session);
    return game;
  } catch {
    return null; // storage can be blocked or the save damaged; the game still works without it
  }
}

const newSeed = () => Math.floor(Math.random() * 100000) + 1;

export function App() {
  const [game, setGame] = useState<Game | null>(loadSaved);
  const [chosen, setChosen] = useState<string>(game?.scenarioId ?? scenarios[0]?.scenario.id ?? "");
  const [screen, setScreen] = useState<Screen>(game ? "play" : "start");
  const [recording, setRecording] = useState<Recording | null>(null);
  const scenario = useMemo(() => scenarioById(chosen), [chosen]);
  const tickMs = param("tick") ?? 15000;

  useEffect(() => {
    try {
      if (game) window.sessionStorage.setItem(SAVE_KEY, serialise(game));
      else window.sessionStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore: saving is a convenience
    }
  }, [game]);

  const begin = useCallback((sc: Scenario, seed?: number) => {
    setChosen(sc.id);
    setRecording(null);
    setGame(newGame(sc, seed ?? param("seed") ?? newSeed()));
    setScreen("play");
  }, []);

  const act = useCallback((change: (g: Game) => Game) => {
    setGame((g) => (g ? change(g) : g));
  }, []);

  const leave = useCallback(() => {
    setGame(null);
    setRecording(null);
    setScreen("start");
  }, []);

  const watch = useCallback((next: Omit<Recording, "step">) => {
    setRecording({ ...next, step: 0 });
    setScreen("watch");
  }, []);

  /** Opens a session file's text. Returns why not, if it cannot be opened. */
  const openFile = useCallback(
    (text: string): string | null => {
      const loaded = loadSession(text, scenarioById);
      if (!loaded.ok) return loaded.reason;
      watch({
        scenario: loaded.scenario,
        seed: loaded.seed,
        moves: loaded.moves,
        steps: loaded.steps,
        exact: loaded.exact,
        from: "start",
      });
      return null;
    },
    [watch],
  );

  const watchSample = useCallback(
    (scenarioId: string) => {
      const sample = sampleFor(scenarioId);
      const sc = scenarioById(scenarioId);
      if (!sample || !sc) return;
      watch({
        scenario: sc,
        seed: sample.seed,
        moves: sample.moves,
        steps: replay(sc, sample.seed, sample.moves),
        exact: true,
        from: "start",
      });
    },
    [watch],
  );

  const noChange = useCallback(() => undefined, []);

  if (!scenario) return <p className="page">No situations are installed.</p>;

  if ((screen === "watch" || screen === "watch-debrief") && recording) {
    const shown = recording.steps[recording.step] ?? (recording.steps[0] as Game);
    const back = () => {
      setRecording(null);
      setScreen(recording.from === "debrief" && game ? "debrief" : "start");
    };
    if (screen === "watch-debrief") {
      return (
        <Debrief
          scenario={recording.scenario}
          game={shown}
          watched={recording.from === "start"}
          onAgain={() => begin(recording.scenario, recording.seed)}
          onNewSeed={() => begin(recording.scenario, newSeed())}
          onWatch={() => {
            setRecording({ ...recording, step: 0 });
            setScreen("watch");
          }}
          onStart={leave}
        />
      );
    }
    return (
      <Play
        scenario={recording.scenario}
        game={shown}
        act={noChange}
        tickMs={tickMs}
        askedView={askedView()}
        onDebrief={() => setScreen("watch-debrief")}
        onQuit={back}
        watching={{
          step: recording.step,
          total: recording.moves.length,
          what: describeMove(recording.scenario, recording.moves[recording.step - 1]),
          exact: recording.exact,
          onStep: (step) => setRecording((r) => (r ? { ...r, step } : r)),
        }}
      />
    );
  }

  if (screen === "play" && game) {
    return (
      <Play
        scenario={scenario}
        game={game}
        act={act}
        tickMs={tickMs}
        askedView={askedView()}
        onDebrief={() => setScreen("debrief")}
        onQuit={leave}
      />
    );
  }
  if (screen === "debrief" && game) {
    return (
      <Debrief
        scenario={scenario}
        game={game}
        watched={false}
        onAgain={() => begin(scenario, game.seed)}
        onNewSeed={() => begin(scenario, newSeed())}
        onWatch={() =>
          watch({
            scenario,
            seed: game.seed,
            moves: game.moves,
            steps: replay(scenario, game.seed, game.moves),
            exact: true,
            from: "debrief",
          })
        }
        onStart={leave}
      />
    );
  }
  if (screen === "briefing") {
    return (
      <Briefing
        scenario={scenario}
        askedView={askedView()}
        onStart={() => begin(scenario)}
        onBack={() => setScreen("start")}
      />
    );
  }
  return (
    <Start
      onChoose={(id) => {
        setChosen(id);
        setScreen("briefing");
      }}
      onWatchSample={watchSample}
      onOpenFile={openFile}
    />
  );
}
