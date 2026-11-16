# UI design

The play screen is a 3D war room. You sit at a desk in an operations room at night, and the things in the room are the interface: the wall board, the logbook, the phone, the television.

## Direction

- **Object.** A card-stock model of an operations room. It looks built from paper and ink: flat tones, drawn edges, matte surfaces. Not a photoreal office and not a game level.
- **Type.** Archivo for the interface, Source Serif 4 for anything published (press items, the debrief), IBM Plex Mono for times, numbers and system names. All self-hosted through Fontsource.
- **Colour.** Warm paper, near-black ink, one grey-brown, one burnt amber for things that need you now. The room uses the same tokens as the panels.
- **Geometry.** Square corners and hairline rules in the panels. Boxes, planes and cylinders in the room, with inked edges. No shadows in the panels, no bloom or neon in the room.
- **Signature.** The room browns out. As the incident gets worse the ceiling lights sag and the amber emergency strip comes on, while the screens keep glowing. It returns when the incident recovers.

This list is repeated at the top of the M3 pull request before anything is built.

## Two layers

The design separates what must be atmospheric from what must be readable.

| Layer | Made of | Job |
|---|---|---|
| Room | WebGL scene | Where things are, what needs attention, how bad it is |
| Panels | Ordinary HTML | Everything the player reads at length or types into |

Long text is never drawn inside the 3D scene. When the player looks at the phone, the camera moves to the phone and the conversation opens as an HTML panel beside it. This keeps text sharp, selectable, zoomable and available to screen readers, and it means typing behaves like typing everywhere else.

Short text that belongs to an object is drawn in the scene: the wall clock, the figures on the wall board, the television headline.

## The room

Top view. The player does not walk; the camera moves between fixed stations.

```
                      back wall
  +--------------------------------------------------+
  |   [  WALL BOARD  ]   (clock)        [   TV   ]   |
  |                                                  |
  |                                   Mika's desk    |
  |                                   [monitor][lamp]|
  |                                                  |
  |        +--------------------------------+        |
  |        | logbook   desk monitor   phone |        |
  |        +--------------------------------+        |
  |                     (you)                        |
  +--------------------------------------------------+
        ceiling: two light panels, one amber strip
```

### Objects

| Object | Shows | Signal that it needs you |
|---|---|---|
| Wall clock | Sim time | Hands move while the clock runs and stop when paused |
| Wall board | System status tiles, customers affected, tickets open | A figure that changed is underlined in `signal` for a few seconds |
| Logbook | The duty log | A new line is written in |
| Desk monitor | The list of message threads | An amber count of unanswered messages |
| Phone | The thread that most recently messaged | Screen lights, short buzz, amber lamp stays on while unanswered |
| Television | Press | Off until the first story. Then on, with the headline |
| Mika's desk lamp | The running task | On while a task runs, off when idle |
| Ceiling panels | Severity | Brightness, see below |
| Emergency strip | Severity 2 | On |

People are not modelled. Stakeholders exist as the devices they reach you through, and Mika as a lit desk across the room (L-08).

### Stations

| Key | Station | Camera | Panel opened |
|---|---|---|---|
| 1 | Desk | Wide: desk, wall board and television in one frame | None |
| 2 | Log | Close on the logbook | Log |
| 3 | Inbox | Close on the phone and desk monitor | Inbox and the open thread |
| 4 | Board | Close on the wall board | Board details |
| 5 | Press | Close on the television | Press threads (DL-38) |

- Clicking or tapping an object goes to its station. `Esc` returns to the desk.
- The five stations are also a row of buttons under the decision box, at every width (DL-39).
- A camera move takes 500 ms with easing. There is no free movement and no walking.
- At the desk station the camera follows the pointer by at most two degrees, for depth.
- **The decision box is always on screen**, docked at the bottom, at every station. So is a status strip with the clock, customers affected and the unanswered count. The player can act without moving the camera.

### Light and the brownout

| Level | Ceiling panels | Emergency strip | When |
|---|---|---|---|
| 0 | 100 percent, warm white | Off | Before the incident, after recovery |
| 1 | 70 percent | Off | Incident running |
| 2 | 45 percent | On, amber | Customers affected above the scenario's "severe" line, or after a harmful mitigation |

- The room is lit at level 0. It is not a dark scene by default; it gets dark because of what happens.
- Screens, the wall board and the television are self-lit and keep full brightness at every level. They are the readable things, and they stand out more as the room dims.
- A level change is a 600 ms fade with at most two brief dips. Never more than two flashes in a second, to stay inside the WCAG flash limit.
- Severity is also written on the wall board and in the status strip. Light is never the only signal.

### How the room is drawn

| Aspect | Choice |
|---|---|
| Library | three.js through React Three Fiber, with no helper library on top (DL-35) |
| Geometry | Built in code from simple shapes. No downloaded model packs (DL-20). Repeated items are instanced. |
| Shading | Toon shading in three tone steps. Surfaces are matte. |
| Edges | Inked outlines on the main objects, in `ink` |
| Lights | One ambient, one ceiling light driven by severity, one amber light for the strip |
| Shadows | No real-time shadows. Contact shadows are flat dark shapes, like a card model. |
| Effects | No post-processing in version 1 |
| In-scene text | Drawn on a 2D canvas in the project fonts and used as a texture (DL-36), for the clock, the wall board, the television headline, the count on the desk monitor and the name on the phone only |
| Camera | Perspective, 40 degree field of view for a model-like look |
| Rendering | On demand: a frame is drawn only when something changes |
| Pixel ratio | Capped at 2 on desktop and 1.5 on phones |

Settled at the stage B spike: the usual in-scene text helper starts a worker from a blob URL and fetches the font file itself, and the content security policy allows neither. Text is drawn on a canvas instead, in the fonts the page has already loaded, and the policy is unchanged (DL-36, security-overview.md).

## Palette

| Token | Hex | Panels | Room |
|---|---|---|---|
| `paper-0` | `#F2EDE3` | Panel background | Walls, screens, wall board face |
| `paper-1` | `#E9E2D4` | Raised or selected rows | Desk tops |
| `paper-2` | `#DDD3C0` | Panel background at severity 2 | Floor |
| `ink` | `#1B1A17` | Body text, primary button | Outlines, in-scene text |
| `ink-2` | `#575248` | Secondary text, timestamps | Furniture bodies |
| `signal` | `#8A3C05` | Unanswered, due commitments | Lamps, emergency strip, changed figures |
| `edge` | `#7A7363` | Input and button borders | Not used |
| `rule` | `#B9B09E` | Decorative ruled lines | Floor and wall seams |

Contrast ratios for panel text, computed with the WCAG formula on 2026-11-15:

| Foreground | on `paper-0` | on `paper-1` | on `paper-2` |
|---|---|---|---|
| `ink` | 14.91 | 13.50 | 11.73 |
| `ink-2` | 6.65 | 6.02 | 5.23 |
| `signal` | 6.59 | 5.97 | 5.19 |
| `edge` (needs 3.0 as a control boundary) | 4.04 | 3.65 | 3.17 |
| `rule` (decorative, no requirement) | 1.84 | 1.67 | 1.45 |

All panel text passes AA on all three paper tones. In-scene text is `ink` on a self-lit `paper-0` surface, so its contrast does not change with the room light. Re-measure both in the browser at M3; the numbers above come from the hex values, not from rendered pixels.

Measured at M3 stage A (2026-11-16): the automated scan's colour-contrast rule, which reads rendered colours, passes on every screen and state the browser tests visit in flat view, including the page at severity 2. The result is in `testresults/dod/m3a/accessibility.txt`. In-scene text is measured in stage B.

## Type scale

| Role | Face | Size / line height |
|---|---|---|
| Log and message body | Archivo 400 | 15 / 22 |
| Labels, buttons | Archivo 600 | 12 / 16 |
| Timestamps, numbers, system names | IBM Plex Mono 400 | 13 / 22 |
| Status strip figures | IBM Plex Mono 500 | 20 / 24 |
| Press headline | Source Serif 4 600 | 20 / 26 |
| Press and debrief body | Source Serif 4 400 | 16 / 25 |
| Wall board figures, in scene | IBM Plex Mono 500 | Sized to read from the desk station |

Numbers use tabular figures so a changing value does not shift the layout.

## Panels

Panels keep the duty-logbook look: a ruled page, a time in the margin of every line, square corners.

```
+----------------------------------------------+
| LOG                                    close |
|----------------------------------------------|
| 02:14 | ALERT  Attach failures in two ...    |
| 02:14 | YOU    Check last night's deploy     |
| 02:19 | MIKA   The 23:40 deploy changed ...  |
| 02:21 | YOU    Pull auth-core logs           |
|       |        running, 3 min left           |
+----------------------------------------------+
```

- A panel opens beside its object and leaves the object visible. Maximum width 560 px on desktop.
- One panel is open at a time, plus the docked decision box and status strip.
- A single vertical margin line runs after the time column, as in a paper logbook.

## Flat view

The whole game is also playable without the 3D room. Flat view lays the same panels out as one ruled page in three columns: board, log, inbox.

- The status strip runs across the top and the decision box is docked across the bottom, under all three columns (DL-30).
- The press is a group at the foot of the inbox, set in the serif face (DL-31).
- Under 1024 px the columns become three tabs, Log, Inbox and Board, above the browser's edge and below the decision box. The Inbox tab carries the unanswered count.
- At severity 2 the page turns to `paper-2` and the rule under the status strip turns to `signal`. The board also says "Severe" in words.

Flat view is used when:

- the player chooses it (the switch is the first focusable control on the play screen),
- the browser has no WebGL 2,
- the graphics context is lost and cannot be restored,
- the frame rate stays under 24 for five seconds, in which case the player is offered it, not switched silently.

Flat view is not a degraded mode. Every feature, state and shortcut works in it, and the automated browser tests run against it (testing-strategy.md).

## Phones (under 768 px)

Designed on its own terms.

- Portrait. The room fills the top 45 percent of the screen, framed tighter. The panel for the current station fills the rest as a sheet. At the desk station, which has no panel of its own, the sheet is the log (DL-40).
- Swipe left and right on the room, or use the five station buttons, to change station.
- The status strip is at the top. The decision box is docked at the bottom above the keyboard.
- Fewer objects are drawn: no pointer parallax, no instanced clutter, pixel ratio capped at 1.5.
- Touch targets are at least 44 px. In-scene objects have enlarged hit areas.
- A phone that cannot hold 30 frames a second is offered flat view.

## Screens

| Screen | Rendered as | Contents |
|---|---|---|
| Start | HTML | What BrownOut is in two sentences, the list of situations, and "Watch a session": the bundled sample, and a button to open a saved session file. A file that is refused gets one sentence saying why, in the signal colour. |
| Briefing | HTML, with the room loading behind it | Role, situation, what you can do, Start |
| Play | Room and panels, or flat view | See above |
| Debrief | HTML document | See scoring-and-debrief.md. The room is not shown; this is a report to read. The timeline is a line chart drawn in `ink` with a tick for each moment, `signal` for the ones that cost the player, and the same moments listed in words under it. |
| Replay | The play screen, in the room or in flat view, read-only (DL-47) | A note that this is a recording. In the dock, where the decision box would be: the step number, the move that led to this step in words, and five buttons: To the start, Back, Play or Stop, Forward, To the end. The pause, wait, cancel and end controls are not shown. `Left` and `Right` step, `Space` plays or stops. |

The 3D code is a separate chunk that loads while the player reads the briefing. The start screen does not wait for it.

## States

Every one of these is designed and has a screenshot in the M3 evidence.

| Element | States |
|---|---|
| Decision box | empty, typing, over the character limit, sending, disabled while a turn runs, disabled after the session ends |
| Buttons | default, hover, focus-visible, active, disabled |
| Log entry | player action, action being read, task running with time left, task queued, task cancelled, result, alert, not understood |
| Thread in list | read, unanswered, unanswered past patience, has a commitment due soon |
| Message | arriving, delivered, quoted player text |
| Board figure | known, unknown (a dash with the word "unknown"), rising, falling |
| Room object | idle, hovered, focused by keyboard, at its station, signalling, signalling past patience |
| Room | loading, level 0, level 1, level 2, paused, context lost |
| Whole page | loading, live, paused, turn in progress, connection lost, session expired, live play unavailable, budget reached, 3D unavailable |
| Lists | empty inbox at the start, empty log before the first action |

While a turn runs, the log shows the action at once with "reading…" under it, then the restatement, then the result. Mika's lamp comes on when a task starts. The player is never looking at an unchanged scene.

## Sound

Optional and off until the player presses "Turn sound on" in the status strip (DL-41). The same button turns it off.

| Sound | When |
|---|---|
| Phone buzz | A message arrives |
| Pager tone | An alert |
| Room hum, dropping in pitch | Severity rises |
| Soft click | A task finishes |

All sounds are generated in code with the Web Audio API. There are no audio files and no speech. Every sound has a visual equivalent, so muting loses no information.

## Performance targets

Targets to measure at M3, not measurements.

| Measure | Target |
|---|---|
| Frame rate, mid-range laptop with integrated graphics | 60 while the camera moves |
| Frame rate, mid-range phone | 30 or more |
| Triangles in view | Under 60,000 |
| Draw calls | Under 80 |
| 3D chunk, compressed | Under 300 KB |
| Idle cost | No frames drawn when nothing changes |
| Start screen | Interactive before the 3D chunk has loaded |

Measured at M3 stage B. The readings and how to read them are in `testresults/dod/m3b/frame-rates.txt`. What is still missing is limit L-13.

| Measure | Reading |
|---|---|
| Frame rate, laptop | 60 while the camera moves, on a laptop with a separate graphics card. Not yet read on integrated graphics. |
| Frame rate, phone | Not yet read on a phone. |
| Triangles in view | 514 at most |
| Draw calls | 57 at most |
| 3D chunk, compressed | 248 KB |
| Idle cost | No frames while nothing changes, held by a browser test |
| Start screen | Does not request the 3D chunk, held by a browser test |

## Accessibility

- Flat view gives a complete non-3D route through the game.
- Every station is also an HTML button in a visible row, in station order, so keyboard, screen-reader and touch users can reach each one without pointing at the scene (DL-39). Each button is described by the object it looks at. Focusing one outlines the object.
- The room itself is hidden from screen readers and replaced by one sentence that says what it shows: the light level, the clock, the phone, the television and Mika's lamp.
- Visible focus ring on panels: 2 px `ink`, offset 2 px. A focused room object gets a thicker outline.
- Shortcuts: `1` to `5` for stations, `/` focuses the decision box, `Esc` returns to the desk, `Space` toggles pause when no field is focused. Listed on a panel opened with the Keys button or `?`.
- New messages and alerts are announced through a polite live region. A severity change uses an assertive one.
- With `prefers-reduced-motion`: camera moves become cuts, the light change is instant, pointer parallax is off, lamps are steady and not pulsing.
- Nothing relies on colour, light or sound alone. Unanswered has a lamp, a marker and the word.
- The pause control is reachable at every station.

## Copy

- Plain and specific. "Live play is off: no API key on this server." Not "Something went wrong."
- No exclamation marks, no emoji, no mascots.
- Buttons say what they do: Act, Reply, Wait, Pause, End incident, Export session, Flat view, 3D view.
- The interface never comments on the player's choices during play. Judgement belongs to the stakeholders and the debrief.
- No invented testimonials, logos or usage numbers on the start screen.

## Not allowed

In panels: gradients, glass effects, drop shadows, rounded cards, pill badges, icon fonts, emoji as icons, a system font as the main face.

In the room: photoreal textures, downloaded asset packs, bloom, neon, lens flares, particle effects, modelled human characters, free camera movement, anything that animates when nothing has happened.

## Verification

Before M3 is called done:

- Screenshots of every station at each severity level, at 1440, 768 and 375 px wide, in 3D and in flat view, saved under `testresults/dod/m3a/` (flat view) and `testresults/dod/m3b/` (the room).
- A short screen recording of one level change and one message arriving: `testresults/dod/m3b/level-change-and-message.webm`.
- Frame-rate readings from the two reference devices, written into the evidence folder. At stage B one laptop was read; see the table under Performance targets.
