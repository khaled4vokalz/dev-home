import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../api/jira/workday", () => ({
  getSprintTickets: vi.fn(),
  getOffSprintTickets: vi.fn(),
  getDoneSince: vi.fn(),
}));
vi.mock("../api/github", async (orig) => ({
  ...(await orig<typeof import("../api/github")>()),
  getMergedPrs: vi.fn(),
  getReviewedSince: vi.fn(),
}));

import * as jira from "../api/jira/workday";
import * as gh from "../api/github";
import { fetchWorkdayStable, fetchWorkdaySince } from "./workday";

describe("workday service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("isolates failures per part", async () => {
    vi.mocked(jira.getSprintTickets).mockRejectedValue(new Error("sprint boom"));
    vi.mocked(jira.getOffSprintTickets).mockResolvedValue({ issues: [] });
    const stable = await fetchWorkdayStable();
    expect(stable.sprint).toEqual({ data: null, error: "sprint boom" });
    expect(stable.offSprint).toEqual({ data: [], error: null });
  });

  it("passes since to the since-dependent fetches", async () => {
    const since = new Date("2026-10-08T00:00:00Z");
    vi.mocked(jira.getDoneSince).mockResolvedValue({ tickets: [] });
    vi.mocked(gh.getMergedPrs).mockResolvedValue({ prs: [] });
    vi.mocked(gh.getReviewedSince).mockRejectedValue(new Error("gh down"));
    const res = await fetchWorkdaySince(since);
    expect(jira.getDoneSince).toHaveBeenCalledWith(since, undefined);
    expect(gh.getMergedPrs).toHaveBeenCalledWith({ scope: "user", since });
    expect(res.doneTickets.data).toEqual([]);
    expect(res.merged.data).toEqual([]);
    expect(res.reviewed).toEqual({ data: null, error: "gh down" });
  });
});
