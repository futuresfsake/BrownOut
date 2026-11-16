# Security overview

Rewritten at M3 for the design that DL-24 and DL-26 left: no model, no API key, no server. BrownOut is a set of static files. It has no accounts, stores no personal data and talks to nothing.

That leaves three things worth protecting: the visitor's browser, the supply chain the site is built from, and the repository itself.

## Assets and threats

| Asset | Threat | Control |
|---|---|---|
| Visitor's browser | Text from a scenario, from the player, or from a loaded session file is treated as markup or script | Every string is rendered as a text node by React. No `dangerouslySetInnerHTML`, no Markdown rendering, no `eval`. A Content Security Policy that allows only the site's own files (below). Session files are validated before anything is drawn from them (M4). |
| Visitor's privacy | What the player types is sent somewhere | Nothing is sent. The policy sets `connect-src 'none'`, a unit test fails if any file under `src` uses a network API, and a browser test counts requests during a session and expects none after the page has loaded. |
| A saved session | A changed or damaged save in the tab's storage breaks the page | The save is read through a version check and shape checks, and is discarded if either fails. It lives in `sessionStorage`, so it ends with the tab. |
| Hidden scenario facts | A player reads the cause from the page source | Accepted. The scenario ships to the browser, so a determined player can read it. This is a single-player game with no leaderboard; the only person spoiled is the one who looked. |
| The built site | A dependency with a known vulnerability, or a tampered one | `npm ci` from a lockfile, `npm audit --omit=dev` at high and above on every push, Dependabot, GitHub Actions pinned to commit SHAs, tool versions pinned in `tools/versions.json`. |
| The repository | A secret, a personal detail or a local path is committed | gitleaks on staged changes and on the whole history, the tracked-file check, and the rules below. |

## Content Security Policy

Added to the page at build time by `vite.config.ts`:

```
default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self';
img-src 'self' data:; connect-src 'none'; object-src 'none';
base-uri 'none'; form-action 'none'
```

- No inline script and no inline style. No `unsafe-inline`, no `unsafe-eval`, no other origin.
- It is not applied by the development server, which injects an inline script for hot reload. The browser tests run against the built site, so they run under the policy, and one test reads the policy from the page.
- The policy is a `meta` element because static hosting may not let the site set response headers. Two directives cannot be set this way (`frame-ancestors` and `report-uri`). If the host at M6 allows headers, move the policy there and add `frame-ancestors 'none'`.

### The 3D room (stage B)

- The room loads nothing from other origins. Geometry is built in code, fonts are self-hosted and sounds are generated (NFR-15).
- Text drawn in the scene comes from the same state as the panels. It is drawn as glyphs on a canvas with `fillText`, never interpreted as markup.
- The policy above is unchanged by the room (DL-36). There is no worker and no blob URL, because text is drawn on a canvas and not by a text helper. No panel is positioned with an inline style: the panels sit in the page's own grid beside the room. Sound is made by Web Audio oscillators, which need nothing from the policy. The browser test that reads the policy and the one that counts requests both run with the room open.
- The room adds two packages to what ships: `three` and `@react-three/fiber`. They are in the dependency audit like everything else.
- The browser tests read what the room shows from `data-` attributes on its element and from the sentence written for screen readers. Both are in the shipped page. They hold nothing that the panels beside them do not already show.

## Typed input

The decision box accepts free text. Nothing interprets it as instructions: the matcher compares its words with the labels and example phrasings of the situation and returns ids from the situation's own lists, which the engine checks again.

- Input is cut at 600 characters.
- Nonsense, very long text and instruction-style text can cost at most one minute of game time and change nothing else. This is tested in M2.
- Patterns built from words use authored words only, each one escaped. Typed text is only ever the string being searched.

## Content

- Scenarios are about responding to incidents. They contain no working attack steps (authoring rule 11).
- All companies, people and events are fictional (authoring rule 10).
- Player text is not moderated beyond the length cap, because it is shown only to the player who typed it.

## Privacy

- No accounts, no email, no names.
- No analytics, no cookies, and no third-party scripts or fonts. Fonts are self-hosted.
- The page sets `referrer` to `no-referrer`.
- A session is kept in the tab's `sessionStorage` so a reload does not lose it. It is removed when the player leaves the session or closes the tab.

## Secrets rules for this repository

- No secret-shaped string in code, tests, fixtures or documents, including obviously fake ones. Tests that need one build it at runtime from parts.
- There is no `.env` file because nothing reads one. Env files stay ignored by git in case one is ever created.
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
