import { useState, type FormEvent } from "react";
import { MAX_INPUT, type ThreadView } from "../app/game.js";

interface Props {
  threads: readonly ThreadView[];
  openId: string | null;
  disabled: boolean;
  onOpen: (threadId: string | null) => void;
  onReply: (threadId: string, text: string) => void;
}

/** One thread per person. Unanswered threads say so in words, not only with a marker. */
export function Inbox({ threads, openId, disabled, onOpen, onReply }: Props) {
  const open = threads.find((t) => t.id === openId);
  if (open)
    return (
      <Thread thread={open} disabled={disabled} onBack={() => onOpen(null)} onReply={onReply} />
    );

  const order = (t: ThreadView) => (t.state === "Overdue" ? 0 : t.state === "Unanswered" ? 1 : 2);
  const sorted = [...threads].sort((a, b) => order(a) - order(b) || b.lastMinute - a.lastMinute);
  const quiet = sorted.every((t) => t.messages.length === 0);
  const people = sorted.filter((t) => !t.press);
  const press = sorted.filter((t) => t.press);

  const rows = (list: readonly ThreadView[]) => (
    <ul className="threads">
      {list.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            className={`thread-row${t.state ? " thread-waiting" : ""}${t.press ? " thread-press" : ""}`}
            onClick={() => onOpen(t.id)}
          >
            <span className="thread-name">
              {t.name}
              {t.state && (
                <span className="flag">
                  <span className="flag-mark" aria-hidden="true" />
                  {t.state}
                  {t.state === "Overdue" ? `, ${t.waitingMinutes} min` : ""}
                </span>
              )}
              {t.nextDue && (
                <span className={t.nextDue.soon ? "due due-soon" : "due"}>
                  {t.nextDue.soon ? "Promise due soon, " : "Promise due "}
                  <span className="mono">{t.nextDue.clock}</span>
                </span>
              )}
            </span>
            <span className="thread-role">{t.role}</span>
            <span className="thread-preview">{t.preview || "No messages"}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <h2 id="inbox-title" className="panel-title">
        Inbox
      </h2>
      {quiet && <p className="muted empty">No messages yet. You can still write to anyone.</p>}
      {rows(people)}
      {press.length > 0 && (
        <>
          <h3 className="label press-title">Press</h3>
          {rows(press)}
        </>
      )}
    </section>
  );
}

interface ThreadProps {
  thread: ThreadView;
  disabled: boolean;
  onBack: () => void;
  onReply: (threadId: string, text: string) => void;
}

function Thread({ thread, disabled, onBack, onReply }: ThreadProps) {
  const [text, setText] = useState("");
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return;
    onReply(thread.id, text);
    setText("");
  };
  return (
    <section
      className={`inbox thread${thread.press ? " thread-press" : ""}`}
      aria-labelledby="thread-title"
    >
      <div className="thread-head">
        <button type="button" onClick={onBack}>
          Back to inbox
        </button>
        <div>
          <h2 id="thread-title" className="panel-title">
            {thread.name}
          </h2>
          <p className="muted">{thread.role}</p>
        </div>
      </div>

      {thread.messages.length === 0 ? (
        <p className="muted empty">Nothing from {thread.name} yet.</p>
      ) : (
        <ol className="messages">
          {thread.messages.map((m, n) => (
            <li key={n} className={m.mine ? "message mine" : "message"}>
              <time className="mono">{m.clock}</time>
              <p>
                {m.mine && <span className="who">You </span>}
                {m.text}
              </p>
            </li>
          ))}
        </ol>
      )}

      {thread.promises.length > 0 && (
        <ul className="promises" aria-label="Your promises to this person">
          {thread.promises.map((p, n) => (
            <li key={n} className={`promise promise-${p.status}`}>
              You promised {p.what}
              {p.due ? <span className="mono"> by {p.due}</span> : ""}: {p.status}
            </li>
          ))}
        </ul>
      )}

      <form className="reply" onSubmit={send}>
        <label htmlFor="reply-box">Reply to {thread.name}</label>
        <div className="row">
          <input
            id="reply-box"
            type="text"
            value={text}
            maxLength={MAX_INPUT}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="primary" disabled={disabled || text.trim() === ""}>
            Reply
          </button>
        </div>
      </form>
    </section>
  );
}
