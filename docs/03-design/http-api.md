# HTTP API

JSON over HTTP. Every request body and every response is validated with a zod schema from `src/shared`. All routes are under `/api`.

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | Run mode, whether live play is available, budget state |
| GET | `/api/scenarios` | List of scenarios with title and briefing |
| POST | `/api/sessions` | Start a session |
| GET | `/api/sessions/:id` | Current public state, for reload and reconnect |
| POST | `/api/sessions/:id/turns` | Submit a turn. Response is a stream. |
| GET | `/api/sessions/:id/debrief` | Score and written debrief, once the session has ended |
| GET | `/api/sessions/:id/export` | The session as a JSON file |
| POST | `/api/replays` | Load an exported session for replay |
| GET | `/healthz` | Liveness |

## Start a session

```
POST /api/sessions
{ "scenarioId": "dial-tone", "seed": 4821 }      seed is optional
```

```
201
{
  "sessionId": "…",
  "seed": 4821,
  "state": PublicState,
  "events": PublicEvent[]        the opening alert and briefing
}
```

## Submit a turn

```
POST /api/sessions/:id/turns
{ "type": "action", "text": "pull the auth-core logs" }
{ "type": "reply",  "threadId": "cto", "text": "No ETA yet. Update at 02:30." }
{ "type": "wait" }
{ "type": "tick", "minutes": 1 }
{ "type": "cancelTask" }
{ "type": "end" }
```

The response has content type `application/x-ndjson`: one JSON object per line, sent as each step finishes.

```
{"event":"intent","restatement":"Ask Mika to pull auth-core logs","confidence":"high"}
{"event":"resolved","state":PublicState,"events":PublicEvent[]}
{"event":"rendered","items":[{"requestId":"…","from":"engineer","channel":"log","body":"…"}]}
{"event":"done","status":"running"}
```

- `intent` is omitted for wait, tick, cancelTask and end.
- `rendered` is omitted when there is nothing to write.
- On failure after the stream has started: `{"event":"error","code":"…","message":"…"}` followed by `done`.

## Public state

The server never sends the whole engine state. `PublicState` contains only what the player is allowed to see:

- sim clock and minutes elapsed
- system statuses
- visible metrics
- the running and queued task
- threads with messages and unanswered flags
- open commitments
- session status

It never contains ground truth, unrevealed clues, trust values, claim truth, the list of investigations or mitigations, or the seed's effects.

## Errors

| Status | Code | When |
|---|---|---|
| 400 | `invalid_request` | Body fails validation, text over 600 characters |
| 404 | `not_found` | Unknown or expired session |
| 409 | `turn_in_progress` | A turn is already running for this session |
| 409 | `session_ended` | Turn submitted after the session ended |
| 429 | `rate_limited` | Limits in NFR-10 |
| 503 | `live_unavailable` | No key configured or daily budget reached |

Error bodies are `{ "code": "…", "message": "…" }`. Messages are written for the player. Stack traces and upstream error text are never returned.

## Limits

| Limit | Value |
|---|---|
| Request body | 4 KB, except `/api/replays` at 512 KB |
| Action or reply text | 600 characters |
| Turns | 10 per minute per session |
| New sessions | 5 per hour per address |
| Concurrent sessions held in memory | 200, oldest idle evicted first |
| Session lifetime | 2 hours after the last turn |
