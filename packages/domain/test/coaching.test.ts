import { describe, expect, test } from "vitest";

import {
  buildHerContext,
  buildHimContext,
  DISCLAIMER,
  evaluate,
  RULES,
  type CoachingContext,
} from "../src/coaching";

// Base contexts with every condition OFF; each test flips just what it needs.
const her: CoachingContext = { audience: "her", cyclesObserved: 3, irregular: false };
const him: CoachingContext = { audience: "him", weeklyAlcoholUnits: 0, weeklyCigarettes: 0 };

describe("each rule fires only on its condition", () => {
  test("doctor-nudge needs irregular AND 6+ cycles", () => {
    expect(evaluate({ ...her, irregular: true, cyclesObserved: 6 })?.ruleId).toBe("doctor-nudge");
    // irregular but too few cycles -> honesty rule instead, not doctor-nudge
    expect(evaluate({ ...her, irregular: true, cyclesObserved: 3 })?.ruleId).toBe(
      "irregular-cycle-honesty",
    );
  });
  test("short-luteal fires under 10 days only", () => {
    expect(evaluate({ ...her, lutealPhaseDays: 8 })?.ruleId).toBe("short-luteal");
    expect(evaluate({ ...her, lutealPhaseDays: 12 })).toBeNull();
  });
  test("fertile-window fires when this week", () => {
    expect(
      evaluate({ ...her, fertileThisWeek: true, fertileStart: "2026-09-01", fertileEnd: "2026-09-07" })
        ?.ruleId,
    ).toBe("fertile-window-this-week");
  });
  test("missed-bbt fires on its own", () => {
    expect(evaluate({ ...her, missedBbt: true })?.ruleId).toBe("missed-bbt");
  });
  test("heat-exposure and alcohol-smoking are his", () => {
    expect(evaluate({ ...him, heatExposureThisWeek: true })?.ruleId).toBe("heat-exposure");
    expect(evaluate({ ...him, weeklyCigarettes: 3 })?.ruleId).toBe("alcohol-smoking");
    expect(evaluate({ ...him, weeklyAlcoholUnits: 8 })?.ruleId).toBe("alcohol-smoking");
  });
  test("nothing fires -> null", () => {
    expect(evaluate(her)).toBeNull();
    expect(evaluate(him)).toBeNull();
  });
});

describe("priority: the most important rule wins", () => {
  test("doctor-nudge beats fertile-window when both fire", () => {
    const c = {
      ...her,
      irregular: true,
      cyclesObserved: 8,
      fertileThisWeek: true,
      fertileStart: "2026-09-01",
      fertileEnd: "2026-09-07",
      lutealPhaseDays: 8,
    };
    expect(evaluate(c)?.ruleId).toBe("doctor-nudge");
  });
  test("heat-exposure beats alcohol-smoking", () => {
    expect(
      evaluate({ ...him, heatExposureThisWeek: true, weeklyCigarettes: 5 })?.ruleId,
    ).toBe("heat-exposure");
  });
});

describe("templated text and disclaimer", () => {
  test("placeholders fill from context", () => {
    const body = evaluate({
      ...her,
      fertileThisWeek: true,
      fertileStart: "2026-09-01",
      fertileEnd: "2026-09-07",
    })!.body;
    expect(body).toContain("2026-09-01");
    expect(body).toContain("2026-09-07");
    expect(body).not.toContain("{"); // no unresolved placeholders
  });
  test("every rule's output ends with the disclaimer", () => {
    for (const r of RULES) {
      // Force this rule to be the only match by evaluating it in isolation.
      const action = evaluate({ audience: r.audience }, [{ ...r, when: () => true }]);
      expect(action?.body.endsWith(DISCLAIMER)).toBe(true);
    }
  });
});

describe("context builders derive facts from raw logs", () => {
  test("fertile-this-week from cycle logs", () => {
    // Four period starts = 3 observed ~28-day cycles ending 2026-08-03.
    const cycles = ["2026-05-11", "2026-06-08", "2026-07-06", "2026-08-03"].map((date) => ({
      date,
      flow: "medium",
    }));
    const ctx = buildHerContext({ cycles, bbt: [], opk: [] }, "2026-08-12");
    expect(ctx.prediction?.status).toBe("ok");
    // fertile window should be flagged relative to the given 'today'
    expect(typeof ctx.fertileThisWeek).toBe("boolean");
  });
  test("short luteal from OPK peak to next period", () => {
    const cycles = [
      { date: "2026-06-08", flow: "medium" },
      { date: "2026-07-06", flow: "medium" },
      { date: "2026-08-03", flow: "medium" },
    ];
    const opk = [{ date: "2026-07-28", result: "peak" }]; // 6 days before 2026-08-03
    const ctx = buildHerContext({ cycles, bbt: [], opk }, "2026-08-10");
    expect(ctx.lutealPhaseDays).toBe(6);
    expect(evaluate(ctx)?.ruleId).toBe("short-luteal");
  });
  test("missed BBT when none logged recently", () => {
    const cycles = [{ date: "2026-08-01", flow: "medium" }];
    const ctx = buildHerContext({ cycles, bbt: [{ date: "2026-08-01" }], opk: [] }, "2026-08-20");
    expect(ctx.missedBbt).toBe(true);
  });
  test("him weekly sums within 7 days", () => {
    const habits = [
      { date: "2026-08-18", alcoholUnits: 4, cigarettes: 0, heatExposure: false },
      { date: "2026-08-19", alcoholUnits: 5, cigarettes: 2, heatExposure: true },
      { date: "2026-08-01", alcoholUnits: 10, cigarettes: 10, heatExposure: true }, // outside window
    ];
    const ctx = buildHimContext(habits, "2026-08-20");
    expect(ctx.weeklyAlcoholUnits).toBe(9);
    expect(ctx.weeklyCigarettes).toBe(2);
    expect(ctx.heatExposureThisWeek).toBe(true);
  });
});
