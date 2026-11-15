# UI design

## Direction

- **Object.** A duty officer's logbook on a desk at night. Every line has a time in the margin. The interface is a ruled page, not a dashboard of cards.
- **Type.** Archivo for the interface, Source Serif 4 for anything published (press items, the status page, the debrief narrative), IBM Plex Mono for times, numbers and system names. All self-hosted through Fontsource.
- **Colour.** Warm paper, near-black ink, one grey-brown for secondary text, one burnt amber used only for things that need the player now. No second accent, no status rainbow.
- **Geometry.** Square corners, 2 px at most on inputs. Hairline rules and a margin line carry the structure. No shadows, no cards, no pills.
- **Signature.** The page browns out. As the incident gets worse the paper tone drops through three steps, the way a room dims when the voltage sags. It returns when the incident recovers.

This list is repeated at the top of the M3 pull request before any component is built.

## Palette

| Token | Hex | Use |
|---|---|---|
| `paper-0` | `#F2EDE3` | Page background, normal |
| `paper-1` | `#E9E2D4` | Page background, severity 1 |
| `paper-2` | `#DDD3C0` | Page background, severity 2 |
| `ink` | `#1B1A17` | Body text, primary button fill |
| `ink-2` | `#575248` | Secondary text, timestamps |
| `signal` | `#8A3C05` | Unanswered markers, due commitments, the alert rule |
| `edge` | `#7A7363` | Borders of inputs and buttons |
| `rule` | `#B9B09E` | Decorative ruled lines only |

Contrast ratios, computed with the WCAG formula on 2026-11-15:

| Foreground | on `paper-0` | on `paper-1` | on `paper-2` |
|---|---|---|---|
| `ink` | 14.91 | 13.50 | 11.73 |
| `ink-2` | 6.65 | 6.02 | 5.23 |
| `signal` | 6.59 | 5.97 | 5.19 |
| `edge` (needs 3.0 as a control boundary) | 4.04 | 3.65 | 3.17 |
| `rule` (decorative, no requirement) | 1.84 | 1.67 | 1.45 |

All text colours pass AA for normal text on all three paper tones. Re-measure in the browser at M3; the numbers above are from the hex values, not from rendered pixels.

There is no dark theme in version 1.

## Severity and the brownout

| Level | Paper | When |
|---|---|---|
| 0 | `paper-0` | Before the incident, after recovery, debrief |
| 1 | `paper-1` | Incident running |
| 2 | `paper-2` | Customers affected above the scenario's "severe" line, or after a harmful mitigation |

The change is a 600 ms background transition. With `prefers-reduced-motion` it is instant. Severity is also stated in words on the board, so the colour is never the only signal.

## Type scale

| Role | Face | Size / line height |
|---|---|---|
| Log and message body | Archivo 400 | 15 / 22 |
| Labels, buttons | Archivo 600, small caps tracking on labels | 12 / 16 |
| Timestamps, numbers, system names | IBM Plex Mono 400 | 13 / 22 |
| Board figures | IBM Plex Mono 500 | 28 / 32 |
| Press headline | Source Serif 4 600 | 20 / 26 |
| Press and debrief body | Source Serif 4 400 | 16 / 25 |

Numbers use tabular figures everywhere so a changing value does not shift the layout.

## Layout, desktop

Three unequal columns on one ruled page. The log is the widest because it is where the player works.

```
+------------+---------------------------------------+----------------------+
| BOARD      | LOG                                   | INBOX                |
| 232 px     | flexible, min 480 px                  | 360 px               |
|            |                                       |                      |
| 02:31      | 02:14 | ALERT  Attach failures ...    | CTO  R. Villareal  * |
| T+17       | 02:14 | YOU    Check last night's ... | Support  J. Antolin  |
|            | 02:19 | MIKA   The 23:40 deploy ...   | Counsel  P. Nair   * |
| auth-core  | 02:21 | YOU    Pull auth-core logs    | Press                |
|  DEGRADED  |       |        running, 3 min left    |                      |
| billing    |       |                               | --- open thread ---  |
|  DEGRADED  |                                       | 02:17 What's the ETA |
|            |                                       | 02:20 > No ETA yet.. |
| 184,000    |                                       |   due 02:30          |
| affected   |---------------------------------------|                      |
| 1,227      | What do you do?                       | [ reply            ] |
| tickets    | [                               ] Act |                      |
+------------+---------------------------------------+----------------------+
```

- A single vertical margin line runs down the log after the time column, as in a paper logbook.
- The asterisk in the sketch is the `signal` marker for an unanswered message.
- The decision box is fixed to the bottom of the log column.
- The board does not scroll.

## Layout, mobile (under 768 px)

Designed as its own layout, not a squeezed desktop.

- One column. A three-part switch at the bottom: Log, Inbox, Board. Inbox shows a count of unanswered messages.
- The clock, customers affected and the running task stay in a two-line strip at the top on every view.
- The decision box is docked above the switch on the Log view. The reply box is docked on an open thread.
- Opening a thread is a full-screen view with a back control.
- Touch targets are at least 44 px.

## Screens

| Screen | Contents |
|---|---|
| Start | What BrownOut is in two sentences, the scenario list, mode notice if replay only |
| Briefing | Role, situation, what you can do, Start button |
| Play | Board, log, inbox |
| Debrief | See scoring-and-debrief.md |
| Replay | Play screen, read-only, with step and play controls |

## States

Every one of these is designed and has a screenshot in the M3 evidence.

| Element | States |
|---|---|
| Decision box | empty, typing, over the character limit, sending, disabled while a turn runs, disabled after the session ends |
| Buttons | default, hover, focus-visible, active, disabled |
| Log entry | player action, action being read, task running with time left, task queued, task cancelled, result, alert, not understood |
| Thread in list | read, unanswered, unanswered past patience, has a commitment due soon |
| Message | arriving, delivered, quoted player text |
| Board figure | known, unknown (shown as a dash with the word "unknown"), rising, falling |
| Whole page | loading, live, paused, turn in progress, connection lost, session expired, live play unavailable, budget reached |
| Lists | empty inbox at the start, empty log before the first action |

While a turn runs, the log shows the action immediately with "reading…" under it, then the restatement, then the result. The player is never looking at an unchanged screen.

## Accessibility

- Every control reachable and operable by keyboard. Visible focus ring: 2 px `ink`, offset 2 px.
- Shortcuts: `/` focuses the decision box, `g` then `i` opens the inbox, `Esc` closes a thread, `Space` on the page toggles pause when no field is focused. Listed on a help panel.
- New messages and alerts are announced through a polite live region. Alerts of severity change use an assertive one.
- The idle clock can be paused, and the pause control is the first focusable item on the play screen.
- Nothing relies on colour alone. Unanswered has a marker and the word.

## Copy

- Plain and specific. "Live play is off: no API key on this server." Not "Something went wrong."
- No exclamation marks, no emoji, no mascots.
- Buttons say what they do: Act, Reply, Wait, Pause, End incident, Export session.
- The interface never comments on the player's choices during play. Judgement belongs to the stakeholders and the debrief.
- No invented testimonials, logos or usage numbers on the start screen.

## Not allowed

Gradients, glass effects, drop shadows, rounded cards, pill badges, icon fonts, emoji as icons, a system font as the main face, a dark theme by default, animated backgrounds.

## Verification

Before M3 is called done: headless-browser screenshots of every screen at 1440, 768 and 375 px wide, at each severity level, saved under `testresults/dod/m3/`.
