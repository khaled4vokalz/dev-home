import { describe, it, expect } from "vitest";
import {
  lastWorkdayStart,
  sinceFor,
  standupRef,
  standupTitle,
  formatJqlDate,
  formatSinceLabel,
} from "./dates";
import { getWeekendDays, DEFAULT_WEEKEND_DAYS } from "../../services/config";

// Local-time constructors so tests are timezone-independent.
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);
const FRI_SAT = [5, 6];

describe("lastWorkdayStart", () => {
  it("is yesterday's midnight on a normal weekday", () => {
    // Tue 13 Oct 2026 → Mon 12 Oct
    expect(lastWorkdayStart(at(2026, 10, 13), FRI_SAT)).toEqual(new Date(2026, 9, 12));
  });

  it("skips the weekend: Sunday → Thursday with a Fri/Sat weekend", () => {
    // Sun 11 Oct 2026 → Thu 8 Oct
    expect(lastWorkdayStart(at(2026, 10, 11), FRI_SAT)).toEqual(new Date(2026, 9, 8));
  });

  it("honours a custom Sat/Sun weekend: Monday → Friday", () => {
    // Mon 12 Oct 2026 → Fri 9 Oct
    expect(lastWorkdayStart(at(2026, 10, 12), [0, 6])).toEqual(new Date(2026, 9, 9));
  });

  it("falls back to yesterday when every day is a weekend", () => {
    expect(lastWorkdayStart(at(2026, 10, 13), [0, 1, 2, 3, 4, 5, 6])).toEqual(
      new Date(2026, 9, 12),
    );
  });
});

describe("sinceFor", () => {
  it("maps lookbacks to local midnights", () => {
    const now = at(2026, 10, 11);
    expect(sinceFor("workday", now, FRI_SAT)).toEqual(new Date(2026, 9, 8));
    expect(sinceFor("3d", now, FRI_SAT)).toEqual(new Date(2026, 9, 8));
    expect(sinceFor("7d", now, FRI_SAT)).toEqual(new Date(2026, 9, 4));
  });
});

describe("formatting", () => {
  it("builds the standup reference and title from the local date", () => {
    expect(standupRef(at(2026, 10, 11))).toBe("standup:2026-10-11");
    expect(standupTitle(at(2026, 10, 11))).toBe("Standup · Sun 11 Oct");
  });

  it("formats JQL dates and since labels", () => {
    expect(formatJqlDate(new Date(2026, 9, 8, 0, 0))).toBe("2026-10-08 00:00");
    expect(formatSinceLabel(new Date(2026, 9, 8))).toBe("Thu 8 Oct");
  });
});

describe("getWeekendDays", () => {
  it("defaults to Fri/Sat and drops invalid values", () => {
    expect(getWeekendDays({})).toEqual(DEFAULT_WEEKEND_DAYS);
    expect(getWeekendDays({ weekendDays: [0, 6, 9, -1] })).toEqual([0, 6]);
    expect(getWeekendDays({ weekendDays: [] })).toEqual([]);
  });
});
