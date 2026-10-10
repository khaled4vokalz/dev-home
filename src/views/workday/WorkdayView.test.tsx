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
import { WorkdaySection } from "./WorkdaySection";

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
  const view = (more: Partial<React.ComponentProps<typeof WorkdayView>>) => (
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
      notesLoaded
      addNote={addNote}
      editNote={editNote}
      now={NOW}
      {...extra}
      {...more}
    />
  );
  const { rerender } = render(view({}));
  return {
    addNote,
    editNote,
    rerender: (more: Partial<React.ComponentProps<typeof WorkdayView>>) => rerender(view(more)),
  };
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

  it("titles the done section after the lookback", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "3 days" }));
    expect(screen.getByText("Done in the last 3 days")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(screen.getByText("Done in the last 7 days")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Last workday" }));
    expect(screen.getByText("Done since last workday")).toBeTruthy();
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

  const typeNote = async (value: string) => {
    fireEvent.change(screen.getByPlaceholderText(/Anything to raise at standup/), {
      target: { value },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
  };

  it("shows a save error instead of the hint when autosave fails, and retries the create", async () => {
    vi.useFakeTimers();
    const addNote = vi
      .fn()
      .mockRejectedValueOnce(new Error("db locked"))
      .mockImplementation(
        async (type, content, reference_id, title) =>
          ({ id: 8, type, content, reference_id, title }) as Note,
      );
    renderView({ addNote });
    await typeNote("Need prod access");
    expect(screen.getByText(/Couldn't save — will retry on next edit/)).toBeTruthy();
    expect(screen.queryByText(/Saved to Notes as/)).toBeNull();

    await typeNote("Need prod access!");
    expect(addNote).toHaveBeenCalledTimes(2);
    expect(addNote).toHaveBeenLastCalledWith(
      "standup",
      "Need prod access!",
      "standup:2026-10-11",
      "Standup · Sun 11 Oct",
    );
    expect(screen.queryByText(/Couldn't save/)).toBeNull();
    expect(screen.getByText(/Saved to Notes as/)).toBeTruthy();
  });

  it("folds keystrokes made during an in-flight create into one follow-up edit", async () => {
    vi.useFakeTimers();
    let resolveCreate: (n: Note) => void = () => {};
    const addNote = vi.fn(() => new Promise<Note>((r) => (resolveCreate = r)));
    const editNote = vi.fn(async () => {});
    renderView({ addNote, editNote });
    await typeNote("one");
    await typeNote("one two");
    await typeNote("one two three");
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(editNote).not.toHaveBeenCalled();
    await act(async () => {
      resolveCreate({ id: 11, type: "standup", content: "one" } as Note);
    });
    expect(addNote).toHaveBeenCalledTimes(1);
    expect(editNote).toHaveBeenCalledTimes(1);
    expect(editNote).toHaveBeenCalledWith(11, { content: "one two three" });
  });

  it("holds the create until notes load, then edits today's existing note", async () => {
    vi.useFakeTimers();
    const { addNote, editNote, rerender } = renderView({ notesLoaded: false });
    await typeNote("Need prod access");
    expect(addNote).not.toHaveBeenCalled();
    const existing = {
      id: 42,
      type: "standup",
      content: "old",
      reference_id: "standup:2026-10-11",
      title: "Standup · Sun 11 Oct",
    } as Note;
    await act(async () => {
      rerender({ notesLoaded: true, notes: [existing] });
    });
    expect(addNote).not.toHaveBeenCalled();
    expect(editNote).toHaveBeenCalledWith(42, { content: "Need prod access" });
  });

  it("doesn't create a note for whitespace-only text", async () => {
    vi.useFakeTimers();
    const { addNote } = renderView();
    await typeNote("   ");
    expect(addNote).not.toHaveBeenCalled();
  });
});

describe("WorkdaySection", () => {
  it("hides the empty line when there is an error", () => {
    render(
      <WorkdaySection
        id="done"
        title="Done"
        count={0}
        loading={false}
        error="Jira down"
        empty="Nothing here"
      >
        {null}
      </WorkdaySection>,
    );
    expect(screen.getByText("Jira down")).toBeTruthy();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("collapses and expands from the header, remembering the choice", () => {
    localStorage.clear();
    const view = () => (
      <WorkdaySection
        id="workingOn"
        title="Working on"
        count={1}
        loading={false}
        error={null}
        empty=""
      >
        <div>row one</div>
      </WorkdaySection>
    );
    const { unmount } = render(view());
    const toggle = screen.getByRole("button", { name: /Working on/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.queryByText("row one")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    unmount();

    render(view());
    expect(screen.queryByText("row one")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Working on/ }));
    expect(screen.getByText("row one")).toBeTruthy();
  });
});
