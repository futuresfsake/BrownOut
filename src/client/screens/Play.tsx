import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Scenario } from "../../engine/schema.js";
import {
  boardView,
  control,
  dismiss,
  pick,
  setPaused,
  submit,
  threadViews,
  unansweredCount,
  type Game,
} from "../app/game.js";
import { useFocusOnOpen } from "../app/focus.js";
import { Board } from "../panels/Board.js";
import { DecisionBox } from "../panels/DecisionBox.js";
import { Inbox } from "../panels/Inbox.js";
import { Log } from "../panels/Log.js";

type Tab = "log" | "inbox" | "board";

interface Props {
  scenario: Scenario;
  game: Game;
  act: (change: (g: Game) => Game) => void;
  tickMs: number;
  onDebrief: () => void;
  onQuit: () => void;
}

const ENDINGS: Record<string, string> = {
  resolved: "The incident is resolved.",
  relieved: "The CTO has taken over the incident.",
  timeout: "Time is up.",
  ended: "You closed the incident.",
};

/** The play screen as a flat page: board, log and inbox side by side. */
export function Play({ scenario, game, act, tickMs, onDebrief, onQuit }: Props) {
  const [tab, setTab] = useState<Tab>("log");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [acted, setActed] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const screen = useFocusOnOpen<HTMLElement>();

  const session = game.session;
  const running = session.status === "running";
  const board = useMemo(() => boardView(scenario, session), [scenario, session]);
  const threads = useMemo(() => threadViews(scenario, session), [scenario, session]);
  const waiting = unansweredCount(threads);

  // The idle clock: one sim minute per interval while the player is thinking. It starts again
  // from zero after each thing the player does.
  useEffect(() => {
    if (!running || game.paused) return;
    const timer = window.setInterval(
      () => act((g) => control(scenario, g, { type: "tick", minutes: 1 })),
      tickMs,
    );
    return () => window.clearInterval(timer);
  }, [running, game.paused, tickMs, scenario, act, acted]);

  const did = useCallback(
    (change: (g: Game) => Game) => {
      act(change);
      setActed((n) => n + 1);
    },
    [act],
  );

  const openInbox = useCallback((threadId: string | null) => {
    setOpenThread(threadId);
    if (threadId) setTab("inbox");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        setOpenThread(null);
        setConfirmEnd(false);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setTab("log");
        box.current?.focus();
      } else if (e.key === " " && running && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        act((g) => setPaused(g, !g.paused));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, running]);

  // The newest message or alert, read out to screen readers.
  const latest = [...game.feed].reverse().find((f) => f.who === "inbox" || f.who === "alert");

  return (
    <main className="play" ref={screen} tabIndex={-1} data-severity={board.severity} data-tab={tab}>
      <header className="strip">
        <p className="wordmark small">BrownOut</p>
        <h1 className="strip-title">{scenario.title}</h1>
        <p className="strip-facts mono" aria-hidden="true">
          {board.clock} · affected: {board.metrics[0]?.value ?? "unknown"} · {waiting} waiting
          {game.paused ? " · paused" : ""}
        </p>
        <div className="strip-controls">
          <button
            type="button"
            onClick={() => act((g) => setPaused(g, !g.paused))}
            disabled={!running}
            aria-pressed={game.paused}
          >
            {game.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => did((g) => control(scenario, g, { type: "wait" }))}
            disabled={!running}
          >
            Wait
          </button>
          <button
            type="button"
            onClick={() => did((g) => control(scenario, g, { type: "cancelTask" }))}
            disabled={!running || !session.task}
          >
            Cancel task
          </button>
          {running ? (
            <button type="button" onClick={() => setConfirmEnd(true)}>
              End incident
            </button>
          ) : (
            <button type="button" onClick={onQuit}>
              Leave
            </button>
          )}
        </div>
      </header>

      {confirmEnd && running && (
        <div className="banner" role="alertdialog" aria-labelledby="end-title">
          <p id="end-title">End the incident now? It is not resolved.</p>
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => {
                did((g) => control(scenario, g, { type: "end" }));
                setConfirmEnd(false);
              }}
            >
              End it
            </button>
            <button type="button" onClick={() => setConfirmEnd(false)} autoFocus>
              Keep going
            </button>
          </div>
        </div>
      )}

      {!running && (
        <div className="banner" role="status">
          <p>{ENDINGS[session.status] ?? "The incident is over."}</p>
          <button type="button" className="primary" onClick={onDebrief} autoFocus>
            Read the debrief
          </button>
        </div>
      )}

      <div className="columns">
        <div className="col col-board">
          <Board view={board} paused={game.paused} />
        </div>
        <div className="col col-log">
          <Log
            feed={game.feed}
            startClock={scenario.startClock}
            task={running ? board.task : null}
            queued={running ? board.queued : null}
            onOpenThread={openInbox}
          />
        </div>
        <div className="col col-inbox">
          <Inbox
            threads={threads}
            openId={openThread}
            disabled={!running}
            onOpen={openInbox}
            onReply={(threadId, text) => did((g) => submit(scenario, g, text, threadId))}
          />
        </div>
      </div>

      <div className="dock">
        <DecisionBox
          pending={game.pending}
          disabled={!running}
          inputRef={box}
          onSubmit={(text) => did((g) => submit(scenario, g, text))}
          onPick={(n) => did((g) => pick(scenario, g, n))}
          onDismiss={() => act(dismiss)}
        />
      </div>

      <nav className="tabs" aria-label="Panels">
        {(["log", "inbox", "board"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
          >
            {t === "log"
              ? "Log"
              : t === "board"
                ? "Board"
                : `Inbox${waiting > 0 ? ` (${waiting})` : ""}`}
          </button>
        ))}
      </nav>

      <p className="visually-hidden" aria-live="polite">
        {latest?.text ?? ""}
      </p>
      <p className="visually-hidden" aria-live="assertive">
        {board.severity === 2 ? "The incident is now severe." : ""}
      </p>
    </main>
  );
}
