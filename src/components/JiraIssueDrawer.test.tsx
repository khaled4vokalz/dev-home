import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../hooks/useIssueDescription", () => ({
  useIssueDescription: () => ({ description: null, loading: false }),
}));

import { JiraIssueDrawer } from "./JiraIssueDrawer";

// Offcanvas checks a responsive breakpoint; jsdom has no matchMedia.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

describe("JiraIssueDrawer", () => {
  it("closes when the backdrop outside the drawer is clicked", async () => {
    const onHide = vi.fn();
    render(<JiraIssueDrawer issue={null} show={false} loadingKey="CCP-1" onHide={onHide} />);
    await screen.findByText("CCP-1");
    const backdrop = document.querySelector(".offcanvas-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("stays open on clicks inside the drawer", async () => {
    const onHide = vi.fn();
    render(<JiraIssueDrawer issue={null} show={false} loadingKey="CCP-1" onHide={onHide} />);
    fireEvent.click(await screen.findByText("CCP-1"));
    expect(onHide).not.toHaveBeenCalled();
  });
});
