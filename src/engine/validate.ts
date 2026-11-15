// The scenario validator. A scenario that fails here is unfair or broken and must not ship.
// The checks are listed in docs/03-design/scenario-format.md.
import { play, say, type Step } from "./playthrough.js";
import { customerMinutes, score } from "./score.js";
import { ScenarioSchema, type Condition, type Scenario } from "./schema.js";

export interface ValidationReport {
  errors: string[];
  notes: string[];
}

export interface ValidationInput {
  scenario: Scenario;
  playthroughs: Record<"ideal" | "poor" | "dishonest" | "silent", Step[]>;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function leaves(c: Condition, visit: (leaf: Condition) => void): void {
  if (c.type === "all" || c.type === "any") c.of.forEach((x) => leaves(x, visit));
  else if (c.type === "not") leaves(c.of, visit);
  else visit(c);
}

/** Digits and clock times in a text, ignoring {placeholders}. */
export function numbersIn(text: string): string[] {
  return text.replace(/\{\w+\}/g, " ").match(/\d+:\d+|\d+/g) ?? [];
}

function duplicates(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

function checkReferences(sc: Scenario, errors: string[]): void {
  const ids = {
    stakeholder: new Set(sc.stakeholders.map((s) => s.id)),
    system: new Set(sc.systems.map((s) => s.id)),
    metric: new Set(sc.metrics.map((m) => m.id)),
    clue: new Set(sc.clues.map((c) => c.id)),
    investigation: new Set(sc.investigations.map((i) => i.id)),
    mitigation: new Set(sc.mitigations.map((m) => m.id)),
    directive: new Set(sc.directives.map((d) => d.id)),
    topic: new Set(sc.claimTopics.map((t) => t.id)),
    obligation: new Set(sc.obligations.map((o) => o.id)),
    beat: new Set(sc.beats.map((b) => b.id)),
    mode: new Set(Object.keys(sc.modes)),
  };
  const need = (kind: keyof typeof ids, id: string, where: string) => {
    if (!ids[kind].has(id)) errors.push(`${where}: unknown ${kind} "${id}"`);
  };

  const groups: [string, string[]][] = [
    ["stakeholders", sc.stakeholders.map((s) => s.id)],
    ["systems", sc.systems.map((s) => s.id)],
    ["metrics", sc.metrics.map((m) => m.id)],
    ["clues", sc.clues.map((c) => c.id)],
    ["investigations", sc.investigations.map((i) => i.id)],
    ["mitigations", sc.mitigations.map((m) => m.id)],
    ["directives", sc.directives.map((d) => d.id)],
    ["claim topics", sc.claimTopics.map((t) => t.id)],
    ["obligations", sc.obligations.map((o) => o.id)],
    ["beats", sc.beats.map((b) => b.id)],
  ];
  for (const [name, list] of groups) {
    for (const dup of duplicates(list)) errors.push(`${name}: duplicate id "${dup}"`);
  }
  for (const required of ["cto", "engineer"]) need("stakeholder", required, "scenario");

  const check = (c: Condition | undefined, where: string) => {
    if (!c) return;
    leaves(c, (leaf) => {
      switch (leaf.type) {
        case "clue":
          return need("clue", leaf.id, where);
        case "mitigation":
          return need("mitigation", leaf.id, where);
        case "investigation":
          return need("investigation", leaf.id, where);
        case "metricAbove":
        case "metricBelow":
          return need("metric", leaf.id, where);
        case "claim":
          need("topic", leaf.topic, where);
          if (leaf.to) need("stakeholder", leaf.to, where);
          return;
        case "trustBelow":
          return need("stakeholder", leaf.who, where);
        case "unanswered":
          return need("stakeholder", leaf.who, where);
        case "beatFired":
          return need("beat", leaf.id, where);
        case "commitmentBroken":
          if (leaf.to) need("stakeholder", leaf.to, where);
          return;
        case "directiveSent":
          need("directive", leaf.id, where);
          if (leaf.to) need("stakeholder", leaf.to, where);
          return;
        case "obligation":
          return need("obligation", leaf.id, where);
        default:
          return;
      }
    });
  };

  need("metric", sc.driverMetric, "driverMetric");
  need("mode", sc.startMode, "startMode");
  need("clue", sc.scoring.rootCauseClue, "scoring.rootCauseClue");
  for (const [name, segs] of Object.entries(sc.modes)) {
    for (const seg of segs) if (seg.kind === "follow") need("mode", seg.mode, `mode ${name}`);
  }
  for (const m of sc.metrics) {
    check(m.visibleWhen ?? undefined, `metric ${m.id}.visibleWhen`);
    if (m.derive) need("metric", m.derive.from, `metric ${m.id}.derive`);
  }
  for (const i of sc.investigations) {
    check(i.requires, `investigation ${i.id}.requires`);
    check(i.revealsWhen, `investigation ${i.id}.revealsWhen`);
    i.reveals.forEach((c) => need("clue", c, `investigation ${i.id}.reveals`));
  }
  for (const m of sc.mitigations) {
    check(m.requires, `mitigation ${m.id}.requires`);
    if (m.onStart) need("mode", m.onStart.mode, `mitigation ${m.id}.onStart`);
    if (m.onComplete.mode) need("mode", m.onComplete.mode, `mitigation ${m.id}.onComplete`);
    Object.keys(m.onComplete.systems ?? {}).forEach((s) => need("system", s, `mitigation ${m.id}`));
  }
  for (const d of sc.directives) {
    d.toAny?.forEach((s) => need("stakeholder", s, `directive ${d.id}.toAny`));
    Object.keys(d.effects?.systems ?? {}).forEach((s) => need("system", s, `directive ${d.id}`));
  }
  for (const t of sc.claimTopics) {
    [...t.supportsAsserts, ...t.supportsDenies].forEach((c) => need("clue", c, `topic ${t.id}`));
    check(t.surfacesWhen, `topic ${t.id}.surfacesWhen`);
  }
  for (const o of sc.obligations) {
    check(o.trigger, `obligation ${o.id}.trigger`);
    need("directive", o.satisfiedBy.directive, `obligation ${o.id}`);
    [...(o.satisfiedBy.toAny ?? []), ...(o.satisfiedBy.toAll ?? [])].forEach((s) =>
      need("stakeholder", s, `obligation ${o.id}`),
    );
  }
  for (const b of sc.beats) {
    if (b.from !== "system") need("stakeholder", b.from, `beat ${b.id}.from`);
    if ("condition" in b.when) check(b.when.condition, `beat ${b.id}.when`);
    check(b.unless, `beat ${b.id}.unless`);
    if (b.quotesClaim) need("topic", b.quotesClaim, `beat ${b.id}.quotesClaim`);
  }
  check(sc.endings.resolvedWhen, "endings.resolvedWhen");
  for (const [n, step] of sc.idealPath.entries()) {
    const where = `idealPath[${n}]`;
    const intent = step.intent;
    if (intent.kind === "investigate") need("investigation", intent.id, where);
    if (intent.kind === "mitigate") need("mitigation", intent.id, where);
    if (intent.kind === "communicate") {
      intent.to.forEach((s) => need("stakeholder", s, where));
      intent.directives?.forEach((d) => need("directive", d, where));
      intent.claims?.forEach((c) => need("topic", c.topic, where));
      intent.promises?.forEach((p) => need("stakeholder", p.to, where));
    }
  }
}

/** Optimistic reachability: could every investigation and mitigation ever be ordered? */
function checkReachability(sc: Scenario, errors: string[]): void {
  const clues = new Set<string>();
  const mitigations = new Set<string>();
  const investigations = new Set<string>();
  const possible = (c: Condition | undefined): boolean => {
    if (!c) return true;
    switch (c.type) {
      case "clue":
        return clues.has(c.id);
      case "mitigation":
        return mitigations.has(c.id);
      case "investigation":
        return investigations.has(c.id);
      case "all":
        return c.of.every(possible);
      case "any":
        return c.of.some(possible);
      default:
        return true; // metrics, claims, time, trust and the like can all happen
    }
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of sc.investigations) {
      if (investigations.has(i.id) || !possible(i.requires)) continue;
      investigations.add(i.id);
      i.reveals.forEach((c) => clues.add(c));
      changed = true;
    }
    for (const m of sc.mitigations) {
      if (mitigations.has(m.id) || !possible(m.requires)) continue;
      mitigations.add(m.id);
      changed = true;
    }
  }
  for (const i of sc.investigations) {
    if (!investigations.has(i.id))
      errors.push(`investigation ${i.id}: its requirement can never be met`);
  }
  for (const m of sc.mitigations) {
    if (!mitigations.has(m.id)) errors.push(`mitigation ${m.id}: its requirement can never be met`);
  }
  for (const c of sc.clues) {
    if (!sc.investigations.some((i) => i.reveals.includes(c.id))) {
      errors.push(`clue ${c.id}: no investigation reveals it`);
    }
  }
}

function checkAuthoring(sc: Scenario, errors: string[]): void {
  const short = (kind: string, id: string, examples: string[]) => {
    if (examples.length < 5)
      errors.push(`${kind} ${id}: needs at least 5 example phrasings, has ${examples.length}`);
  };
  sc.investigations.forEach((i) => short("investigation", i.id, i.examples));
  sc.mitigations.forEach((m) => short("mitigation", m.id, m.examples));
  sc.directives.forEach((d) => short("directive", d.id, d.examples));

  const extra = (text: string, allowed: string[], where: string) => {
    const known = new Set(allowed.flatMap(numbersIn));
    for (const n of numbersIn(text)) {
      if (!known.has(n)) errors.push(`${where}: the number "${n}" is not in its facts`);
    }
  };
  for (const b of sc.beats) extra(b.fallbackText, b.facts, `beat ${b.id}`);
  const clueFact = (id: string) => sc.clues.find((c) => c.id === id)?.fact ?? "";
  for (const i of sc.investigations) {
    const allowed = [...i.reveals.map(clueFact), ...(i.facts ?? [])];
    extra(i.resultText, allowed, `investigation ${i.id}`);
    if (i.notYetText) extra(i.notYetText, allowed, `investigation ${i.id}.notYetText`);
  }
  for (const m of sc.mitigations) extra(m.resultText, m.facts ?? [], `mitigation ${m.id}`);
}

function checkPlaythroughs(input: ValidationInput, errors: string[], notes: string[]): void {
  const { scenario: sc, playthroughs } = input;

  for (const seed of SEEDS) {
    const { state } = play(sc, playthroughs.ideal, { seed });
    const result = score(sc, state);
    if (state.status !== "resolved")
      errors.push(`ideal path (seed ${seed}): ended ${state.status}, not resolved`);
    else if (result.overall < 85)
      errors.push(`ideal path (seed ${seed}): scored ${result.overall}, below 85`);
  }

  const silent = play(sc, playthroughs.silent, { seed: 1 });
  if (silent.state.status === "resolved") errors.push("doing nothing resolves the incident");
  const baseline = customerMinutes(sc, silent.state);
  for (const m of sc.mitigations.filter((x) => x.kind === "harmful")) {
    const run = play(sc, [say(3, { kind: "mitigate", id: m.id })], { seed: 1 });
    if (!run.state.appliedMitigations.some((a) => a.id === m.id)) {
      errors.push(`harmful mitigation ${m.id}: could not be applied in the test run`);
    } else if (customerMinutes(sc, run.state) <= baseline) {
      errors.push(`harmful mitigation ${m.id}: does not make containment worse than doing nothing`);
    }
  }

  const fired = new Set<string>();
  for (const steps of Object.values(playthroughs)) {
    for (const seed of [1, 2, 3])
      play(sc, steps, { seed }).state.firedBeats.forEach((b) => fired.add(b));
  }
  for (const b of sc.beats) {
    if (!fired.has(b.id)) errors.push(`beat ${b.id}: never fires in any scripted playthrough`);
  }

  const ideal = play(sc, playthroughs.ideal, { seed: 1 });
  const seen = new Set<string>();
  for (const e of ideal.events.filter((x) => x.type === "message")) {
    const key = `${e.minute}:${String(e.data?.from)}`;
    if (seen.has(key))
      errors.push(`ideal path: two messages from ${String(e.data?.from)} in minute ${e.minute}`);
    seen.add(key);
  }
  notes.push(`ideal path resolves in minute ${ideal.state.minute}`);
}

export function validateScenario(input: ValidationInput): ValidationReport {
  const errors: string[] = [];
  const notes: string[] = [];
  const parsed = ScenarioSchema.safeParse(input.scenario);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20)) {
      errors.push(`schema: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return { errors, notes };
  }
  checkReferences(input.scenario, errors);
  if (errors.length > 0) return { errors, notes };
  checkReachability(input.scenario, errors);
  checkAuthoring(input.scenario, errors);
  if (errors.length > 0) return { errors, notes };
  checkPlaythroughs(input, errors, notes);
  return { errors, notes };
}
