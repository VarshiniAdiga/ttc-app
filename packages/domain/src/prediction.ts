// Adaptive cycle prediction — a PURE function. No DB, no clock, no stored state:
// the estimate is always derived from the logged period-start dates on demand.
// It never assumes a 28-day cycle, and with fewer than 3 observed cycles it
// says so honestly instead of inventing a date.

export type Confidence = "low" | "medium" | "high";

export type Prediction =
  | {
      status: "insufficient_data";
      cyclesObserved: number;
      message: string;
    }
  | {
      status: "ok";
      confidence: Confidence;
      cyclesObserved: number;
      avgCycleLength: number; // days
      nextPeriodStart: string; // YYYY-MM-DD
      ovulationEstimate: string; // YYYY-MM-DD
      fertileWindow: { start: string; end: string };
    };

// --- date helpers (UTC, no dependency) ------------------------------------

const MS_PER_DAY = 86_400_000;

function toMs(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y!, m! - 1, day!);
}
function toStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  return toStr(toMs(d) + n * MS_PER_DAY);
}
function diffDays(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / MS_PER_DAY);
}

// --- stats -----------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

// The luteal phase is far more stable than the follicular one, so we anchor
// ovulation ~14 days *before* the next period rather than from the last one.
const LUTEAL_DAYS = 14;

// A "cycle start" is a bleeding day whose previous calendar day was not one.
// Spotting counts as bleeding here (kept simple; a clinician tunes this later).
export function deriveCycleStarts(
  logs: { date: string; flow?: string | null }[],
): string[] {
  const bleeding = new Set(
    logs.filter((l) => l.flow && l.flow !== "none").map((l) => l.date),
  );
  return [...bleeding]
    .sort()
    .filter((d) => !bleeding.has(addDays(d, -1)));
}

function confidenceFrom(sd: number, cyclesObserved: number): Confidence {
  if (sd <= 2 && cyclesObserved >= 4) return "high";
  if (sd <= 5) return "medium";
  return "low";
}

/** Predict from raw period-start dates (any order, duplicates ok). */
export function predict(startDates: string[]): Prediction {
  const starts = [...new Set(startDates)].sort();
  const cyclesObserved = Math.max(0, starts.length - 1);

  if (cyclesObserved < 3) {
    return {
      status: "insufficient_data",
      cyclesObserved,
      message: "Log at least 3 full cycles before we estimate a date.",
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    gaps.push(diffDays(starts[i - 1]!, starts[i]!));
  }
  // Drop implausible gaps (missed logs / data noise) if enough remain.
  const clean = gaps.filter((g) => g >= 15 && g <= 90);
  const sample = clean.length >= 3 ? clean : gaps;

  const avgCycleLength = Math.round(mean(sample));
  const confidence = confidenceFrom(stdev(sample), cyclesObserved);

  const lastStart = starts[starts.length - 1]!;
  const nextPeriodStart = addDays(lastStart, avgCycleLength);
  const ovulationEstimate = addDays(nextPeriodStart, -LUTEAL_DAYS);
  const fertileWindow = {
    start: addDays(ovulationEstimate, -5),
    end: addDays(ovulationEstimate, 1),
  };

  return {
    status: "ok",
    confidence,
    cyclesObserved,
    avgCycleLength,
    nextPeriodStart,
    ovulationEstimate,
    fertileWindow,
  };
}

/** Convenience: derive starts from cycle logs, then predict. */
export function predictFromCycleLogs(
  logs: { date: string; flow?: string | null }[],
): Prediction {
  return predict(deriveCycleStarts(logs));
}
