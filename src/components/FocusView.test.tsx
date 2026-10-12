import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FocusView } from "./FocusView";
import type { RankedFocusItem } from "../services/focus";

const NOW = Date.now();

const mentionGroup: RankedFocusItem = {
  id: "mention:gh:o/r#7",
  kind: "mention",
  title: "OCP-2390: Build time improvements",
  url: "https://github.com/o/r/pull/7",
  updatedAt: NOW,
  score: 50,
  mentions: [
    { id: "mention:gh:2", who: "cid", snippet: "second ping", url: "https://c/2", at: NOW },
    { id: "mention:gh:1", who: "abu", snippet: "first ping", url: "https://c/1", at: NOW },
  ],
  signals: { ageDays: 0, isMention: true, isPinned: false },
};

describe("FocusView mention groups", () => {
  it("collapses mentions on one PR into a row that expands to list them", () => {
    render(
      <FocusView
        groups={{ pinned: [], topPriority: [mentionGroup], rest: [], snoozed: [], dismissed: [] }}
        loading={false}
        offline={false}
        onPin={vi.fn()}
        onSnooze={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getAllByText("OCP-2390: Build time improvements")).toHaveLength(1);
    expect(screen.queryByText("first ping")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /2 mentions/ }));
    expect(screen.getByText("second ping").closest("a")).toHaveAttribute("href", "https://c/2");
    expect(screen.getByText("first ping")).toBeInTheDocument();
  });
});
