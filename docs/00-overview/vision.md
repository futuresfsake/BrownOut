# Vision

## One sentence

BrownOut is a simulator where you run a company incident in real time, typing what you do, while the incident and everyone who needs something from you respond.

## The problem

Incident response is a skill people mostly learn during real incidents, which is the most expensive place to learn it. Tabletop exercises exist, but they need a facilitator, a script and a free afternoon, and the script cannot react to an unexpected decision.

The hard part of an incident is rarely the technical fix alone. It is doing the fix while four people ask for four different things, with partial information, and without saying something that turns out to be false an hour later.

## What BrownOut does about it

It gives one person a ten-minute incident they can run alone, as often as they like:

- The situation responds to what they actually type, not to a menu of choices.
- Stakeholders hold them to what they said earlier.
- Pressure arrives on its own schedule.
- At the end they see a scored timeline of their own decisions and a better version of it.

## Who it is for

| Person | What they get |
|---|---|
| An engineer about to join an on-call rotation | Practice at triage and at talking to non-engineers under pressure |
| A new engineering or operations lead | Practice at prioritising between fixing, informing and escalating |
| A student or career changer | A feel for what incident command involves |
| Someone reviewing the author's portfolio | A project that can be explained in a sentence and played in a few minutes |

## Why no language model

The first design used a language model to read the player's text and write the replies. Version 1 does not (DL-24). A model costs money on every turn, needs a key, adds a wait, and can decline. For a practice tool that should be free to play and free to leave online, that was the wrong trade.

What replaces it:

- A local matcher reads what the player typed and, when unsure, asks which of two or three things they meant.
- Every message is authored, with variants, and the engine fills in the live numbers and the player's own earlier words.
- Variety comes from a catalogue of one hundred situations and from seeds, not from generated text.

## Principles

1. **The engine owns the facts.** Numbers, timings, root cause, promises and scores live in code and are never improvised.
2. **Free text in, structured intent out.** The player is never forced into multiple choice. Their text is matched to authored investigations and mitigations where one fits.
3. **Consequences have a paper trail.** Anything the player is later held to (a promise, a public statement) is stored by the engine at the moment it is made, and the later consequence points back to it.
4. **Free to play and free to host.** No paid service anywhere. If something would cost money, a local alternative is built.
5. **Reproducible.** The same situation, seed and sequence of intents produce the same event log.
6. **Short.** One situation fits in about ten minutes of play.

## Non-goals

- Not a real incident management tool. It pages no one and connects to no real system.
- Not multiplayer. One player per session in version 1.
- Not a 3D exploration game. The room is somewhere to sit and work, with fixed views. There is nothing to walk around and find.
- Not a certification or an assessment anyone should be hired or fired on.
- No accounts, profiles or leaderboards in version 1.
- No generated content. Every situation and every line is authored.
- Not legal advice. Regulatory deadlines in the scenarios are fictional and simplified.

## What success looks like

- A first-time player finishes scenario 1 without reading instructions beyond the opening screen.
- Two players who make different decisions get visibly different sessions and different debriefs.
- A player who lies to the journalist at minute 12 is confronted with it later, quoted accurately.
- Every number on screen can be traced to the engine state.
- The public demo costs nothing to leave running.
