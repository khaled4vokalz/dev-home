import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GitHubPR, JiraIssue, Note } from "../../types";

vi.mock("../../hooks/useWorkdayExtras", () => ({
  useWorkdayExtras: () => ({
    sprint: { data: [], error: null },
    offSprint: {
      data: [
        {
          key: "CHD-88",
          summary: "Preview links",
          status: { name: "To Do", statusCategory: { key: "new", colorName: "blue-gray" } },
          updated: "2026-10-05T00:00:00Z",
          codeReviewers: [],
          flagged: false,
          project: { key: "CHD", name: "C" },
        },
      ],
      error: null,
    },
    doneTickets: {
      data: [
        {
          key: "WMU-402",
          summary: "Delete",
          toStatus: "Code Review",
          changedAt: "2026-10-10T08:00:00Z",
        },
      ],
      error: null,
    },
    merged: { data: [], error: null },
    reviewed: { data: null, error: "GitHub down" },
  }),
}));

import { WorkdayView } from "./WorkdayView";

const NOW = new Date(2026, 9, 11, 10, 0);
const prs: GitHubPR[] = [
  {
    id: 1,
    number: 3310,
    title: "WMU-402 delete",
    html_url: "https://github.com/o/r/pull/3310",
    state: "open",
    draft: false,
    created_at: "2026-10-09T10:00:00Z",
    updated_at: "2026-10-10T10:00:00Z",
    user: { login: "me", avatar_url: "" },
    head: { ref: "WMU-402" },
    base: { ref: "main" },
    repo_full_name: "o/r",
    checks_status: null,
    checks: [],
    review_status: null,
    requested_reviewers: ["guru"],
  },
];

function renderView(extra: Partial<React.ComponentProps<typeof WorkdayView>> = {}) {
  const addNote = vi.fn(
    async (type, content, reference_id, title) =>
      ({ id: 7, type, content, reference_id, title }) as Note,
  );
  const editNote = vi.fn(async () => {});
  render(
    <WorkdayView
      configured
      openPRs={prs}
      reviewRequests={[]}
      reviewingPRs={[]}
      assignedIssues={[] as JiraIssue[]}
      allIssues={[] as JiraIssue[]}
      loading={false}
      jiraBaseUrl="https://example.atlassian.net"
      weekendDays={[5, 6]}
      refreshKey={0}
      onRefresh={() => {}}
      notes={[]}
      addNote={addNote}
      editNote={editNote}
      now={NOW}
      {...extra}
    />,
  );
  return { addNote, editNote };
}

describe("WorkdayView", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("renders all six sections, the off-sprint count, and a per-section error", () => {
    renderView();
    for (const title of [
      "Done since last workday",
      "Working on",
      "Reviewing",
      "Blockers / needs attention",
      "Waiting on others",
      "Assigned, not started",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Off-sprint · 1/ })).toBeTruthy();
    expect(screen.getByText(/GitHub down/)).toBeTruthy();
    expect(screen.getByText("Since Thu 8 Oct")).toBeTruthy();
    expect(screen.getAllByText("Off-sprint").length).toBeGreaterThan(0);
  });

  it("copies the standup markdown and confirms with a toast", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    renderView();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy standup" }));
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("*Yesterday*\n• Moved WMU-402 to Code Review"),
    );
    expect(screen.getByRole("status").textContent).toBe("Standup copied");
  });

  it("creates today's standup note once, then edits it", async () => {
    vi.useFakeTimers();
    const { addNote, editNote } = renderView();
    const box = screen.getByPlaceholderText(/Anything to raise at standup/);
    fireEvent.change(box, { target: { value: "Need prod access" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(addNote).toHaveBeenCalledWith(
      "standup",
      "Need prod access",
      "standup:2026-10-11",
      "Standup · Sun 11 Oct",
    );
    fireEvent.change(box, { target: { value: "Need prod access!" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(editNote).toHaveBeenCalledWith(7, { content: "Need prod access!" });
    expect(
      within(document.querySelector(".workday-preview") as HTMLElement).getByText(
        /Need prod access!/,
      ),
    ).toBeTruthy();
  });
});
