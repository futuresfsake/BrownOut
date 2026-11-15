// The simulation. A pure function over state: resolve(scenario, state, input) returns a new state,
// the events of that turn and the text still to be written. It reads no clock, makes no network
// call and uses no global random source. See docs/03-design/simulation-engine.md.
import { clockAt } from "./clock.js";
import { evalMode } from "./curves.js";
import { jitter } from "./rng.js";
import type {
  Beat,
  Condition,
  Intent,
  Mitigation,
  ObligationState,
  Scenario,
  Stakeholder,
  Truth,
} from "./schema.js";
import type {
  Claim,
  EngineEvent,
  EngineInput,
  EventData,
  EventType,
  RenderRequest,
  Resolution,
  SessionState,
  Task,
} from "./state.js";

// Tuning constants. Kept together so the scenario's feel can be adjusted in one place.
export const TRUST = {
  replyInTime: 4,
  commitmentKept: 6,
  proactiveUpdate: 5,
  proactiveSpacing: 10,
  supportedClaim: 3,
  unansweredPerMinute: -1,
  commitmentBroken: -12,
  falseClaimSurfaced: -20,
} as const;

const NOTABLE: ReadonlySet<EventType> = new Set([
  "message",
  "alert",
  "task_completed",
  "obligation",
  "commitment_broken",
  "ended",
]);

interface Ctx {
  sc: Scenario;
  st: SessionState;
  events: EngineEvent[];
  requests: RenderRequest[];
}

// ---------------------------------------------------------------------------------------------
// Lookups

const stakeholderOf = (sc: Scenario, id: string): Stakeholder | undefined =>
  sc.stakeholders.find((s) => s.id === id);

const nameOf = (sc: Scenario, id: string): string => stakeholderOf(sc, id)?.name ?? id;

function latest(ctx: Ctx, metric: string): number {
  return ctx.st.series[metric]?.[ctx.st.minute] ?? 0;
}

export function clockOf(sc: Scenario, minute: number): string {
  return clockAt(sc.startClock, minute);
}

function emit(
  ctx: Ctx,
  type: EventType,
  text?: string,
  data?: EventData,
  minute = ctx.st.minute,
): EngineEvent {
  const event: EngineEvent = { id: `e${ctx.st.nextEventId++}`, minute, type, text, data };
  ctx.st.log.push(event);
  ctx.events.push(event);
  return event;
}

/** Fills {clock}, {quote}, {brokenDue} and any metric id in an authored text. */
function fill(ctx: Ctx, template: string, extras: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (Object.hasOwn(extras, key)) return extras[key] ?? whole;
    if (key === "clock") return clockOf(ctx.sc, ctx.st.minute);
    if (ctx.sc.metrics.some((m) => m.id === key)) return latest(ctx, key).toLocaleString("en-US");
    return whole;
  });
}

// ---------------------------------------------------------------------------------------------
// Conditions

function statementTruth(sc: Scenario, topicId: string, minute: number): boolean {
  const topic = sc.claimTopics.find((t) => t.id === topicId);
  if (!topic) return false;
  return topic.trueFromMinute === undefined ? topic.statementTrue : minute >= topic.trueFromMinute;
}

function satisfiedMinute(ctx: Ctx, id: string): number | undefined {
  const ob = ctx.sc.obligations.find((o) => o.id === id);
  if (!ob) return undefined;
  const sends = ctx.st.directivesSent.filter((d) => d.id === ob.satisfiedBy.directive);
  const { toAll, toAny } = ob.satisfiedBy;
  if (toAll) {
    let done = 0;
    for (const who of toAll) {
      const first = Math.min(...sends.filter((d) => d.to.includes(who)).map((d) => d.minute));
      if (!Number.isFinite(first)) return undefined;
      done = Math.max(done, first);
    }
    return done;
  }
  const matching = toAny ? sends.filter((d) => d.to.some((w) => toAny.includes(w))) : sends;
  if (matching.length === 0) return undefined;
  return Math.min(...matching.map((d) => d.minute));
}

export function obligationState(sc: Scenario, st: SessionState, id: string): ObligationState {
  const ob = sc.obligations.find((o) => o.id === id);
  const triggeredAt = st.obligations[id]?.triggeredAt;
  if (!ob || triggeredAt === undefined) return "dormant";
  const deadline = triggeredAt + ob.withinMinutes;
  const ctx: Ctx = { sc, st, events: [], requests: [] };
  const done = satisfiedMinute(ctx, id);
  if (done !== undefined) return done <= deadline ? "met" : "late";
  return st.minute > deadline ? "missed" : "open";
}

function evalCondition(ctx: Ctx, c: Condition): boolean {
  const { st } = ctx;
  switch (c.type) {
    case "clue":
      return st.revealedClues.includes(c.id);
    case "mitigation":
      return st.appliedMitigations.some((m) => m.id === c.id);
    case "investigation":
      return st.completedInvestigations.some((i) => i.id === c.id);
    case "metricAbove":
      return latest(ctx, c.id) > c.value;
    case "metricBelow":
      return latest(ctx, c.id) < c.value;
    case "minuteAtLeast":
      return st.minute >= c.value;
    case "claim":
      return st.claims.some(
        (k) =>
          k.topic === c.topic &&
          (c.stance === undefined || k.stance === c.stance) &&
          (c.truth === undefined || k.truth === c.truth) &&
          (c.supported === undefined || k.supported === c.supported) &&
          (c.to === undefined || k.audience.includes(c.to)),
      );
    case "trustBelow":
      return (st.trust[c.who] ?? 0) < c.value;
    case "beatFired":
      return st.firedBeats.includes(c.id);
    case "commitmentBroken":
      return st.commitments.some(
        (k) => k.status === "broken" && (c.to === undefined || k.to === c.to),
      );
    case "directiveSent":
      return st.directivesSent.some(
        (d) => d.id === c.id && (c.to === undefined || d.to.includes(c.to)),
      );
    case "unanswered":
      return st.threads[c.who]?.unansweredSince !== undefined;
    case "obligation":
      return obligationState(ctx.sc, st, c.id) === c.state;
    case "all":
      return c.of.every((x) => evalCondition(ctx, x));
    case "any":
      return c.of.some((x) => evalCondition(ctx, x));
    case "not":
      return !evalCondition(ctx, c.of);
  }
}

// ---------------------------------------------------------------------------------------------
// Trust, claims, commitments

function addTrust(ctx: Ctx, who: string, delta: number, reason: string, silent = false): void {
  const before = ctx.st.trust[who];
  if (before === undefined || delta === 0) return;
  const after = Math.max(0, Math.min(100, before + delta));
  ctx.st.trust[who] = after;
  if (!silent && after !== before) {
    emit(ctx, "trust", `${nameOf(ctx.sc, who)}: trust ${delta > 0 ? "up" : "down"} (${reason})`, {
      who,
      delta: after - before,
      reason,
    });
  }
}

function claimIsSupported(ctx: Ctx, topicId: string, stance: Claim["stance"]): boolean {
  if (stance === "uncertain") return true;
  const topic = ctx.sc.claimTopics.find((t) => t.id === topicId);
  if (!topic) return false;
  const clues = stance === "asserts" ? topic.supportsAsserts : topic.supportsDenies;
  return clues.some((c) => ctx.st.revealedClues.includes(c));
}

function recordClaim(
  ctx: Ctx,
  audience: string[],
  raw: { topic: string; stance: Claim["stance"]; text: string },
) {
  const { sc, st } = ctx;
  if (!sc.claimTopics.some((t) => t.id === raw.topic)) return;
  const statement = statementTruth(sc, raw.topic, st.minute);
  const truth: Truth =
    raw.stance === "uncertain"
      ? "unknowable"
      : (raw.stance === "asserts") === statement
        ? "true"
        : "false";
  // A new statement on a topic corrects any earlier, different one that was not yet exposed.
  for (const earlier of st.claims) {
    const overlap = earlier.audience.some((a) => audience.includes(a));
    if (
      earlier.topic === raw.topic &&
      overlap &&
      earlier.stance !== raw.stance &&
      !earlier.surfaced &&
      !earlier.corrected
    ) {
      earlier.corrected = true;
      emit(ctx, "claim_corrected", `You corrected an earlier statement on "${raw.topic}".`, {
        claimId: earlier.id,
      });
    }
  }
  const supported = claimIsSupported(ctx, raw.topic, raw.stance);
  const event = emit(ctx, "claim", `You said: "${raw.text}"`, {
    topic: raw.topic,
    stance: raw.stance,
    truth,
    supported,
    to: audience,
  });
  st.claims.push({
    id: `c${st.claims.length + 1}`,
    topic: raw.topic,
    stance: raw.stance,
    audience: [...audience],
    text: raw.text,
    madeAtMinute: st.minute,
    truth,
    supported,
    surfaced: false,
    corrected: false,
    eventId: event.id,
  });
  if (truth === "true" && supported && raw.stance !== "uncertain") {
    for (const who of audience) addTrust(ctx, who, TRUST.supportedClaim, "accurate statement");
  }
}

function surfaceClaims(ctx: Ctx): void {
  for (const claim of ctx.st.claims) {
    if (claim.truth !== "false" || claim.surfaced || claim.corrected) continue;
    const topic = ctx.sc.claimTopics.find((t) => t.id === claim.topic);
    if (!topic?.surfacesWhen || !evalCondition(ctx, topic.surfacesWhen)) continue;
    claim.surfaced = true;
    emit(ctx, "claim_surfaced", `Your statement "${claim.text}" turned out to be wrong.`, {
      claimId: claim.id,
    });
    for (const who of claim.audience) {
      addTrust(ctx, who, TRUST.falseClaimSurfaced, "a false statement came to light");
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Metrics and modes

function switchMode(ctx: Ctx, name: string): void {
  const { sc, st } = ctx;
  st.mode = { name, startMinute: st.minute, startValue: latest(ctx, sc.driverMetric) };
}

function updateMetrics(ctx: Ctx): void {
  const { sc, st } = ctx;
  const t = st.minute;
  for (const metric of sc.metrics) {
    let value: number;
    if (metric.id === sc.driverMetric) {
      value = evalMode(sc.modes, st.mode.name, t, {
        minute: st.mode.startMinute,
        value: st.mode.startValue,
      });
    } else if (metric.derive?.kind === "delayedDivide") {
      const source = st.series[metric.derive.from] ?? [];
      value = (source[Math.max(0, t - metric.derive.delayMinutes)] ?? 0) / metric.derive.divisor;
    } else if (metric.derive?.kind === "saturating") {
      const c = (st.series[metric.derive.from] ?? [])[t] ?? 0;
      value = 100 * (1 - c / (c + metric.derive.k));
    } else {
      value = 0;
    }
    const series = (st.series[metric.id] ??= []);
    series[t] = Math.round(value);
  }
}

function updateVisibility(ctx: Ctx): void {
  for (const metric of ctx.sc.metrics) {
    if (ctx.st.visibleMetrics.includes(metric.id)) continue;
    if (metric.visibleWhen === null || evalCondition(ctx, metric.visibleWhen)) {
      ctx.st.visibleMetrics.push(metric.id);
    }
  }
}

/** 0 before and after the incident, 1 while it runs, 2 when it is severe. */
export function severityLevel(sc: Scenario, st: SessionState): 0 | 1 | 2 {
  const value = st.series[sc.driverMetric]?.[st.minute] ?? 0;
  if (value >= sc.severeAbove) return 2;
  return value >= 1000 && st.status === "running" ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Messages and beats

function deliver(
  ctx: Ctx,
  from: string,
  channel: RenderRequest["channel"],
  text: string,
  purpose: string,
  facts: string[],
  beatId?: string,
  quote?: string,
): void {
  const { sc, st } = ctx;
  const stakeholder = stakeholderOf(sc, from);
  const isAlert = from === "system" || channel === "log";
  const event = emit(ctx, isAlert ? "alert" : "message", text, {
    from,
    channel,
    ...(beatId ? { beatId } : {}),
  });
  if (!isAlert) {
    const thread = (st.threads[from] ??= { messages: [] });
    thread.messages.push({ minute: st.minute, from, text, beatId });
    if (stakeholder && stakeholder.patienceMinutes > 0 && thread.unansweredSince === undefined) {
      thread.unansweredSince = st.minute;
      st.replyStats.episodes += 1;
    }
  }
  ctx.requests.push({
    id: event.id,
    kind: isAlert ? "alert" : "message",
    from,
    channel,
    purpose,
    facts,
    quote,
    fallbackText: text,
  });
}

function fireBeat(ctx: Ctx, beat: Beat): void {
  const { st } = ctx;
  st.firedBeats.push(beat.id);
  const extras: Record<string, string> = {};
  let quote: string | undefined;
  if (beat.quotesClaim) {
    const claim = [...st.claims].reverse().find((k) => k.topic === beat.quotesClaim);
    if (claim) {
      quote = claim.text;
      extras.quote = claim.text;
    }
  }
  const broken = [...st.commitments].reverse().find((k) => k.status === "broken");
  if (broken && broken.dueMinute !== null) extras.brokenDue = clockOf(ctx.sc, broken.dueMinute);
  const text = fill(ctx, beat.fallbackText, extras);
  const facts = beat.facts.map((f) => fill(ctx, f, extras));
  deliver(ctx, beat.from, beat.channel, text, beat.purpose, facts, beat.id, quote);
}

function processBeats(ctx: Ctx): void {
  const { sc, st } = ctx;
  for (const beat of sc.beats) {
    if (st.firedBeats.includes(beat.id) || st.skippedBeats.includes(beat.id)) continue;
    let due: boolean;
    if ("atMinute" in beat.when) {
      due = st.minute >= Math.max(0, beat.when.atMinute + (st.beatOffsets[beat.id] ?? 0));
    } else {
      if (st.beatPending[beat.id] === undefined && evalCondition(ctx, beat.when.condition)) {
        st.beatPending[beat.id] = st.minute;
      }
      const pending = st.beatPending[beat.id];
      due = pending !== undefined && st.minute >= pending + (beat.when.delayMinutes ?? 0);
    }
    if (!due) continue;
    if (beat.unless && evalCondition(ctx, beat.unless)) {
      st.skippedBeats.push(beat.id);
      continue;
    }
    fireBeat(ctx, beat);
  }
}

// ---------------------------------------------------------------------------------------------
// Obligations and endings

function processObligations(ctx: Ctx): void {
  const { sc, st } = ctx;
  for (const ob of sc.obligations) {
    const record = (st.obligations[ob.id] ??= { lastState: "dormant" });
    if (record.triggeredAt === undefined && evalCondition(ctx, ob.trigger)) {
      record.triggeredAt = st.minute;
    }
    const state = obligationState(sc, st, ob.id);
    if (state !== record.lastState) {
      record.lastState = state;
      if (state !== "dormant") {
        emit(ctx, "obligation", `Duty - ${ob.label}: ${state}`, { id: ob.id, state });
      }
    }
  }
}

function endSession(
  ctx: Ctx,
  status: Exclude<SessionState["status"], "running">,
  text: string,
): void {
  ctx.st.status = status;
  emit(ctx, "ended", text, { status });
}

function checkEnding(ctx: Ctx): void {
  const { sc, st } = ctx;
  if (st.status !== "running") return;
  if (evalCondition(ctx, sc.endings.resolvedWhen)) {
    endSession(ctx, "resolved", "The incident is resolved.");
  } else if ((st.trust.cto ?? 100) < sc.endings.ctoTrustFloor) {
    endSession(ctx, "relieved", "The CTO has taken over the incident.");
  } else if (st.minute >= sc.lengthMinutes) {
    endSession(ctx, "timeout", "Time is up.");
  }
}

// ---------------------------------------------------------------------------------------------
// Tasks

function startTask(ctx: Ctx, kind: Task["kind"], id: string, startMinute: number): void {
  const { sc, st } = ctx;
  const spec:
    { label: string; durationMinutes: number; onStart?: { mode: string } | undefined } | undefined =
    kind === "investigate"
      ? sc.investigations.find((i) => i.id === id)
      : sc.mitigations.find((m) => m.id === id);
  if (!spec) return;
  st.task = {
    kind,
    id,
    startMinute,
    endMinute: startMinute + spec.durationMinutes,
    priorMode: { ...st.mode },
  };
  if (spec.onStart) switchMode(ctx, spec.onStart.mode);
  emit(ctx, "task_started", `Mika: on it - ${spec.label}.`, {
    kind,
    id,
    endsAt: clockOf(sc, st.task.endMinute),
  });
}

function applyMitigation(ctx: Ctx, m: Mitigation): void {
  const { st } = ctx;
  if (m.onComplete.mode) switchMode(ctx, m.onComplete.mode);
  for (const [system, status] of Object.entries(m.onComplete.systems ?? {})) {
    if (Object.hasOwn(st.systems, system)) st.systems[system] = status;
  }
  st.appliedMitigations.push({ id: m.id, minute: st.minute });
  emit(ctx, "mitigation_applied", undefined, { id: m.id, kind: m.kind });
}

function completeTask(ctx: Ctx): void {
  const { sc, st } = ctx;
  const task = st.task;
  if (!task || st.minute < task.endMinute) return;
  st.task = null;
  let text = "";
  let purpose = "";
  let facts: string[] = [];
  if (task.kind === "investigate") {
    const inv = sc.investigations.find((i) => i.id === task.id);
    if (inv) {
      st.completedInvestigations.push({ id: inv.id, minute: st.minute });
      const ok = !inv.revealsWhen || evalCondition(ctx, inv.revealsWhen);
      text = ok ? inv.resultText : (inv.notYetText ?? "Nothing new yet.");
      purpose = inv.resultPurpose;
      if (ok) {
        for (const clueId of inv.reveals) {
          if (st.revealedClues.includes(clueId)) continue;
          st.revealedClues.push(clueId);
          emit(ctx, "clue_revealed", undefined, { id: clueId });
        }
        const clueFacts = inv.reveals
          .map((c) => sc.clues.find((k) => k.id === c)?.fact)
          .filter((f): f is string => f !== undefined);
        facts = [...clueFacts, ...(inv.facts ?? [])];
      }
    }
  } else {
    const m = sc.mitigations.find((x) => x.id === task.id);
    if (m) {
      applyMitigation(ctx, m);
      text = m.resultText;
      purpose = m.resultPurpose;
      facts = m.facts ?? [];
    }
  }
  text = fill(ctx, text);
  const event = emit(ctx, "task_completed", text, { kind: task.kind, id: task.id });
  const thread = (st.threads.engineer ??= { messages: [] });
  thread.messages.push({ minute: st.minute, from: "engineer", text });
  ctx.requests.push({
    id: event.id,
    kind: "taskResult",
    from: "engineer",
    channel: "log",
    purpose,
    facts: facts.map((f) => fill(ctx, f)),
    fallbackText: text,
  });
  if (st.queuedTask) {
    const next = st.queuedTask;
    st.queuedTask = null;
    startTask(ctx, next.kind, next.id, task.endMinute);
  }
}

// ---------------------------------------------------------------------------------------------
// Time

function dueCommitments(ctx: Ctx): void {
  for (const c of ctx.st.commitments) {
    if (c.status === "open" && c.dueMinute !== null && ctx.st.minute > c.dueMinute) {
      c.status = "broken";
      emit(
        ctx,
        "commitment_broken",
        `You did not keep your word to ${nameOf(ctx.sc, c.to)}: ${c.what}`,
        {
          id: c.id,
          to: c.to,
        },
      );
      addTrust(ctx, c.to, TRUST.commitmentBroken, "a promise was broken");
    }
  }
}

function unansweredDecay(ctx: Ctx): void {
  const { sc, st } = ctx;
  for (const s of sc.stakeholders) {
    const since = st.threads[s.id]?.unansweredSince;
    if (since !== undefined && s.patienceMinutes > 0 && st.minute - since > s.patienceMinutes) {
      addTrust(ctx, s.id, TRUST.unansweredPerMinute, "message left unanswered", true);
    }
  }
}

/** Settles everything that depends on the current minute, in the order the design specifies. */
function settle(ctx: Ctx): void {
  updateVisibility(ctx);
  surfaceClaims(ctx);
  processBeats(ctx);
  updateVisibility(ctx);
  processObligations(ctx);
  checkEnding(ctx);
}

function advanceOneMinute(ctx: Ctx): void {
  ctx.st.minute += 1;
  updateMetrics(ctx);
  completeTask(ctx);
  dueCommitments(ctx);
  unansweredDecay(ctx);
  settle(ctx);
}

function advance(ctx: Ctx, minutes: number): void {
  for (let i = 0; i < minutes && ctx.st.status === "running"; i++) advanceOneMinute(ctx);
}

function advanceToNextEvent(ctx: Ctx, maxMinutes: number): void {
  for (let i = 0; i < maxMinutes && ctx.st.status === "running"; i++) {
    const before = ctx.events.length;
    advanceOneMinute(ctx);
    if (ctx.events.slice(before).some((e) => NOTABLE.has(e.type))) return;
  }
}

// ---------------------------------------------------------------------------------------------
// Intents

function notUnderstood(ctx: Ctx, text?: string): void {
  emit(
    ctx,
    "not_understood",
    text ?? "That did not match anything you can do here. Try rephrasing.",
  );
  advance(ctx, 1);
}

function refuse(ctx: Ctx, text: string): void {
  emit(ctx, "refused", text);
}

function order(ctx: Ctx, kind: Task["kind"], id: string): void {
  const { sc, st } = ctx;
  const spec =
    kind === "investigate"
      ? sc.investigations.find((i) => i.id === id)
      : sc.mitigations.find((m) => m.id === id);
  if (!spec) return notUnderstood(ctx);
  if (spec.requires && !evalCondition(ctx, spec.requires)) {
    return refuse(ctx, "Mika: I can't do that yet. We don't know enough, or it is too early.");
  }
  if (st.task && st.queuedTask) {
    return refuse(ctx, "Mika: I already have one job running and one waiting. Cancel one first.");
  }
  emit(ctx, "player_action", `You: ${spec.label}`, { kind, id });
  if (!st.task) {
    startTask(ctx, kind, id, st.minute);
  } else {
    st.queuedTask = { kind, id };
    emit(ctx, "task_queued", `Mika: I'll do that next - ${spec.label}.`, { kind, id });
  }
  advance(ctx, 1);
}

function communicate(ctx: Ctx, intent: Extract<Intent, { kind: "communicate" }>): void {
  const { sc, st } = ctx;
  const to = [...new Set(intent.to)].filter((id) => id !== "engineer" && stakeholderOf(sc, id));
  if (to.length === 0) return notUnderstood(ctx, "There is nobody by that name to tell.");
  const names = to.map((id) => nameOf(sc, id)).join(", ");
  const text = intent.text ?? `To ${names}.`;
  emit(ctx, "player_message", `You to ${names}: ${text}`, { to });

  for (const who of to) {
    const thread = (st.threads[who] ??= { messages: [] });
    thread.messages.push({ minute: st.minute, from: "player", text });
    const patience = stakeholderOf(sc, who)?.patienceMinutes ?? 0;
    if (thread.unansweredSince !== undefined) {
      if (st.minute - thread.unansweredSince <= patience) {
        addTrust(ctx, who, TRUST.replyInTime, "answered in time");
        st.replyStats.inTime += 1;
      }
      thread.unansweredSince = undefined;
    } else if (
      thread.lastProactive === undefined ||
      st.minute - thread.lastProactive >= TRUST.proactiveSpacing
    ) {
      addTrust(ctx, who, TRUST.proactiveUpdate, "you kept them informed");
      thread.lastProactive = st.minute;
    }
    for (const c of st.commitments) {
      if (c.to !== who || c.status !== "open" || c.madeAtMinute >= st.minute) continue;
      if (c.dueMinute === null || st.minute <= c.dueMinute) {
        c.status = "kept";
        emit(ctx, "commitment_kept", `You kept your word to ${nameOf(sc, who)}: ${c.what}`, {
          id: c.id,
          to: who,
        });
        addTrust(ctx, who, TRUST.commitmentKept, "a promise was kept");
      }
    }
  }

  for (const directiveId of intent.directives ?? []) {
    const directive = sc.directives.find((d) => d.id === directiveId);
    if (!directive) continue;
    if (directive.toAny && !to.some((w) => directive.toAny?.includes(w))) {
      emit(ctx, "refused", `${names} cannot act on that.`);
      continue;
    }
    st.directivesSent.push({ id: directiveId, to, minute: st.minute });
    emit(ctx, "directive", `You asked for: ${directive.label}.`, { id: directiveId, to });
    for (const [system, status] of Object.entries(directive.effects?.systems ?? {})) {
      if (Object.hasOwn(st.systems, system)) st.systems[system] = status;
    }
  }

  for (const claim of intent.claims ?? []) recordClaim(ctx, to, claim);

  for (const promise of intent.promises ?? []) {
    if (!stakeholderOf(sc, promise.to)) continue;
    const id = `p${st.commitments.length + 1}`;
    const dueMinute = promise.dueInMinutes === null ? null : st.minute + promise.dueInMinutes;
    const event = emit(
      ctx,
      "commitment_made",
      `You promised ${nameOf(sc, promise.to)}: ${promise.what}${dueMinute === null ? "" : ` (by ${clockOf(sc, dueMinute)})`}`,
      { id, to: promise.to },
    );
    st.commitments.push({
      id,
      to: promise.to,
      what: promise.what,
      madeAtMinute: st.minute,
      dueMinute,
      status: "open",
      eventId: event.id,
    });
  }
  advance(ctx, 1);
}

function cancelTask(ctx: Ctx): void {
  const { sc, st } = ctx;
  const task = st.task;
  if (!task) return refuse(ctx, "Mika has nothing running.");
  const spec = task.kind === "mitigate" ? sc.mitigations.find((m) => m.id === task.id) : undefined;
  if (spec?.onStart) st.mode = { ...task.priorMode };
  st.task = null;
  emit(ctx, "task_cancelled", "Mika: stopped.", { kind: task.kind, id: task.id });
  if (st.queuedTask) {
    const next = st.queuedTask;
    st.queuedTask = null;
    startTask(ctx, next.kind, next.id, st.minute);
  }
  advance(ctx, 1);
}

// ---------------------------------------------------------------------------------------------
// Public API

export function createSession(sc: Scenario, seed: number): Resolution {
  let rng = seed >>> 0;
  const beatOffsets: Record<string, number> = {};
  for (const beat of sc.beats) {
    if ("atMinute" in beat.when && beat.when.jitter) {
      const [offset, next] = jitter(rng, beat.when.jitter);
      beatOffsets[beat.id] = offset;
      rng = next;
    }
  }
  const st: SessionState = {
    scenarioId: sc.id,
    scenarioVersion: sc.version,
    seed,
    rng,
    minute: 0,
    status: "running",
    systems: Object.fromEntries(sc.systems.map((s) => [s.id, s.start])),
    mode: { name: sc.startMode, startMinute: 0, startValue: 0 },
    series: {},
    visibleMetrics: [],
    revealedClues: [],
    completedInvestigations: [],
    appliedMitigations: [],
    task: null,
    queuedTask: null,
    firedBeats: [],
    skippedBeats: [],
    beatOffsets,
    beatPending: {},
    threads: Object.fromEntries(sc.stakeholders.map((s) => [s.id, { messages: [] }])),
    trust: Object.fromEntries(sc.stakeholders.map((s) => [s.id, s.startTrust])),
    commitments: [],
    claims: [],
    directivesSent: [],
    obligations: {},
    replyStats: { episodes: 0, inTime: 0 },
    log: [],
    nextEventId: 1,
  };
  const ctx: Ctx = { sc, st, events: [], requests: [] };
  emit(ctx, "session_started", sc.briefing.situation, { scenario: sc.id, seed });
  updateMetrics(ctx);
  settle(ctx);
  return { state: st, events: ctx.events, renderRequests: ctx.requests };
}

export function resolve(sc: Scenario, previous: SessionState, input: EngineInput): Resolution {
  const st = structuredClone(previous);
  const ctx: Ctx = { sc, st, events: [], requests: [] };
  if (st.status !== "running") {
    refuse(ctx, "The incident is closed.");
    return { state: st, events: ctx.events, renderRequests: ctx.requests };
  }
  switch (input.type) {
    case "intent": {
      const intent = input.intent;
      if (intent.kind === "investigate") order(ctx, "investigate", intent.id);
      else if (intent.kind === "mitigate") order(ctx, "mitigate", intent.id);
      else if (intent.kind === "communicate") communicate(ctx, intent);
      else notUnderstood(ctx);
      break;
    }
    case "wait":
      advanceToNextEvent(ctx, 5);
      break;
    case "tick":
      advance(ctx, Math.max(0, Math.floor(input.minutes)));
      break;
    case "cancelTask":
      cancelTask(ctx);
      break;
    case "end":
      endSession(ctx, "ended", "You closed the incident.");
      break;
  }
  return { state: st, events: ctx.events, renderRequests: ctx.requests };
}
