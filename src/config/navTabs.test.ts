import { describe, it, expect } from "vitest";
import { isTabVisible, NAV_GROUPS } from "./navTabs";
import { sourcesFor, PAGE_REFRESH } from "./tabData";

const ctx = { hiddenTabs: [] as string[], githubOrg: "acme" };

describe("isTabVisible", () => {
  it("rejects unknown keys, such as a stale saved tab", () => {
    expect(isTabVisible("jira-tasks", ctx)).toBe(false);
  });

  it("allows routable non-sidebar tabs", () => {
    expect(isTabVisible("settings", ctx)).toBe(true);
    expect(isTabVisible("team-dashboard", ctx)).toBe(true);
  });

  it("hides tabs hidden in settings", () => {
    expect(isTabVisible("board", { ...ctx, hiddenTabs: ["board"] })).toBe(false);
  });

  it("requires a GitHub org for org-scoped tabs", () => {
    for (const key of ["org-prs", "teams", "team-dashboard"]) {
      expect(isTabVisible(key, { ...ctx, githubOrg: "" })).toBe(false);
    }
    expect(isTabVisible("prs", { ...ctx, githubOrg: "" })).toBe(true);
  });
});

describe("workday tab", () => {
  it("sits right after Summary and is toggleable", () => {
    expect(NAV_GROUPS[0].tabs.map((t) => t.key).slice(0, 2)).toEqual(["summary", "workday"]);
    expect(isTabVisible("workday", ctx)).toBe(true);
    expect(isTabVisible("workday", { ...ctx, hiddenTabs: ["workday"] })).toBe(false);
  });

  it("loads the reused dashboard sources and has a page refresh", () => {
    expect(sourcesFor("workday", { boardEnabled: false })).toEqual([
      "openPRs",
      "reviewRequests",
      "jiraIssues",
      "jiraComments",
      "githubMentions",
      "notes",
    ]);
    expect(PAGE_REFRESH.workday.sources).toEqual([
      "openPRs",
      "reviewRequests",
      "jiraIssues",
      "jiraComments",
      "githubMentions",
    ]);
  });
});
