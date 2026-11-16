# Workflows

How work moves from an idea to `main`.

## Lifecycle

| Phase | What happens | Output |
|---|---|---|
| 1. Intake | Pick the next item from milestones.md | A short entry in `docs/07-process/backlog/` |
| 2. Ready | Acceptance criteria and affected documents are named | The entry is marked ready |
| 3. Build | Code and tests on a branch | Commits on the branch |
| 4. Commit gates | Pre-commit hook: secrets, lint, type-check, fast tests | A commit, or a refusal |
| 5. Review | Read the whole diff for correctness, injection, data exposure | Notes in `docs/10-reviews/` for milestone-sized work |
| 6. Pre-push audit | Pre-push hook: history secrets scan, static analysis, dependency audit, full tests | A push, or a refusal |
| 7. Push | One squashed commit per push | A pull request |
| 8. CI | The same checks on a clean machine, plus browser tests | Green or red |
| 9. Done check | Definition of done in testing-strategy.md | Evidence in `testresults/dod/` |
| 10. Merge | Squash-merge by the owner | `main` moves forward |

## Branches

- `main` is always releasable. No direct commits after the initial documentation commit.
- Work branches: `m<number>/<short-name>`, for example `m1/engine-clock`.
- One pull request per coherent piece of a milestone. Squash-merge only.

## Commits

- One commit per push. Squash local work before pushing.
- Message format: `type: summary` in the imperative, under 72 characters. Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`.
- The body says why, when it is not obvious.
- No trailers. The author of every commit is the repository owner.

## Hooks

Hooks live in `.githooks/` and are committed. After cloning:

```
git config core.hooksPath .githooks
```

| Hook | Runs |
|---|---|
| `pre-commit` | gitleaks on staged changes, tracked-file check (no env or key files, no local paths, no tool files), ESLint, type-check, tests |
| `pre-push` | gitleaks on the whole history, tracked-file check, commit-message check (no co-author trailers or tool banners), semgrep, `npm audit --omit=dev`, ESLint, type-check, tests, scenario validation |

The hooks call scripts in `tools/` so that CI runs exactly the same commands. A check that cannot run because a tool is missing fails with a message naming the tool. It does not pass silently.

Tool versions for gitleaks and semgrep are pinned in `tools/versions.json`, which both CI and `npm run tools:semgrep` read. ESLint runs with `--max-warnings 0`. GitHub Actions are pinned to commit SHAs.

Known dependency advisory at M0: one moderate, dev-only issue in the lint toolchain (`minimatch`, reached through `typescript-eslint`). Production dependencies have none. It is left alone because npm's suggested fix downgrades `typescript-eslint`; Dependabot will offer the upstream fix.

## Continuous integration

GitHub Actions, on every pull request and on `main`:

1. Install with `npm ci`.
2. Lint and type-check.
3. Unit, property, integration and scripted playthrough tests with coverage.
4. Scenario validation.
5. gitleaks and semgrep.
6. `npm audit --omit=dev`.
7. In a second job: build the site, then run the browser tests against the built files (`npm run e2e`).

There is no key and no model, so CI needs no secret.

## Evidence

```
testresults/dod/
  m0/  hooks-blocked-secret.txt  ci-run.txt
  m1/  tests.txt  coverage.txt  validator.txt  determinism.txt
  m2/  spike-latency-cost.md  accuracy.txt  guard-failures.txt
  m3a/ screens/  browser-tests.txt  accessibility.txt  tests.txt  coverage.txt  security.txt
  m3b/ screens/  level-change-and-message.webm  frame-rates.txt  browser-tests.txt
       accessibility.txt  tests.txt  coverage.txt  build.txt  security.txt
  m4/  screens/  sample-session.json  browser-tests.txt  accessibility.txt  tests.txt
       coverage.txt  build.txt  security.txt
  ...
```

`npm run evidence -- m4` runs the checks and writes the text files for a milestone, with the path of the checkout removed.

Evidence files are plain text or images produced by the tools, not written by hand.

## Run log

Each run of the hook and pipeline scripts appends one line to `run-log.jsonl` at the repository root: time, phase, what ran, result. The file is ignored by git.

## Documents

- A change that makes a document wrong fixes the document in the same pull request.
- A new decision gets a DL entry. A reversed decision gets a new entry that refers to the old one.
- Reviews in `docs/10-reviews/` are dated and never edited afterwards.

## Releasing the demo

At M6 only, and only on the owner's instruction:

1. Full-history secrets scan and a check of every tracked file for local paths and personal data.
2. Build and run the browser tests against the build.
3. Deploy with no secret configured.
4. Open the public URL and replay the bundled session end to end.
