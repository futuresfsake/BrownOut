import { useCallback, useEffect, useMemo, useState } from "react";
import { findScenario, scenarios } from "../scenarios/index.js";
import { boardView, deserialise, newGame, serialise, threadViews, type Game } from "./app/game.js";
import { Briefing } from "./screens/Briefing.js";
import { Debrief } from "./screens/Debrief.js";
import { Play } from "./screens/Play.js";
import { Start } from "./screens/Start.js";

type Screen = "start" | "briefing" | "play" | "debrief";
const SAVE_KEY = "brownout.game";

/** Reads a whole-number setting from the address bar, e.g. ?seed=7&tick=500. */
function param(name: string): number | undefined {
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw === null || !/^\d{1,9}$/.test(raw)) return undefined;
  return Number(raw);
}

function loadSaved(): Game | null {
  try {
    const game = deserialise(
      window.sessionStorage.getItem(SAVE_KEY),
      scenarios.map((e) => e.scenario.id),
    );
    const scenario = game ? findScenario(game.scenarioId)?.scenario : undefined;
    if (!game || !scenario) return null;
    // A save that cannot be drawn is dropped here, not left to break the page on every reload.
    boardView(scenario, game.session);
    threadViews(scenario, game.session);
    return game;
  } catch {
    return null; // storage can be blocked or the save damaged; the game still works without it
  }
}

export function App() {
  const [game, setGame] = useState<Game | null>(loadSaved);
  const [chosen, setChosen] = useState<string>(game?.scenarioId ?? scenarios[0]?.scenario.id ?? "");
  const [screen, setScreen] = useState<Screen>(game ? "play" : "start");
  const scenario = useMemo(() => findScenario(chosen)?.scenario, [chosen]);
  const tickMs = param("tick") ?? 15000;

  useEffect(() => {
    try {
      if (game) window.sessionStorage.setItem(SAVE_KEY, serialise(game));
      else window.sessionStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore: saving is a convenience
    }
  }, [game]);

  const begin = useCallback(
    (seed?: number) => {
      if (!scenario) return;
      setGame(newGame(scenario, seed ?? param("seed") ?? Math.floor(Math.random() * 100000) + 1));
      setScreen("play");
    },
    [scenario],
  );

  const act = useCallback((change: (g: Game) => Game) => {
    setGame((g) => (g ? change(g) : g));
  }, []);

  const leave = useCallback(() => {
    setGame(null);
    setScreen("start");
  }, []);

  if (!scenario) return <p className="page">No situations are installed.</p>;

  if (screen === "play" && game) {
    return (
      <Play
        scenario={scenario}
        game={game}
        act={act}
        tickMs={tickMs}
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
        onAgain={() => begin(game.seed)}
        onNewSeed={() => begin(Math.floor(Math.random() * 100000) + 1)}
        onStart={leave}
      />
    );
  }
  if (screen === "briefing") {
    return (
      <Briefing scenario={scenario} onStart={() => begin()} onBack={() => setScreen("start")} />
    );
  }
  return (
    <Start
      onChoose={(id) => {
        setChosen(id);
        setScreen("briefing");
      }}
    />
  );
}
