# BrownOut

A crisis war-room simulator. You are the person in charge of a company incident. The model plays everyone else: the CTO, support, legal, the press, and the incident itself.

> **Status: milestone M0 is built.** The repository has its guards (secrets scan, static analysis, dependency audit, lint, type-check, tests, CI) and the full design documentation. There is no application code yet. Next is M1, the simulation engine, in [docs/01-product/milestones.md](docs/01-product/milestones.md).

## Getting started

Needs Node 22 or newer and [gitleaks](https://github.com/gitleaks/gitleaks) on your PATH. Python 3 is needed once, to install semgrep.

```
npm ci                  # installs dependencies and points git at .githooks
npm run tools:semgrep   # installs the pinned semgrep into .tools/
npm test
```

Every commit runs the secrets scan, lint, type-check and tests. Every push also runs static analysis, a dependency audit and a scan of the whole history. A check whose tool is missing fails and says which tool; it never passes silently. Details are in [workflows](docs/07-process/workflows.md).

## What it is

It is 02:14. You are the on-call engineering lead at a mobile carrier. Customers cannot connect and the dashboard is red. You type what you do, in your own words:

> Check whether last night's deploy touched the billing service.

BrownOut answers with what you would find. Some of it helps. Some of it points the wrong way, because real incidents do.

The situation keeps moving whether or not you act:

- The CTO wants an ETA within ten minutes, and remembers what you promise.
- Support reports 400 tickets and climbing.
- A journalist asks for comment because customers are posting about it.
- Legal asks whether customer data could have been exposed.

You decide what to do first and what to tell each person. If you tell the press that everything is fine and it later turns out not to be, that comes back.

When the incident ends, you get a debrief: what you handled well, what you missed, and what a stronger response would have looked like, with every point tied to a moment in your own timeline.

A session takes about ten minutes.

## The room

You play from a desk in a 3D operations room. The wall board shows the numbers, the phone lights up when the CTO writes, the television comes on when the press publishes, and the ceiling lights sag as the incident gets worse. Look at an object and its contents open beside it as an ordinary readable panel. The box you type in never leaves the screen.

The same game runs as a flat page for devices or people that the 3D room does not suit. See the [UI design](docs/03-design/ui-design.md).

## How it works

One rule shapes the whole design: **the engine owns the facts, the model owns the words.**

- A deterministic engine, written in TypeScript, holds the clock, the numbers, the hidden root cause, every promise you made and every claim you put on the record. It decides what happens.
- Claude Fable 5.2 reads your free-text action and maps it to something the engine understands. After the engine has resolved the turn, the model writes the messages, findings and press copy from the resolved state.
- The model cannot change a number or reveal a fact the engine has not released. Text that cites a number the engine did not supply is rejected.
- The score is computed by the engine from the event log. The model writes the debrief narrative around that score and has to cite the events it refers to.

Details: [high-level design](docs/03-design/high-level-design.md), [simulation engine](docs/03-design/simulation-engine.md), [model contract](docs/03-design/model-contract.md).

## Planned stack

| Part | Choice |
|---|---|
| Language | TypeScript, Node 22 |
| Server | Express 5, zod for every boundary |
| Client | React with Vite. The play screen is a 3D room built with three.js through React Three Fiber, with a flat view as an equal alternative |
| Model | Claude Fable 5.2 through the official `@anthropic-ai/sdk` |
| Storage | In-memory sessions, exportable event logs, no database |
| Tests | Vitest, Playwright, recorded model responses for repeatable runs |

Reasons are in the [decision log](docs/00-overview/decision-log.md).

## Documentation

Start with [docs/README.md](docs/README.md). It lists every document and the order to read them in.

| If you want | Read |
|---|---|
| The idea in two pages | [Vision](docs/00-overview/vision.md) |
| How a session plays | [Gameplay](docs/01-product/gameplay.md) |
| What will be built, in what order | [Milestones](docs/01-product/milestones.md) |
| How the engine and the model split the work | [High-level design](docs/03-design/high-level-design.md) |
| The first scenario, fully written out | [Scenarios](docs/03-design/scenarios.md) |

## The name

A brownout is a partial failure. The voltage sags, the lights dim, and things half-work. Most real incidents look like that: nothing is fully down, nothing is fully up, and someone has to decide what to do with incomplete information.

All companies, people and events in the scenarios are fictional.
