import type { GitHubPR, JiraIssue, JiraComment, GitHubComment, Note } from "../types";
import { getReferenceUrl } from "../utils/text";
import { jiraBrowseUrl } from "../utils/tickets";
import { parseTimestamp } from "../utils/time";

export type FocusKind = "pr-mine" | "pr-review" | "jira" | "mention" | "note";

/** One comment inside a grouped mention row. */
export interface FocusMention {
  id: string;
  who: string;
  snippet: string;
  url?: string;
  at: number;
}

export interface FocusItem {
  id: string;
  kind: FocusKind;
  title: string;
  url?: string;
  updatedAt: number;
  /** Mention rows: every mention on the same PR / ticket, newest first. */
  mentions?: FocusMention[];
  signals: {
    ageDays: number;
    jiraPriority?: "Highest" | "High" | "Medium" | "Low" | "Lowest";
    ciFailing?: boolean;
    isReviewRequested?: boolean;
    isMention?: boolean;
    isPinned: boolean;
    snoozedUntil?: number;
    isDismissed?: boolean;
  };
}

export interface MergeInput {
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  jiraIssues: JiraIssue[];
  jiraComments: JiraComment[];
  githubMentions: GitHubComment[];
  notes: Note[];
  jiraBaseUrl?: string;
}

const MS_PER_DAY = 86_400_000;

function ageDays(iso: string, now: number): number {
  return Math.max(0, (now - parseTimestamp(iso).getTime()) / MS_PER_DAY);
}

function prItem(pr: GitHubPR, kind: "pr-mine" | "pr-review", now: number): FocusItem {
  const id = `pr:${pr.repo_full_name}#${pr.number}`;
  const updatedAt = parseTimestamp(pr.updated_at).getTime();
  return {
    id,
    kind,
    title: pr.title,
    url: pr.html_url,
    updatedAt,
    signals: {
      ageDays: ageDays(pr.updated_at, now),
      ciFailing: pr.checks_status === "failure",
      isReviewRequested: kind === "pr-review",
      isPinned: false,
    },
  };
}

function jiraItem(j: JiraIssue, now: number, jiraBaseUrl?: string): FocusItem {
  return {
    id: `jira:${j.key}`,
    kind: "jira",
    title: `${j.key} — ${j.summary}`,
    url: jiraBrowseUrl(jiraBaseUrl, j.key),
    updatedAt: parseTimestamp(j.updated).getTime(),
    signals: {
      ageDays: ageDays(j.updated, now),
      jiraPriority: j.priority?.name as FocusItem["signals"]["jiraPriority"],
      isPinned: false,
    },
  };
}

/** One row per PR / ticket: its mentions newest first, ranked by the newest one. */
function mentionGroupItem(
  id: string,
  title: string,
  url: string | undefined,
  mentions: FocusMention[],
  now: number,
): FocusItem {
  const sorted = [...mentions].sort((a, b) => b.at - a.at);
  const newest = sorted[0];
  return {
    id,
    kind: "mention",
    title,
    url: sorted.length === 1 ? (newest.url ?? url) : url,
    updatedAt: newest.at,
    mentions: sorted,
    signals: {
      ageDays: Math.max(0, (now - newest.at) / MS_PER_DAY),
      isMention: true,
      isPinned: false,
    },
  };
}

/** Group values by key, keeping first-seen key order. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function jiraMentionItems(comments: JiraComment[], now: number, jiraBaseUrl?: string): FocusItem[] {
  return [...groupBy(comments, (c) => c.issueKey)].map(([key, group]) =>
    mentionGroupItem(
      `mention:jira:${key}`,
      group[0].issueSummary ? `${key}: ${group[0].issueSummary}` : key,
      jiraBrowseUrl(jiraBaseUrl, key),
      group.map((c) => ({
        id: `mention:jira:${c.id}`,
        who: c.author.displayName,
        snippet: c.body.text.slice(0, 160),
        url: jiraBrowseUrl(jiraBaseUrl, key),
        at: parseTimestamp(c.updated).getTime(),
      })),
      now,
    ),
  );
}

/** PR the comment belongs to, or the comment itself when it has none. */
const ghMentionKey = (c: GitHubComment) =>
  c.pr_number ? `${c.repo_full_name}#${c.pr_number}` : `comment:${c.id}`;

function ghMentionItems(comments: GitHubComment[], now: number): FocusItem[] {
  return [...groupBy(comments, ghMentionKey)].map(([key, group]) =>
    mentionGroupItem(
      `mention:gh:${key}`,
      group[0].context_title || group[0].body.slice(0, 80),
      group[0].pr_number
        ? `https://github.com/${group[0].repo_full_name}/pull/${group[0].pr_number}`
        : group[0].html_url,
      group.map((c) => ({
        id: `mention:gh:${c.id}`,
        who: c.user.login,
        snippet: c.body.slice(0, 160),
        url: c.html_url,
        at: parseTimestamp(c.updated_at).getTime(),
      })),
      now,
    ),
  );
}

function noteItem(n: Note, now: number, jiraBaseUrl?: string): FocusItem {
  return {
    id: `note:${n.id}`,
    kind: "note",
    title: n.title || n.content.slice(0, 80),
    url: getReferenceUrl(n, jiraBaseUrl ?? "") ?? undefined,
    updatedAt: parseTimestamp(n.updated_at).getTime(),
    signals: {
      ageDays: ageDays(n.updated_at, now),
      isPinned: false,
    },
  };
}

export function mergeSources(input: MergeInput, now: number = Date.now()): FocusItem[] {
  return [
    ...input.openPRs.map((p) => prItem(p, "pr-mine", now)),
    ...input.reviewRequests.map((p) => prItem(p, "pr-review", now)),
    ...input.jiraIssues.map((j) => jiraItem(j, now, input.jiraBaseUrl)),
    ...jiraMentionItems(input.jiraComments, now, input.jiraBaseUrl),
    ...ghMentionItems(input.githubMentions, now),
    ...input.notes.map((n) => noteItem(n, now, input.jiraBaseUrl)),
  ];
}

export const AGE_CAP = 40;
export const PINNED_BOOST = 1000;
export const CI_FAILING_BOOST = 30;

export const BASE_SCORE = {
  prMine: 30,
  prReview: 50,
  mention: 45,
  note: 20,
  jiraDefault: 25,
  jiraByPriority: {
    Highest: 60,
    High: 50,
    Medium: 30,
    Low: 15,
    Lowest: 10,
  } as const,
};

export interface RankedFocusItem extends FocusItem {
  score: number;
}

function baseScore(item: FocusItem): number {
  switch (item.kind) {
    case "pr-mine":
      return BASE_SCORE.prMine;
    case "pr-review":
      return BASE_SCORE.prReview;
    case "mention":
      return BASE_SCORE.mention;
    case "note":
      return BASE_SCORE.note;
    case "jira": {
      const p = item.signals.jiraPriority;
      if (p && p in BASE_SCORE.jiraByPriority) {
        return BASE_SCORE.jiraByPriority[p];
      }
      return BASE_SCORE.jiraDefault;
    }
  }
}

export function scoreItems(items: FocusItem[], now: number = Date.now()): RankedFocusItem[] {
  return items
    .filter((i) => !(i.signals.snoozedUntil && i.signals.snoozedUntil > now))
    .map<RankedFocusItem>((i) => {
      let score = baseScore(i);
      score += Math.min(i.signals.ageDays * 2, AGE_CAP);
      if (i.kind === "pr-mine" && i.signals.ciFailing) score += CI_FAILING_BOOST;
      if (i.signals.isPinned) score += PINNED_BOOST;
      return { ...i, score };
    })
    .sort((a, b) => b.score - a.score);
}

export interface SnoozePreset {
  label: string;
  until: number | null; // null = caller must pick (Custom)
}

export function snoozePresets(now: number = Date.now()): SnoozePreset[] {
  const fourHours = now + 4 * 60 * 60 * 1000;

  const d = new Date(now);
  const tomorrow9 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0, 0, 0).getTime();

  // Next Monday at 09:00 local. If today is Monday, jump 7 days ahead.
  const dow = d.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilNextMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  const nextMonday = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + daysUntilNextMonday,
    9,
    0,
    0,
    0,
  ).getTime();

  return [
    { label: "4h", until: fourHours },
    { label: "Tomorrow 9am", until: tomorrow9 },
    { label: "Next Monday", until: nextMonday },
    { label: "Custom…", until: null },
  ];
}
