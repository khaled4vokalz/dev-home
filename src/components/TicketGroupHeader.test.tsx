import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketGroupHeader } from "./TicketGroupHeader";

describe("TicketGroupHeader", () => {
  it("links the ticket out to Jira in a new tab and shows when it was updated", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(
      <TicketGroupHeader
        ticket="PROJ-1"
        jiraBaseUrl="https://example.atlassian.net"
        count={1}
        updatedAt={twoHoursAgo}
      />,
    );
    const link = screen.getByRole("link", { name: "Open PROJ-1 in Jira" });
    expect(link.getAttribute("href")).toBe("https://example.atlassian.net/browse/PROJ-1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("updated 2h ago")).toBeTruthy();
  });

  it("copies the ticket key without toggling the group", () => {
    const onCopyKey = vi.fn();
    const onToggle = vi.fn();
    render(
      <TicketGroupHeader ticket="PROJ-1" count={1} onCopyKey={onCopyKey} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy PROJ-1" }));
    expect(onCopyKey).toHaveBeenCalledWith("PROJ-1");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("omits the Jira link without a base URL or ticket", () => {
    render(<TicketGroupHeader ticket={null} jiraBaseUrl="https://x" count={2} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
