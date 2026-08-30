// Phase 7 — the coaching rules engine. PURE and data-driven: rules are objects in
// a list (id + version + priority + condition + templated text), never scattered
// if/else in code, so a rule can be added or re-tuned without touching the engine.
// The weekly server job builds a context per partner, calls `evaluate`, and stores
// the single highest-priority action for each — stamped with the rule id/version.

import { predictFromCycleLogs, type Prediction } from "./prediction";

// Wrapped around every output; the app also shows it, but keep it in the body so
// a stored coaching row is never disclaimer-less on its own.
export const DISCLAIMER = "Guidance, not medical advice.";

export type Audience = "her" | "him";

// A context is the pre-computed facts a rule reads. Extra keys double as template
// placeholders ({cyclesObserved}, {fertileStart}, …).
export interface CoachingContext {
  audience: Audience;
  // her-derived
  prediction?: Prediction;
  cyclesObserved?: number;
  irregular?: boolean;
  fertileThisWeek?: boolean;
  fertileStart?: string;
  fertileEnd?: string;
  lutealPhaseDays?: number | null;
  missedBbt?: boolean;
  // him-derived
  weeklyAlcoholUnits?: number;
  weeklyCigarettes?: number;
  heatExposureThisWeek?: boolean;
  [k: string]: unknown;
}

export interface Rule {
  id: string;
  version: number;
  audience: Audience;
  priority: number; // higher wins when several fire
  when: (c: CoachingContext) => boolean;
  text: string; // may contain {placeholder} keys resolved from the context
}

// --- the rule set (data) ---------------------------------------------------

export const RULES: Rule[] = [
  // Medical nudges rank highest so they always win over lifestyle tips.
  {
    id: "doctor-nudge",
    version: 1,
    audience: "her",
    priority: 100,
    when: (c) => !!c.irregular && (c.cyclesObserved ?? 0) >= 6,
    text: "You've logged {cyclesObserved} cycles and they're still varying a lot. It may be worth talking to a doctor about your cycle.",
  },
  {
    id: "short-luteal",
    version: 1,
    audience: "her",
    priority: 90,
    when: (c) => c.lutealPhaseDays != null && c.lutealPhaseDays < 10,
    text: "Your luteal phase looks short (~{lutealPhaseDays} days) based on your ovulation tests. Consider raising this with a clinician.",
  },
  {
    id: "fertile-window-this-week",
    version: 1,
    audience: "her",
    priority: 80,
    when: (c) => !!c.fertileThisWeek,
    text: "Your estimated fertile window is this week ({fertileStart} to {fertileEnd}) — a good time to focus on trying.",
  },
  {
    id: "irregular-cycle-honesty",
    version: 1,
    audience: "her",
    priority: 40,
    // Fires for low-confidence / not-enough-data cases the doctor nudge didn't take.
    when: (c) => !!c.irregular && (c.cyclesObserved ?? 0) < 6,
    text: "Your cycles look irregular so far, so any date estimate is low-confidence. Keep logging — a few more cycles sharpen it.",
  },
  {
    id: "missed-bbt",
    version: 1,
    audience: "her",
    priority: 30,
    when: (c) => !!c.missedBbt,
    text: "You haven't logged your basal body temperature in a few days. A daily morning reading improves your fertile-window estimate.",
  },
  // his lifestyle rules
  {
    id: "heat-exposure",
    version: 1,
    audience: "him",
    priority: 70,
    when: (c) => !!c.heatExposureThisWeek,
    text: "You logged heat exposure (hot bath/sauna) this week. Frequent heat can lower sperm quality — worth easing off while trying.",
  },
  {
    id: "alcohol-smoking",
    version: 1,
    audience: "him",
    priority: 60,
    when: (c) => (c.weeklyAlcoholUnits ?? 0) >= 7 || (c.weeklyCigarettes ?? 0) > 0,
    text: "This week you logged {weeklyAlcoholUnits} alcohol units and {weeklyCigarettes} cigarettes. Cutting back supports fertility.",
  },
];

// --- engine ----------------------------------------------------------------

export function fillTemplate(text: string, c: CoachingContext): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(c[k] ?? ""));
}

export interface CoachingAction {
  ruleId: string;
  ruleVersion: number;
  priority: number;
  body: string; // filled text + disclaimer
}

// The single highest-priority rule that fires for this context, or null.
export function evaluate(c: CoachingContext, rules: Rule[] = RULES): CoachingAction | null {
  const matches = rules
    .filter((r) => r.audience === c.audience && r.when(c))
    .sort((a, b) => b.priority - a.priority);
  const top = matches[0];
  if (!top) return null;
  return {
    ruleId: top.id,
    ruleVersion: top.version,
    priority: top.priority,
    body: `${fillTemplate(top.text, c)}\n\n${DISCLAIMER}`,
  };
}

// --- context builders (pure; the server feeds them raw logs) ---------------

const MS_PER_DAY = 86_400_000;
const toMs = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y!, m! - 1, day!);
};
const diffDays = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / MS_PER_DAY);

// ponytail: luteal length from the most recent OPK peak/positive to the next
// period start — a real signal, but OPK-based only. BBT thermal-shift detection
// is the upgrade path if this proves too noisy.
function lutealFromOpk(
  opk: { date: string; result?: string | null }[],
  cycleStarts: string[],
): number | null {
  const peaks = opk
    .filter((o) => o.result === "peak" || o.result === "positive")
    .map((o) => o.date)
    .sort();
  const lastPeak = peaks[peaks.length - 1];
  if (!lastPeak) return null;
  const nextStart = cycleStarts.filter((d) => diffDays(lastPeak, d) > 0).sort()[0];
  if (!nextStart) return null;
  return diffDays(lastPeak, nextStart);
}

export function buildHerContext(
  logs: {
    cycles: { date: string; flow?: string | null }[];
    bbt: { date: string }[];
    opk: { date: string; result?: string | null }[];
  },
  today: string,
): CoachingContext {
  const prediction = predictFromCycleLogs(logs.cycles);
  const cyclesObserved = prediction.cyclesObserved;
  const irregular =
    prediction.status === "insufficient_data" || prediction.confidence === "low";

  let fertileThisWeek = false;
  let fertileStart: string | undefined;
  let fertileEnd: string | undefined;
  if (prediction.status === "ok") {
    fertileStart = prediction.fertileWindow.start;
    fertileEnd = prediction.fertileWindow.end;
    const daysToStart = diffDays(today, fertileStart);
    fertileThisWeek = daysToStart >= 0 && daysToStart <= 7;
  }

  const cycleStarts = [...new Set(logs.cycles.filter((c) => c.flow).map((c) => c.date))].sort();
  const lutealPhaseDays = lutealFromOpk(logs.opk, cycleStarts);

  // Only nudge someone who is actually period-tracking, and only if her latest
  // BBT reading is stale (or missing).
  const lastBbt = logs.bbt.map((b) => b.date).sort().pop();
  const missedBbt =
    cycleStarts.length >= 1 && (!lastBbt || diffDays(lastBbt, today) > 3);

  return {
    audience: "her",
    prediction,
    cyclesObserved,
    irregular,
    fertileThisWeek,
    fertileStart,
    fertileEnd,
    lutealPhaseDays,
    missedBbt,
  };
}

export function buildHimContext(
  habits: {
    date: string;
    alcoholUnits?: number | null;
    cigarettes?: number | null;
    heatExposure?: boolean | null;
  }[],
  today: string,
): CoachingContext {
  const thisWeek = habits.filter((h) => {
    const d = diffDays(h.date, today);
    return d >= 0 && d < 7;
  });
  return {
    audience: "him",
    weeklyAlcoholUnits: thisWeek.reduce((s, h) => s + (h.alcoholUnits ?? 0), 0),
    weeklyCigarettes: thisWeek.reduce((s, h) => s + (h.cigarettes ?? 0), 0),
    heatExposureThisWeek: thisWeek.some((h) => h.heatExposure === true),
  };
}
