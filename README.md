# BrownOut

A crisis war-room simulator. You are the person in charge of a company incident. You type what you do, and the incident and everyone who needs something from you respond: the CTO, support, legal, the press.

It uses no AI service and no API key. Everything runs on your own machine, and it costs nothing to play.

> **Status: milestones M0, M1, M2 and the first half of M3 are built.** The simulation engine, the first situation (Dial Tone) and free-text play all work, in a terminal and in a browser as a flat page. The 3D room (M3 stage B), session export and replay (M4) are not built yet. Nine more situations follow in M5. See [docs/01-product/milestones.md](docs/01-product/milestones.md).

## Getting started

Needs Node 22 or newer and [gitleaks](https://github.com/gitleaks/gitleaks) on your PATH. Python 3 is needed once, to install semgrep.

```
npm ci                  # installs dependencies and points git at .githooks
npm run tools:semgrep   # installs the pinned semgrep into .tools/
npm test
npm run dev                         # play Dial Tone in the browser, at localhost:5173
npm run play                        # or play it in the terminal
npm run play -- --auto ideal        # watch a scripted session and read the debrief
npm run validate:scenarios          # prove each situation is solvable and fair
```

In the browser, type what you would do in the box at the bottom, or open a thread in the inbox and reply there. `/` jumps to the box, `Space` pauses, `Esc` closes a thread. In the terminal, `?` lists everything you could do, and `@cto your message` replies to someone directly.

The browser tests drive the built site. They need Chromium once:

```
npx playwright install chromium
npm run e2e                         # builds, then plays the game in a real browser
```

Every commit runs the secrets scan, lint, type-check and tests. Every push also runs static analysis, a dependency audit and a scan of the whole history. A check whose tool is missing fails and says which tool; it never passes silently. Details are in [workflows](docs/07-process/workflows.md).

## What it is

It is 02:14. You are the on-call engineering lead at a mobile carrier. Customers cannot connect and the dashboard is red. You type what you do, in your own words:

> Check whether last night's deploy touched the billing service.

BrownOut answers with what you would find. Some of it helps. Some of it points the wrong way, because real incidents do.

The situation keeps moving whether or not you act:

- The CTO wants an ETA within ten minutes, and remembers what you promise.
- Support reports hundreds of tickets and climbing.
- A journalist asks for comment because customers are posting about it.
- Legal asks whether customer data could have been exposed.

You decide what to do first and what to tell each person. If you tell the press that everything is fine and it later turns out not to be, your own words are quoted back to you.

When the incident ends, you get a debrief: what you handled well, what you missed, and what a stronger response would have looked like, with every point tied to a moment in your own timeline.

A session takes about ten minutes.

## One hundred situations

Dial Tone is the first of a [catalogue of one hundred](docs/03-design/situation-catalog.md), in ten groups: outages, data and privacy, security incidents, bad releases, vendors, people and process, press and social media, safety, money, and the physical world. In each one, what it looks like at the start is not what it really is, and there is a natural reaction that makes things worse.

They are built in waves of ten. One is playable today.

## The room

The web version will be played from a desk in a 3D operations room (not built yet). The wall board shows the numbers, the phone lights up when the CTO writes, the television comes on when the press publishes, and the ceiling lights sag as the incident gets worse. Look at an object and its contents open beside it as an ordinary readable panel. The box you type in never leaves the screen.

The same game runs today as a flat page, laid out like a duty logbook: the board, the log and the inbox side by side, or as three tabs on a phone. It stays as an equal alternative for devices or people that the 3D room does not suit. See the [UI design](docs/03-design/ui-design.md).

## How it works

- **An engine owns the facts.** A deterministic engine, written in TypeScript, holds the clock, the numbers, the hidden root cause, every promise you made and every statement you put on the record. It decides what happens. The same seed and the same actions always give the same session.
- **A local matcher reads what you type.** It compares your words with what can be done in the situation. When your text could mean two things it asks which you meant, at no cost in game time. When nothing fits it shows the nearest things you could do. It is plain code: no model, no network. On Dial Tone it puts the right reading first for 92 percent of a labelled test set, and first or among the offered choices for all of it.
- **The words are authored.** Every message is written by hand, with variants for how much the sender trusts you. The engine fills in the live numbers and your own earlier words.
- **A validator keeps situations fair.** No situation ships unless it is solvable, every clue is reachable, every message can occur, and doing nothing does not win.

Details: [local play](docs/03-design/local-play.md), [simulation engine](docs/03-design/simulation-engine.md), [scenario format](docs/03-design/scenario-format.md).

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript, Node 22 |
| Engine and matcher | Plain TypeScript with no runtime dependencies beyond zod |
| Interface | React with Vite. Flat view is built; the 3D room, with three.js, is next |
| Server | None. The whole game runs in the browser and ships as static files |
| AI services | None |
| Tests | Vitest for the engine, matcher and interface logic. Playwright with axe for the built site |

Reasons are in the [decision log](docs/00-overview/decision-log.md).

## Documentation

Start with [docs/README.md](docs/README.md). It lists every document and the order to read them in.

| If you want | Read |
|---|---|
| The idea in two pages | [Vision](docs/00-overview/vision.md) |
| How a session plays | [Gameplay](docs/01-product/gameplay.md) |
| What will be built, in what order | [Milestones](docs/01-product/milestones.md) |
| How typed text is understood without a model | [Local play](docs/03-design/local-play.md) |
| All one hundred situations | [Situation catalogue](docs/03-design/situation-catalog.md) |
| The first situation, fully written out | [Scenarios](docs/03-design/scenarios.md) |

## The name

A brownout is a partial failure. The voltage sags, the lights dim, and things half-work. Most real incidents look like that: nothing is fully down, nothing is fully up, and someone has to decide what to do with incomplete information.

All companies, people and events in the situations are fictional.
