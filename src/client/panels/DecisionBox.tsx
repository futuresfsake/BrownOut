import { useState, type FormEvent, type RefObject } from "react";
import { MAX_INPUT, type Pending } from "../app/game.js";

interface Props {
  pending: Pending | null;
  disabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onSubmit: (text: string) => void;
  onPick: (index: number) => void;
  onDismiss: () => void;
}

/** Where the player types what they do. Always on screen. */
export function DecisionBox({ pending, disabled, inputRef, onSubmit, onPick, onDismiss }: Props) {
  const [text, setText] = useState("");
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return;
    onSubmit(text);
    setText("");
  };
  const near = text.length > MAX_INPUT - 100;

  return (
    <div className="decision">
      {pending && (
        <div className="pending" role="group" aria-labelledby="pending-title">
          <p id="pending-title" className="label">
            {pending.kind === "choose"
              ? "Did you mean"
              : "Not understood. The nearest things you could do"}
          </p>
          <ul>
            {pending.candidates.map((c, n) => (
              <li key={c.label}>
                <button type="button" onClick={() => onPick(n)} disabled={disabled}>
                  {c.label}
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="quiet" onClick={onDismiss}>
                {pending.kind === "choose" ? "Something else" : "None of these"}
              </button>
            </li>
          </ul>
          {pending.kind === "choose" && <p className="muted">No time passes until you choose.</p>}
        </div>
      )}
      <form onSubmit={send}>
        <label htmlFor="decision-box">What do you do?</label>
        <div className="row">
          <input
            id="decision-box"
            ref={inputRef}
            type="text"
            value={text}
            maxLength={MAX_INPUT}
            disabled={disabled}
            autoComplete="off"
            placeholder={
              disabled ? "The incident is closed." : "Type an order, or what you tell someone"
            }
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="primary" disabled={disabled || text.trim() === ""}>
            Act
          </button>
        </div>
        {near && (
          <p className="muted mono" aria-live="polite">
            {text.length} of {MAX_INPUT} characters
          </p>
        )}
      </form>
    </div>
  );
}
