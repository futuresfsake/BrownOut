// Scenario clock helpers. Sim time is whole minutes since the start of the scenario.

export function parseClock(clock: string): number {
  const [h = "0", m = "0"] = clock.split(":");
  return Number(h) * 60 + Number(m);
}

export function formatClock(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The wall-clock reading at a sim minute, for a scenario that starts at `startClock`. */
export function clockAt(startClock: string, minute: number): string {
  return formatClock(parseClock(startClock) + minute);
}
