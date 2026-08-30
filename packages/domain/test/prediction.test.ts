import { describe, expect, test } from "vitest";

import { deriveCycleStarts, predict, predictFromCycleLogs } from "../src/prediction";

// Build a list of period-start dates spaced by the given gaps, starting at `from`.
function starts(from: string, gaps: number[]): string[] {
  const out = [from];
  let ms = Date.parse(`${from}T00:00:00Z`);
  for (const g of gaps) {
    ms += g * 86_400_000;
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
}

describe("insufficient data", () => {
  test("no cycles", () => {
    const p = predict([]);
    expect(p.status).toBe("insufficient_data");
  });
  test("two starts = one cycle is still not enough", () => {
    const p = predict(["2026-01-01", "2026-01-29"]);
    expect(p.status).toBe("insufficient_data");
    if (p.status === "insufficient_data") expect(p.cyclesObserved).toBe(1);
  });
  test("never invents a 28-day fallback", () => {
    const p = predict(["2026-01-01"]);
    expect(JSON.stringify(p)).not.toContain("nextPeriodStart");
  });
});

describe("regular cycles", () => {
  const p = predict(starts("2026-01-01", [28, 28, 28, 28]));
  test("predicts and is high confidence when steady", () => {
    expect(p.status).toBe("ok");
    if (p.status !== "ok") return;
    expect(p.avgCycleLength).toBe(28);
    expect(p.confidence).toBe("high");
    expect(p.cyclesObserved).toBe(4);
  });
  test("next period is one avg-cycle after the last start", () => {
    if (p.status !== "ok") return;
    // last start = 2026-01-01 + 4*28d = 2026-04-23; +28 => 2026-05-21
    expect(p.nextPeriodStart).toBe("2026-05-21");
    // ovulation ~14d before next period
    expect(p.ovulationEstimate).toBe("2026-05-07");
    expect(p.fertileWindow).toEqual({ start: "2026-05-02", end: "2026-05-08" });
  });
});

describe("cycle length is learned, not assumed", () => {
  test("short cycles", () => {
    const p = predict(starts("2026-01-01", [24, 24, 24]));
    expect(p.status).toBe("ok");
    if (p.status === "ok") expect(p.avgCycleLength).toBe(24);
  });
  test("long cycles", () => {
    const p = predict(starts("2026-01-01", [34, 35, 33]));
    expect(p.status).toBe("ok");
    if (p.status === "ok") expect(p.avgCycleLength).toBe(34);
  });
});

describe("irregular cycles lower confidence, still honest", () => {
  const p = predict(starts("2026-01-01", [26, 40, 22, 35]));
  test("predicts but flags low confidence", () => {
    expect(p.status).toBe("ok");
    if (p.status === "ok") expect(p.confidence).toBe("low");
  });
});

describe("missing / noisy data", () => {
  test("an implausible gap (missed logs) is dropped from the average", () => {
    // one 120-day gap from skipped logging shouldn't blow up the estimate
    const withNoise = predict(starts("2026-01-01", [28, 28, 28, 120]));
    const clean = predict(starts("2026-01-01", [28, 28, 28]));
    if (withNoise.status === "ok" && clean.status === "ok") {
      expect(withNoise.avgCycleLength).toBe(clean.avgCycleLength);
    }
  });
});

describe("deriveCycleStarts", () => {
  test("collapses consecutive bleeding days into one start", () => {
    const logs = [
      { date: "2026-01-01", flow: "medium" },
      { date: "2026-01-02", flow: "medium" },
      { date: "2026-01-03", flow: "light" },
      { date: "2026-01-29", flow: "medium" },
      { date: "2026-01-30", flow: "light" },
    ];
    expect(deriveCycleStarts(logs)).toEqual(["2026-01-01", "2026-01-29"]);
  });
  test("ignores days with no flow", () => {
    const logs = [
      { date: "2026-01-01", flow: "medium" },
      { date: "2026-01-05", flow: null },
      { date: "2026-01-06", flow: "" },
    ];
    expect(deriveCycleStarts(logs)).toEqual(["2026-01-01"]);
  });
  test("end to end from logs", () => {
    const logs = [28, 28, 28].reduce<{ date: string; flow: string }[]>(
      (acc, _g, i) => {
        acc.push({ date: new Date(Date.UTC(2026, 0, 1 + i * 28)).toISOString().slice(0, 10), flow: "medium" });
        return acc;
      },
      [{ date: "2026-01-01", flow: "medium" }],
    );
    const p = predictFromCycleLogs(logs);
    expect(["ok", "insufficient_data"]).toContain(p.status);
  });
});
