# Local play: no model, no API key

Decided on 2026-11-16 (DL-24). BrownOut version 1 uses no language model. Nothing is sent to an outside service, a session costs nothing to run, and nobody needs an API key.

This replaces the interpret, narrate and debrief calls in [model-contract.md](model-contract.md). That document is kept as a possible later option and is not part of version 1.

## What changes and what does not

| Part | Before | Now |
|---|---|---|
| Engine, scenario format, scoring, validator | Built in M1 | Unchanged |
| Understanding what the player typed | A model call | A matcher that runs locally |
| The words stakeholders say | Written by a model from engine facts | Authored, with variants |
| The debrief text | Written by a model | Assembled from the score lines and authored lessons |
| Where the game runs | A server that holds the API key | Entirely in the browser |
| Cost per session | Estimated at about a dollar | Zero |
| Public demo | A recording only | Fully playable |

The principle stays the same: the engine owns the facts. What changes is who owns the words. They are now authored.

## Understanding free text

The player still types whatever they like. The matcher turns that text into the same `Intent` the engine already accepts.

### Steps

1. **Clean up.** Lower-case, strip punctuation, expand contractions, and reduce words to a base form ("restarting", "restarted" to "restart").
2. **Apply synonyms.** A shared list ("roll back", "revert", "undo", "put back") plus a short list per situation ("auth boxes", "sign-in servers" both mean auth-core).
3. **Score every option.** Each investigation, mitigation and directive has a label and at least five example phrasings. The typed text is scored against each one by shared words, with rare words counting more than common ones. This is a standard text-ranking method and needs no training.
4. **Find the people.** Names, first names and roles ("the CTO", "Ramon", "legal", "the reporter") select recipients. A reply typed inside a thread goes to that person by default.
5. **Find claims.** Each claim topic has authored trigger phrases. Words like "no", "not", "unaffected", "fine" set the stance to denies; "might", "not sure", "don't know yet", "investigating" set it to uncertain.
6. **Find promises.** Time expressions ("in ten minutes", "by 02:30", "within the hour") addressed to a person become a commitment with a due time.

### What happens with the score

| Result | What the player sees | Time cost |
|---|---|---|
| One clear winner | The action runs, with a one-line restatement in the log | Normal |
| Two or three close candidates | "Did you mean:" with those options and "something else" | None until they choose |
| Nothing close | "Not understood", with the three nearest things they could do | One minute |

The "did you mean" step is what makes a simple matcher feel fair. It never guesses silently between close options, and asking costs the player nothing.

### Measured, not assumed

Each situation has a set of labelled phrasings (at least 40). The matcher must put the right option first for 85 percent of them, and include it in the "did you mean" list for 97 percent. This runs in the normal test suite because it needs no network.

## The words

- Every message and result already has authored text (it was the fallback text). That text is now the product.
- A message can carry up to three variants by trust level, so the CTO sounds different when trust is low.
- Where several wordings exist, the seed picks one, so a replay reads differently.
- Live numbers, clock times and the player's own earlier words are filled into the text by the engine. Being quoted back exactly, which is the moment the design depends on, works as before.

## The debrief

Assembled by code from things that already exist:

1. The score and its evidence lines, each tied to events.
2. The session timeline.
3. An authored lesson for each trap the player fell into, and for each one they avoided.
4. "A stronger response": the situation's ideal path, shown beside what the player did at the same minutes.
5. "One thing": the largest single score loss, stated plainly.

## Running in the browser

The engine is plain TypeScript with no network and no file access, so it runs in the browser unchanged. There is no server-side game logic.

- Hosting is a folder of static files. No secrets exist anywhere.
- Sessions live in the tab. Export and replay use a downloaded file.
- The rate limits, budget switch and session store in the earlier design are not needed.

One consequence to accept: the situation data, including the hidden root cause, is in the files the browser downloads. A player who reads the page source can find the answer. For a single-player practice tool with no leaderboard, that is acceptable (L-11).

## Limits

- The matcher is weaker than a model with unusual phrasing, long compound sentences and typing errors. The "did you mean" step and the measured accuracy set are the response.
- Stakeholders cannot react to something the author did not anticipate. An unmatched action still gets a neutral result.
- Every message has to be written by hand, which is why the catalogue is built in waves.

## Adding a model later

The matcher and the model would produce the same `Intent`, and authored text is the same thing the model design called fallback text. A model could therefore be added later as an option, with the player's own key, without changing the engine or the situations. It is not planned.
