import type { Note } from "../types";
import type { BadgeVariant } from "../components/primitives/Badge";

/** Badge shown for a note's type, shared by Summary, Kanban, Notes and Focus. */
export function noteBadge(note: Pick<Note, "type">): {
  label: string;
  variant: BadgeVariant;
  /** Longer human name, e.g. for a detail subtitle. */
  description: string;
} {
  switch (note.type) {
    case "jira_ticket":
      return { label: "JIRA", variant: "info", description: "JIRA Ticket" };
    case "github_pr":
      return { label: "PR", variant: "success", description: "GitHub PR" };
    case "free_text":
      return { label: "Note", variant: "purple", description: "Note" };
    case "standup":
      return { label: "Standup", variant: "purple", description: "Standup note" };
    default:
      return { label: "Link", variant: "neutral", description: "Link" };
  }
}
