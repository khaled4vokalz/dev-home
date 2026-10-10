import { describe, it, expect } from "vitest";
import type { GitHubPR, JiraIssue, SprintTicket, OffSprintTicket } from "../../types";
import { EMPTY_EXTRAS, type WorkdayExtras } from "../../services/workday";
import { buildWorkday, filterWorkday, statusCategoryOf } from "./buildWorkday";
import type { WorkdayInputs } from "./types";

const NOW = new Date("2026-10-11T10:00:00Z");

function pr(n: number, o: Partial<GitHubPR> = {}): GitHubPR {
  return {
    id: n,
    number: n,
    title: `PR ${n}`,
    html_url: `https://github.com/o/r/pull/${n}`,
    state: "open",
    draft: false,
    created_at: "2026-10-09T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: `feature/x-${n}` },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: ["guru"],
    ...o,
  };
}

function issue(
  key: string,
  cat: "new" | "indeterminate" | "done",
  o: Partial<JiraIssue> = {},
): JiraIssue {
  return {
    key,
    summary: `Summary ${key}`,
    status: {
      name: cat === "new" ? "To Do" : cat === "done" ? "Done" : "In Progress",
      statusCategory: { key: cat, colorName: "x" },
    },
    priority: { name: "Medium", iconUrl: "" },
    assignee: { displayName: "Me", avatarUrls: { "48x48": "" } },
    project: { key: key.split("-")[0], name: "P" },
    created: "2026-09-01T00:00:00Z",
    updated: "2026-10-05T00:00:00Z",
    codeReviewers: [],
    ...o,
  } as JiraIssue;
}

const sprintT = (key: string, o: Partial<SprintTicket> = {}): SprintTicket => ({
  key,
  summary: `Summary ${key}`,
  status: { name: "To Do", categoryKey: "new" },
  sprintName: "Sprint 42",
  points: 3,
  flagged: false,
  ...o,
});

const off = (i: JiraIssue, flagged = false): OffSprintTicket => ({ ...i, flagged });

function inputs(
  o: Partial<Omit<WorkdayInputs, "extras">> & { extras?: Partial<WorkdayExtras> } = {},
): WorkdayInputs {
  const { extras, ...rest } = o;
  return {
    openPRs: [],
    reviewRequests: [],
    reviewingPRs: [],
    assignedIssues: [],
    allIssues: [],
    ...rest,
    extras: {
      ...EMPTY_EXTRAS,
      sprint: { data: [], error: null },
      offSprint: { data: [], error: null },
      doneTickets: { data: [], error: null },
      merged: { data: [], error: null },
      reviewed: { data: [], error: null },
      ...extras,
    },
  };
}

describe("statusCategoryOf", () => {
  it("prefers the key and falls back to colour", () => {
    expect(statusCategoryOf(issue("AA-1", "indeterminate"))).toBe("indeterminate");
    const legacy = issue("AA-2", "new");
    (legacy.status.statusCategory as any) = { colorName: "yellow" };
    expect(statusCategoryOf(legacy)).toBe("indeterminate");
  });
});

describe("buildWorkday", () => {
  it("groups my PRs by ticket, adds in-progress tickets without a PR, puts No ticket last", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "No key here" }),
          pr(2, { title: "CCP-1 a" }),
          pr(3, { title: "CCP-1 b" }),
        ],
        assignedIssues: [
          issue("CCP-1", "indeterminate"),
          issue("CCP-2", "indeterminate"),
          issue("CCP-3", "new"),
        ],
        extras: {
          sprint: { data: [sprintT("CCP-1"), sprintT("CCP-2"), sprintT("CCP-3")], error: null },
        },
      }),
      NOW,
    );
    const groups = s.workingOn.items.map((g) => [
      g.ticket?.key ?? null,
      g.prs.map((p) => p.number),
    ]);
    expect(groups).toEqual([
      ["CCP-1", [2, 3]],
      ["CCP-2", []],
      [null, [1]],
    ]);
    expect(s.workingOn.items[0].ticket).toMatchObject({
      summary: "Summary CCP-1",
      statusName: "In Progress",
      offSprint: false,
    });
  });

  it("flags assigned tickets missing from open sprints and routes them by state", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [pr(5, { title: "CHD-9 fix" })],
        assignedIssues: [issue("CHD-9", "indeterminate"), issue("CHD-7", "indeterminate")],
        extras: {
          sprint: { data: [], error: null },
          offSprint: {
            data: [
              off(issue("CHD-88", "new", { updated: "2026-10-01T00:00:00Z" }), true),
              off(issue("CHD-50", "new", { updated: "2026-07-01T00:00:00Z" })), // > 60d old
            ],
            error: null,
          },
        },
      }),
      NOW,
    );
    expect(s.workingOn.items.map((g) => [g.ticket?.key, g.ticket?.offSprint])).toEqual([
      ["CHD-9", true],
      ["CHD-7", true], // in progress, no PR, kept regardless of age
    ]);
    expect(s.notStarted.offSprintItems.map((i) => i.ticket.key)).toEqual(["CHD-88"]);
    expect(s.blockers.items).toEqual([
      { kind: "flagged", ticket: expect.objectContaining({ key: "CHD-88", offSprint: true }) },
    ]);
    expect(s.offSprintCount).toBe(3);
  });

  it("flags nothing while sprint data is unavailable", () => {
    const s = buildWorkday(
      inputs({
        assignedIssues: [issue("AA-1", "new")],
        extras: { sprint: { data: null, error: "boom" } },
      }),
      NOW,
    );
    expect(s.notStarted.items.map((i) => [i.ticket.key, i.ticket.offSprint, i.sprintName])).toEqual(
      [["AA-1", false, null]],
    );
    expect(s.notStarted.error).toBe("boom");
    expect(s.offSprintCount).toBe(0);
  });

  it("lists not-started sprint tickets with sprint name and points, excluding ones with a PR", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [pr(9, { title: "AA-2 started" })],
        assignedIssues: [issue("AA-1", "new"), issue("AA-2", "new")],
        extras: {
          sprint: { data: [sprintT("AA-1", { points: 5 }), sprintT("AA-2")], error: null },
        },
      }),
      NOW,
    );
    expect(s.notStarted.items).toEqual([
      {
        ticket: expect.objectContaining({ key: "AA-1" }),
        sprintName: "Sprint 42",
        points: 5,
        updated: "2026-10-05T00:00:00Z",
      },
    ]);
  });

  it("dedupes reviewing by URL and never flags it", () => {
    const shared = pr(20, { title: "OTHER-1 x", user: { login: "bob", avatar_url: "" } });
    const s = buildWorkday(
      inputs({
        reviewRequests: [shared],
        reviewingPRs: [shared, pr(21, { title: "OTHER-2 y" })],
        extras: { sprint: { data: [], error: null } },
      }),
      NOW,
    );
    expect(s.reviewing.items.flatMap((g) => g.prs.map((p) => p.number))).toEqual([20, 21]);
    expect(s.reviewing.items.every((g) => g.ticket === null || g.ticket.offSprint === false)).toBe(
      true,
    );
    expect([...s.reviewRequestedUrls]).toEqual([shared.html_url]);
  });

  it("selects blockers and waiting items", () => {
    const s = buildWorkday(
      inputs({
        openPRs: [
          pr(1, { title: "AA-1 red", checks_status: "FAILURE" }),
          pr(2, { title: "AA-2 lonely", requested_reviewers: [] }),
          pr(3, { title: "AA-3 waiting" }),
          pr(4, { title: "AA-4 approved", review_status: "APPROVED" }),
          pr(5, { title: "AA-5 draft", draft: true }),
        ],
        assignedIssues: [
          issue("AA-6", "indeterminate", {
            status: {
              name: "Code Review",
              statusCategory: { key: "indeterminate", colorName: "yellow" },
            },
            codeReviewers: [{ displayName: "Guru Gayen", avatarUrls: { "48x48": "" } }],
          } as Partial<JiraIssue>),
        ],
        extras: { sprint: { data: [sprintT("AA-6")], error: null } },
      }),
      NOW,
    );
    expect(
      s.blockers.items.map((b) => (b.kind === "pr" ? [b.pr.number, b.reasons] : b.kind)),
    ).toEqual([
      [1, ["CI failed"]],
      [2, ["No reviewer requested"]],
    ]);
    expect(
      s.waiting.items.map((w) =>
        w.kind === "code-review" ? [w.kind, w.ticket.key, w.reviewers] : [w.kind, w.pr.number],
      ),
    ).toEqual([
      ["awaiting-review", 3],
      ["your-move", 4],
      ["code-review", "AA-6", ["Guru Gayen"]],
    ]);
  });

  it("merges done items newest first and joins errors", () => {
    const s = buildWorkday(
      inputs({
        extras: {
          merged: {
            data: [pr(1, { title: "CCP-1 m", merged_at: "2026-10-09T10:00:00Z" })],
            error: null,
          },
          reviewed: { data: null, error: "gh down" },
          doneTickets: {
            data: [
              {
                key: "WMU-402",
                summary: "Del",
                toStatus: "Code Review",
                changedAt: "2026-10-10T08:00:00Z",
              },
            ],
            error: null,
          },
        },
      }),
      NOW,
    );
    expect(s.done.items.map((d) => d.kind)).toEqual(["status", "merged"]);
    expect(s.done.error).toBe("gh down");
    expect(s.done.loading).toBe(false);
  });

  it("counts off-sprint tickets in done items", () => {
    const s = buildWorkday(
      inputs({
        assignedIssues: [issue("OFF-99", "done")],
        extras: {
          sprint: { data: [], error: null },
          merged: {
            data: [pr(1, { title: "OFF-99 merged", merged_at: "2026-10-09T10:00:00Z" })],
            error: null,
          },
        },
      }),
      NOW,
    );
    expect(s.done.items).toHaveLength(1);
    expect(s.done.items[0].ticket?.offSprint).toBe(true);
    expect(s.offSprintCount).toBe(1);
  });
});

describe("filterWorkday", () => {
  const s = buildWorkday(
    inputs({
      openPRs: [
        pr(1, { title: "IN-1 a" }),
        pr(2, { title: "OUT-1 b" }),
        pr(3, { title: "no key" }),
      ],
      reviewRequests: [pr(4, { title: "RR-1 r" })],
      assignedIssues: [issue("IN-1", "indeterminate"), issue("OUT-1", "indeterminate")],
      extras: { sprint: { data: [sprintT("IN-1")], error: null } },
    }),
    NOW,
  );

  it("sprint only hides off-sprint and keeps no-ticket PRs", () => {
    const f = filterWorkday(s, "sprint");
    expect(f.workingOn.items.map((g) => g.ticket?.key ?? null)).toEqual(["IN-1", null]);
    expect(f.reviewing.items).toHaveLength(1);
    expect(f.reviewing.items[0].ticket?.key).toBe("RR-1");
    expect(f.offSprintCount).toBe(1);
  });

  it("off-sprint shows only flagged items", () => {
    const f = filterWorkday(s, "off");
    expect(f.workingOn.items.map((g) => g.ticket?.key ?? null)).toEqual(["OUT-1"]);
    expect(f.reviewing.items).toHaveLength(0);
  });

  it("all is identity", () => {
    expect(filterWorkday(s, "all")).toBe(s);
  });
});
