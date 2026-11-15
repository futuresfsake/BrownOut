# Security overview

BrownOut has no accounts and stores no personal data, so the things worth protecting are few: the API key, the author's money, the integrity of a session, and the visitor's browser.

## Assets and threats

| Asset | Threat | Control |
|---|---|---|
| Anthropic API key | Leaks into the repository, the client bundle, logs, an export or a cassette | Key read only from the server environment. `.env` ignored by git. gitleaks in pre-commit, pre-push and CI. CI searches the built client for the key's prefix and for the variable name. The cassette recorder and exporter write only parsed outputs. |
| Model spend | A visitor or a script runs many live turns | Public deployment runs in replay mode with no key (DL-11). In live mode: per-session and per-address rate limits (NFR-10), daily budget switch (FR-27), 600-character input cap, output token caps per call. |
| Session integrity | One visitor reads or drives another's session | Session IDs have at least 128 bits of randomness and are the only credential. No listing endpoint. Sessions expire. |
| Hidden scenario facts | Player extracts the ground truth through the API or the model | The API returns `PublicState` only. The interpret and narrate calls are never given the ground truth. Leak check on narrated text. |
| Visitor's browser | Model output or a loaded replay file injects markup or script | All model and replay text is rendered as text nodes. No `dangerouslySetInnerHTML`, no Markdown rendering. Content Security Policy with no inline script and no third-party origins. Replay files are validated against a strict schema with size and length limits before use. |
| Server | Oversized or malformed requests, dependency vulnerabilities | Body size limits, zod validation on every route, Helmet defaults, `npm audit` in CI, Dependabot. |

## Prompt injection

The action box accepts free text that is sent to a model, so injection attempts are expected.

What a successful injection could do is limited by design:

- The interpret call can only return IDs from the scenario's fixed lists, plus short strings. The engine re-checks every ID. It cannot grant a result, change a metric or end the session.
- The narrate call does not receive the player's raw text. It receives facts from the engine and, where a stakeholder quotes the player, an exact quoted string marked as a quote.
- The debrief call receives the player's text only as quoted data inside the event log.
- No model output is executed, used as a file path or URL, or rendered as markup.

The worst realistic outcome is that the model writes something out of character in one message. The numeric guard and leak check catch the cases that would affect fairness.

Test cases for M2 include: instructions to ignore rules, requests to reveal the cause, text that imitates the prompt's own delimiters, very long input, and input in another language.

## Content

- Scenarios are about responding to incidents. They contain no working attack steps (authoring rule 11).
- All names are fictional (authoring rule 10).
- If the model declines a request, the turn uses fallback text. Declines are counted per scenario so that wording which triggers them can be fixed.
- Player text is not moderated beyond the length cap, because it is shown only to the player who typed it. It is not stored after the session expires unless the player exports it.

## Privacy

- No accounts, no email, no names.
- No analytics and no third-party scripts or fonts. Fonts are self-hosted.
- The rate limiter keeps network addresses in memory only, for the length of its window.
- Production logs contain call metadata (timings, token counts, guard results) and no prompt or player text.
- Live play sends the player's text to the Anthropic API. The start screen says so in one sentence before a live session begins.

## Secrets rules for this repository

- No secret-shaped string in code, tests, fixtures or documents, including obviously fake ones. Tests that need one build it at runtime from parts.
- `.env.example` has empty values.
- Before the first push and before any release: gitleaks over the full history.

## Checks before every commit and push

| Check | Tool | Blocks |
|---|---|---|
| Secrets in staged changes | gitleaks | commit |
| Secrets in history | gitleaks | push |
| Static analysis | semgrep with the JavaScript and TypeScript rule sets | push |
| Lint with security rules | ESLint | commit |
| Dependency audit | `npm audit --omit=dev` at high and above | push |
| No env file or local path tracked | script in `tools/` | commit |

Results are reported in the pull request, including when they are clean, and any check that could not be run is named.
