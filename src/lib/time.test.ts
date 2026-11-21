import { describe, expect, it } from "vitest";
import { businessDate, localTime } from "./time";

describe("time (America/Argentina/Buenos_Aires)", () => {
  it("a las 01:30 UTC todavía es el día anterior en Argentina", () => {
    const instant = new Date("2026-03-10T01:30:00Z");
    expect(businessDate(instant)).toBe("2026-03-09");
    expect(localTime(instant)).toBe("22:30");
  });

  it("al mediodía UTC es el mismo día", () => {
    expect(businessDate(new Date("2026-03-10T12:00:00Z"))).toBe("2026-03-10");
  });
});
