import { useEffect, useRef } from "react";
import { clockAt } from "../../engine/clock.js";
import type { FeedItem, FeedWho } from "../app/game.js";

const WHO: Record<FeedWho, string> = {
  alert: "Alert",
  you: "You",
  read: "Read as",
  mika: "Mika",
  inbox: "Inbox",
  note: "Note",
  system: "",
};

interface Props {
  feed: readonly FeedItem[];
  startClock: string;
  /** What Mika is doing now, written under the last line as in a paper log. */
  task: { label: string; minutesLeft: number } | null;
  queued: string | null;
  onOpenThread: (threadId: string) => void;
}

/** The duty log: every action, finding and alert, with its time in the margin. */
export function Log({ feed, startClock, task, queued, onOpenThread }: Props) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [feed.length, task?.label, queued]);

  return (
    <section className="log" aria-labelledby="log-title">
      <h2 id="log-title" className="panel-title">
        Log
      </h2>
      {feed.length === 0 ? (
        <p className="muted empty">Nothing yet.</p>
      ) : (
        <ol className="entries">
          {feed.map((item) => (
            <li
              key={item.id}
              className={`entry entry-${item.who}${item.signal ? " entry-signal" : ""}`}
            >
              <time className="mono">{clockAt(startClock, item.minute)}</time>
              <span className="who">{WHO[item.who]}</span>
              <span className="what">
                {item.who === "inbox" && item.threadId ? (
                  <button
                    type="button"
                    className="link"
                    onClick={() => onOpenThread(item.threadId ?? "")}
                  >
                    {item.text}
                  </button>
                ) : (
                  item.text
                )}
              </span>
            </li>
          ))}
          {task && (
            <li className="entry entry-running">
              <span className="mono margin" aria-hidden="true" />
              <span className="who">Mika</span>
              <span className="what">
                {task.label}: running, <span className="mono">{task.minutesLeft} min left</span>
              </span>
            </li>
          )}
          {queued && (
            <li className="entry entry-running">
              <span className="mono margin" aria-hidden="true" />
              <span className="who">Next</span>
              <span className="what">{queued}: queued</span>
            </li>
          )}
          <li ref={end} aria-hidden="true" className="entries-end" />
        </ol>
      )}
    </section>
  );
}
