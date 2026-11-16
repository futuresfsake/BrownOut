import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import { useMedia } from "../app/media.js";
import { cuesFor, heardOf, openSpeaker, type Speaker } from "../app/sound.js";
import { Board } from "../panels/Board.js";
import { DecisionBox } from "../panels/DecisionBox.js";
import { Inbox } from "../panels/Inbox.js";
import { Log } from "../panels/Log.js";
import { canDrawRoom, loadRoom, savedView, saveView, type View } from "../room/load.js";
import type { FrameCost } from "../room/meter.js";
import {
  neighbour,
  stationForKey,
  stationOf,
  STATIONS,
  type PanelId,
  type StationId,
} from "../room/stations.js";
import { describeRoom, roomSignals } from "../signals/room.js";

const Room = lazy(loadRoom);

type Tab = "log" | "inbox" | "board";

interface Props {
  scenario: Scenario;
  game: Game;
  act: (change: (g: Game) => Game) => void;
  tickMs: number;
  /** A view asked for in the address bar, which wins over the saved choice. */
  askedView: View | null;
  onDebrief: () => void;
  onQuit: () => void;
}

const ENDINGS: Record<string, string> = {
  resolved: "The incident is resolved.",
  relieved: "The CTO has taken over the incident.",
  timeout: "Time is up.",
  ended: "You closed the incident.",
};

/** The keys, as the keys panel lists them. The station keys only do something in the room. */
const KEYS: readonly { keys: string; does: string; room?: true }[] = [
  {
    keys: "1 to 5",
    does: "Go to the desk, the log, the inbox, the board or the press.",
    room: true,
  },
  { keys: "Esc", does: "Go back to the desk. Close an open thread or a question." },
  { keys: "/", does: "Go to the box where you type." },
  { keys: "Space", does: "Pause or resume the clock, when you are not typing." },
  { keys: "?", does: "Show or hide this list." },
];

const NO_3D = "This browser cannot draw the 3D room, so this is the flat view. Nothing is missing.";
const LOST_3D =
  "The 3D room stopped drawing and did not come back, so this is the flat view. Nothing is lost.";

function firstView(asked: View | null): View {
  if (!canDrawRoom()) return "flat";
  return asked ?? savedView() ?? "room";
}

/** The play screen: the 3D room with one panel beside it, or the same panels as a flat page. */
export function Play({ scenario, game, act, tickMs, askedView, onDebrief, onQuit }: Props) {
  const [view, setView] = useState<View>(() => firstView(askedView));
  const [notice, setNotice] = useState<string | null>(() => (canDrawRoom() ? null : NO_3D));
  const [offerFlat, setOfferFlat] = useState(false);
  const [station, setStation] = useState<StationId>("desk");
  const [focused, setFocused] = useState<StationId | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  const [tab, setTab] = useState<Tab>("log");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [acted, setActed] = useState(0);
  const [showKeys, setShowKeys] = useState(false);
  const [sound, setSound] = useState(false);
  const speaker = useRef<Speaker | null>(null);
  const box = useRef<HTMLInputElement>(null);
  const roomEl = useRef<HTMLDivElement>(null);
  const logCol = useRef<HTMLDivElement>(null);
  const logAt = useRef({ top: 0, atEnd: true });
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swipedAt = useRef(-Infinity);
  const screen = useFocusOnOpen<HTMLElement>();
  const steady = useMedia("(prefers-reduced-motion: reduce)");
  const compact = useMedia("(max-width: 767px)");

  const session = game.session;
  const running = session.status === "running";
  const board = useMemo(() => boardView(scenario, session), [scenario, session]);
  const threads = useMemo(() => threadViews(scenario, session), [scenario, session]);
  const waiting = unansweredCount(threads);
  const pressWaiting = threads.filter((t) => t.press && t.state !== "").length;
  const signals = useMemo(
    () => roomSignals(board, threads, game.feed.length, { running, paused: game.paused }),
    [board, threads, game.feed.length, running, game.paused],
  );

  // Sound, when it is on: what changed since the last time the game was looked at.
  const heard = useRef(heardOf(game, board.severity));
  useEffect(() => {
    const cues = cuesFor(heard.current, game, board.severity);
    heard.current = heardOf(game, board.severity);
    if (sound && cues.length > 0) speaker.current?.play(cues);
  }, [game, board.severity, sound]);
  useEffect(() => () => speaker.current?.close(), []);

  // Called from the button, because a browser lets a page make sound only after a press.
  const toggleSound = () => {
    if (!sound && !speaker.current) speaker.current = openSpeaker();
    setSound(!sound);
  };
  const canSound = typeof window.AudioContext === "function";

  const inRoom = view === "room";
  // On a phone the desk station has room under it, and the log is the most useful thing there.
  const panel: PanelId | null = inRoom
    ? (stationOf(station).panel ?? (compact ? "log" : null))
    : null;

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

  const choose = useCallback((next: View) => {
    setView(next);
    saveView(next);
    setOfferFlat(false);
  }, []);

  const openInbox = useCallback(
    (threadId: string | null) => {
      setOpenThread(threadId);
      if (!threadId) return;
      setTab("inbox");
      setStation(threads.find((t) => t.id === threadId)?.press ? "press" : "inbox");
    },
    [threads],
  );

  const go = useCallback((id: StationId) => {
    setStation(id);
    const flat = stationOf(id).panel;
    if (flat === "log" || flat === "board") setTab(flat);
    if (flat === "inbox" || flat === "press") setTab("inbox");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        setOpenThread(null);
        setConfirmEnd(false);
        setShowKeys(false);
        setStation("desk");
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const toStation = stationForKey(e.key);
      if (toStation) {
        e.preventDefault();
        go(toStation);
      } else if (e.key === "?") {
        e.preventDefault();
        setShowKeys((shown) => !shown);
      } else if (e.key === "/") {
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
  }, [act, running, go]);

  // The log keeps its place when it is hidden and shown again, by a tab, a station or a change
  // of view. If it was at the end, it stays at the end.
  const shownLog = inRoom ? panel === "log" : true;
  useLayoutEffect(() => {
    const el = logCol.current;
    if (!el || el.offsetParent === null) return;
    el.scrollTop = logAt.current.atEnd ? el.scrollHeight : logAt.current.top;
  }, [view, panel, tab, shownLog, compact]);

  const onLogScroll = () => {
    const el = logCol.current;
    if (!el || el.offsetParent === null) return;
    logAt.current = {
      top: el.scrollTop,
      atEnd: el.scrollHeight - el.scrollTop - el.clientHeight < 24,
    };
  };

  // Written straight onto the element: a frame must not cause React to draw the page again.
  const onFrame = useCallback((count: number, cost: FrameCost) => {
    const el = roomEl.current;
    if (!el) return;
    el.dataset.frames = String(count);
    if (cost.calls > 0) {
      el.dataset.calls = String(cost.calls);
      el.dataset.triangles = String(cost.triangles);
    }
  }, []);
  const onLost = useCallback(() => {
    setView("flat");
    setNotice(LOST_3D);
  }, []);
  const onSlow = useCallback(() => setOfferFlat(true), []);
  const onReady = useCallback(() => setRoomReady(true), []);

  const onSwipeStart = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onSwipeEnd = (e: ReactPointerEvent) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    // Any drag, even one too short or too steep to be a swipe, is not a tap on an object.
    if (Math.hypot(dx, dy) > 10) swipedAt.current = performance.now();
    if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    // Dragging the room to the left brings the next station in from the right.
    go(neighbour(station, dx < 0 ? 1 : -1));
  };
  // A drag that starts and ends on the same object is also a click on it, which arrives just
  // after. The drag is what the player meant.
  const goFromScene = useCallback(
    (id: StationId) => {
      if (performance.now() - swipedAt.current > 400) go(id);
    },
    [go],
  );

  // The newest message or alert, read out to screen readers.
  const latest = [...game.feed].reverse().find((f) => f.who === "inbox" || f.who === "alert");
  const can3d = canDrawRoom();

  const stationNote = (id: StationId): string => {
    if (id === "inbox") {
      const people = waiting - pressWaiting;
      return people > 0 ? ` (${people})` : "";
    }
    if (id === "press") return pressWaiting > 0 ? ` (${pressWaiting})` : "";
    return "";
  };

  return (
    <main
      className="play"
      ref={screen}
      tabIndex={-1}
      data-severity={board.severity}
      data-view={view}
      data-tab={tab}
      data-panel={panel ?? "none"}
    >
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
            onClick={() => choose(inRoom ? "flat" : "room")}
            disabled={!can3d}
            {...(can3d ? {} : { title: "This browser cannot draw the 3D room." })}
          >
            {inRoom ? "Flat view" : "3D view"}
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
          <button
            type="button"
            onClick={toggleSound}
            disabled={!canSound}
            data-sound={sound ? "on" : "off"}
            {...(canSound ? {} : { title: "This browser cannot make sound." })}
          >
            {sound ? "Turn sound off" : "Turn sound on"}
          </button>
          <button
            type="button"
            className="keys-button"
            onClick={() => setShowKeys(!showKeys)}
            aria-expanded={showKeys}
            aria-controls="keys-panel"
          >
            Keys
          </button>
        </div>
      </header>

      {showKeys && (
        <section className="banner banner-quiet keys" id="keys-panel" aria-labelledby="keys-title">
          <h2 id="keys-title" className="label">
            Keys
          </h2>
          <dl>
            {KEYS.filter((k) => inRoom || !k.room).map((k) => (
              <div key={k.keys}>
                <dt className="mono">{k.keys}</dt>
                <dd>{k.does}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={() => setShowKeys(false)}>
            Close this list
          </button>
        </section>
      )}

      {notice && (
        <div className="banner banner-quiet" role="status">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)}>
            Close this note
          </button>
        </div>
      )}

      {offerFlat && inRoom && (
        <div className="banner banner-quiet" role="status">
          <p>The 3D room is drawing slowly on this device. The flat view has everything in it.</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => choose("flat")}>
              Flat view
            </button>
            <button type="button" onClick={() => setOfferFlat(false)}>
              Stay in 3D
            </button>
          </div>
        </div>
      )}

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
        {inRoom && (
          <div
            className="room"
            ref={roomEl}
            data-ready={roomReady}
            data-station={station}
            data-level={signals.level}
            data-strip={signals.emergencyStrip}
            data-phone={signals.phone}
            data-tv={signals.tv.on}
            data-mika={signals.mikaLamp}
            data-clock={signals.clock.running ? "running" : "stopped"}
            data-frames="0"
            onPointerDown={onSwipeStart}
            onPointerUp={onSwipeEnd}
            onPointerCancel={() => (swipe.current = null)}
          >
            <Suspense fallback={<p className="room-note">Loading the room.</p>}>
              <Room
                signals={signals}
                station={station}
                focused={focused}
                steady={steady}
                compact={compact}
                onStation={goFromScene}
                onLost={onLost}
                onSlow={onSlow}
                onFrame={onFrame}
                onReady={onReady}
              />
            </Suspense>
            {game.paused && <p className="room-note room-paused">Paused</p>}
            <p className="visually-hidden">{describeRoom(signals)}</p>
          </div>
        )}
        <div className="col col-board" tabIndex={0} role="group" aria-label="Board, scrollable">
          <Board view={board} paused={game.paused} />
        </div>
        <div
          className="col col-log"
          ref={logCol}
          onScroll={onLogScroll}
          tabIndex={0}
          role="group"
          aria-label="Log, scrollable"
        >
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
            show={panel === "press" ? "press" : panel === "inbox" ? "people" : "all"}
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

      {inRoom ? (
        <nav className="tabs stations" aria-label="Stations">
          {STATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={station === s.id ? "page" : undefined}
              aria-describedby={`station-${s.id}`}
              onClick={() => go(s.id)}
              onFocus={() => setFocused(s.id)}
              onBlur={() => setFocused(null)}
            >
              <span className="mono station-key">{s.key} </span>
              {s.label}
              {stationNote(s.id)}
            </button>
          ))}
          {/* What each station looks at, read out after the button's name. Kept outside the
              buttons so that a button is called exactly what it shows. */}
          {STATIONS.map((s) => (
            <span key={s.id} id={`station-${s.id}`} className="visually-hidden">
              {s.object}
            </span>
          ))}
        </nav>
      ) : (
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
      )}

      <p className="visually-hidden" aria-live="polite">
        {latest?.text ?? ""}
      </p>
      <p className="visually-hidden" aria-live="assertive">
        {board.severity === 2 ? "The incident is now severe." : ""}
      </p>
    </main>
  );
}
