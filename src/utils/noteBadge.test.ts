import { describe, it, expect } from "vitest";
import { noteBadge } from "./noteBadge";

describe("noteBadge", () => {
  it.each([
    ["jira_ticket", "JIRA", "info", "JIRA Ticket"],
    ["github_pr", "PR", "success", "GitHub PR"],
    ["free_text", "Note", "purple", "Note"],
    ["link", "Link", "neutral", "Link"],
    ["standup", "Standup", "purple", "Standup note"],
  ] as const)("%s → %s/%s", (type, label, variant, description) => {
    expect(noteBadge({ type })).toEqual({ label, variant, description });
  });
});
