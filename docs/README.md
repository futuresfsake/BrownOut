# BrownOut documentation

Everything needed to build BrownOut is in this folder. The documents were written before any code, so where a document and the code disagree later, fix whichever is wrong and note the change in the [decision log](00-overview/decision-log.md).

## Reading order

For someone about to build it:

1. [Vision](00-overview/vision.md): what it is, who it is for, what it is not.
2. [Gameplay](01-product/gameplay.md): one session from start to finish.
3. [High-level design](03-design/high-level-design.md): the parts and how a turn moves through them.
4. [Simulation engine](03-design/simulation-engine.md): state, clock, rules.
5. [Local play](03-design/local-play.md): how typed text is understood and where the words come from, with no model.
6. [Scenario format](03-design/scenario-format.md) and [Scenarios](03-design/scenarios.md).
7. [Milestones](01-product/milestones.md): the build order and exit criteria.
8. [Workflows](07-process/workflows.md): how work is committed, checked and merged.

## All documents

| Folder | Document | Contents |
|---|---|---|
| 00-overview | [vision.md](00-overview/vision.md) | Purpose, audience, principles, non-goals |
| | [decision-log.md](00-overview/decision-log.md) | Decisions made, with reasons |
| | [open-decisions.md](00-overview/open-decisions.md) | Decisions not yet made, risks, known limits |
| 01-product | [gameplay.md](01-product/gameplay.md) | Rules of play and a worked session |
| | [user-stories.md](01-product/user-stories.md) | 51 stories with acceptance criteria, grouped by milestone |
| | [features.md](01-product/features.md) | Feature list with priorities |
| | [milestones.md](01-product/milestones.md) | M0 to M6 with exit criteria |
| 02-requirements | [specs.md](02-requirements/specs.md) | Functional and non-functional requirements |
| 03-design | [high-level-design.md](03-design/high-level-design.md) | Architecture, turn pipeline, modes |
| | [simulation-engine.md](03-design/simulation-engine.md) | State model and resolution rules |
| | [local-play.md](03-design/local-play.md) | How the game works with no model: the matcher, authored text, running in the browser |
| | [situation-catalog.md](03-design/situation-catalog.md) | One hundred situations, in ten groups, and how they are built in waves |
| | [model-contract.md](03-design/model-contract.md) | Not in version 1: how a model could be added later |
| | [scenario-format.md](03-design/scenario-format.md) | How a scenario is authored |
| | [scenarios.md](03-design/scenarios.md) | Scenario 1 in full, scenarios 2 and 3 in brief |
| | [scoring-and-debrief.md](03-design/scoring-and-debrief.md) | Score rules and debrief structure |
| | [http-api.md](03-design/http-api.md) | Not in version 1: the earlier server design |
| | [ui-design.md](03-design/ui-design.md) | Visual direction, layout, states |
| 04-security | [security-overview.md](04-security/security-overview.md) | Threats and controls |
| 05-quality | [testing-strategy.md](05-quality/testing-strategy.md) | Test layers and definition of done |
| 07-process | [workflows.md](07-process/workflows.md) | Branching, commits, gates, evidence |
| docs root | [GLOSSARY.md](GLOSSARY.md) | Terms used across the documents |

Folders 06 (operations), 08 (guides) and 10 (reviews) will be added when there is something to operate, run and review.

## Identifier prefixes

| Prefix | Meaning | Lives in |
|---|---|---|
| DL | Decision made | decision-log.md |
| O | Open decision | open-decisions.md |
| R | Risk | open-decisions.md |
| L | Known limit | open-decisions.md |
| F | Feature | features.md |
| FR / NFR | Requirement | specs.md |
| M | Milestone | milestones.md |
