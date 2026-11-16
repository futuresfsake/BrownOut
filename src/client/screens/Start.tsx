import { useRef, useState, type ChangeEvent } from "react";
import { scenarios } from "../../scenarios/index.js";
import { samples } from "../app/samples.js";
import { MAX_FILE_BYTES } from "../app/session-file.js";

interface Props {
  onChoose: (scenarioId: string) => void;
  onWatchSample: (scenarioId: string) => void;
  /** Opens a session file's text. Returns why not, if it cannot be opened. */
  onOpenFile: (text: string) => string | null;
}

export function Start({ onChoose, onWatchSample, onOpenFile }: Props) {
  const [refused, setRefused] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // The same file can be chosen again after a refusal.
    e.target.value = "";
    if (!file) return;
    // The size is checked before a byte of the file is read.
    if (file.size > MAX_FILE_BYTES) {
      setRefused("This file is larger than 512 KB, so it was not opened.");
      return;
    }
    try {
      setRefused(onOpenFile(await file.text()));
    } catch {
      setRefused("This file could not be read.");
    }
  };

  return (
    <main className="page">
      <header className="masthead">
        <p className="wordmark">BrownOut</p>
        <p className="lede">
          A crisis war-room simulator. You run a company incident by typing what you do, and the
          people who need something from you answer back.
        </p>
        <p className="fineprint">
          Nothing you type leaves this page. There is no account, no AI service and no charge.
        </p>
      </header>

      <section aria-labelledby="situations">
        <h1 id="situations" className="rule-heading">
          Situations
        </h1>
        <ol className="situations">
          {scenarios.map(({ scenario }, n) => (
            <li key={scenario.id}>
              <span className="mono situation-number">{String(n + 1).padStart(3, "0")}</span>
              <div>
                <h2>{scenario.title}</h2>
                <p>{scenario.briefing.role}</p>
                <p className="muted">Starts at {scenario.startClock}. About ten minutes to play.</p>
              </div>
              <button type="button" className="primary" onClick={() => onChoose(scenario.id)}>
                Read the briefing
              </button>
            </li>
          ))}
        </ol>
        <p className="muted">
          {scenarios.length === 1 ? "One situation is" : `${scenarios.length} situations are`}{" "}
          playable. Ninety-nine more are planned.
        </p>
      </section>

      <section aria-labelledby="watch">
        <h2 id="watch" className="rule-heading">
          Watch a session
        </h2>
        <ol className="situations">
          {samples.map((sample) => {
            const title = scenarios.find((s) => s.scenario.id === sample.scenarioId)?.scenario
              .title;
            return (
              <li key={`${sample.scenarioId}-${sample.seed}`}>
                <span className="mono situation-number">REC</span>
                <div>
                  <h3>
                    {title}: {sample.title}
                  </h3>
                  <p>{sample.about}</p>
                  <p className="muted">
                    A recording. Step through it or let it play, then read its debrief.
                  </p>
                </div>
                <button type="button" onClick={() => onWatchSample(sample.scenarioId)}>
                  Watch the sample
                </button>
              </li>
            );
          })}
          <li>
            <span className="mono situation-number">FILE</span>
            <div>
              <h3>A session you saved</h3>
              <p>Open a file saved from a debrief, yours or someone else&apos;s.</p>
              <p className="muted">
                The file is read on this device and sent nowhere. It is checked before anything is
                shown.
              </p>
            </div>
            <button type="button" onClick={() => picker.current?.click()}>
              Open a session file
            </button>
            <input
              ref={picker}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              aria-label="Session file"
              tabIndex={-1}
              onChange={(e) => void onFile(e)}
            />
          </li>
        </ol>
        <p className="refused" role="alert">
          {refused ?? ""}
        </p>
      </section>
    </main>
  );
}
