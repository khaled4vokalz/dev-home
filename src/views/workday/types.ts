import type { GitHubPR, JiraIssue, ReviewState } from "../../types";
import type { WorkdayExtras } from "../../services/workday";

export interface WorkdayInputs {
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  reviewingPRs: GitHubPR[];
  /** Tickets assigned to me (useDashboard's assignedJiraIssues). */
  assignedIssues: JiraIssue[];
  /** Assigned ∪ PR-referenced tickets (useDashboard's jiraIssues), for summaries. */
  allIssues: JiraIssue[];
  extras: WorkdayExtras;
}

export interface TicketRef {
  key: string;
  summary: string;
  statusName: string | null;
  offSprint: boolean;
}

/** A ticket with my PRs under it; `prs` empty → "No PR yet"; `ticket` null → "No ticket". */
export interface TicketGroup {
  ticket: TicketRef | null;
  prs: GitHubPR[];
}

export type DoneItem =
  | { kind: "merged"; pr: GitHubPR; ticket: TicketRef | null; at: string }
  | { kind: "reviewed"; pr: GitHubPR; ticket: TicketRef | null; state: ReviewState; at: string }
  | { kind: "status"; ticket: TicketRef; toStatus: string; at: string };

export type BlockerItem =
  | { kind: "pr"; pr: GitHubPR; ticket: TicketRef | null; reasons: string[] }
  | { kind: "flagged"; ticket: TicketRef };

export type WaitingItem =
  | {
      kind: "awaiting-review";
      pr: GitHubPR;
      ticket: TicketRef | null;
      reviewers: string[];
      since: string;
    }
  | { kind: "your-move"; pr: GitHubPR; ticket: TicketRef | null }
  | { kind: "code-review"; ticket: TicketRef; reviewers: string[] };

export interface NotStartedItem {
  ticket: TicketRef;
  sprintName: string | null;
  points: number | null;
  updated: string | null;
}

export interface Section<T> {
  items: T[];
  loading: boolean;
  error: string | null;
}

export interface WorkdaySections {
  done: Section<DoneItem>;
  workingOn: Section<TicketGroup>;
  reviewing: Section<TicketGroup>;
  /** html_urls of reviewing PRs where my review is (re-)requested. */
  reviewRequestedUrls: Set<string>;
  blockers: Section<BlockerItem>;
  waiting: Section<WaitingItem>;
  notStarted: Section<NotStartedItem> & { offSprintItems: NotStartedItem[] };
  /** Distinct off-sprint ticket keys shown anywhere on the page. */
  offSprintCount: number;
}

export type SprintFilter = "all" | "sprint" | "off";
