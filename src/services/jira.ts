import { JiraIssue, JiraComment } from "../types";
import { getIssues, postIssuesBulk, getJiraMentions } from "../api/jira";
import { SETTINGS_EVENT } from "./config";

export async function fetchAssignedIssues(signal?: AbortSignal): Promise<JiraIssue[]> {
  const { issues } = await getIssues(signal);
  return issues;
}

/**
 * Fetch issues by key. `withDetail` (default true) includes description and
 * issue type; list enrichment passes false to keep payloads and cache small.
 */
export async function fetchIssuesByKeys(
  keys: string[],
  opts: { withDetail?: boolean; signal?: AbortSignal } = {},
): Promise<JiraIssue[]> {
  if (keys.length === 0) return [];
  const { issues } = await postIssuesBulk({ keys, ...opts });
  return issues;
}

export async function fetchRecentMentions(signal?: AbortSignal): Promise<JiraComment[]> {
  const { comments } = await getJiraMentions(signal);
  return comments;
}

// Descriptions shared across every drawer/modal for the session, so reopening an
// issue (even from another tab or after a remount) never refetches. Failures are
// evicted so the next open retries.
const descriptionCache = new Map<string, Promise<string>>();
// Full issues opened in the drawer, kept for an hour so reopening is instant.
// The drawer's reload button bypasses it with `force`.
const ISSUE_DETAIL_TTL_MS = 60 * 60 * 1000;
const issueDetailCache = new Map<string, { at: number; pending: Promise<JiraIssue | null> }>();
// Keys are only unique per Jira site, so a settings change starts over.
if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_EVENT, () => {
    descriptionCache.clear();
    issueDetailCache.clear();
  });
}

/** Fetch one issue with detail for the drawer, cached for an hour unless `force`d. */
export function fetchIssueDetail(
  key: string,
  opts: { force?: boolean } = {},
): Promise<JiraIssue | null> {
  const cached = issueDetailCache.get(key);
  if (!opts.force && cached && Date.now() - cached.at < ISSUE_DETAIL_TTL_MS) {
    return cached.pending;
  }
  if (opts.force) descriptionCache.delete(key);
  const pending = fetchIssuesByKeys([key]).then((issues) => issues[0] ?? null);
  const entry = { at: Date.now(), pending };
  // Only evict our own entry, so a failed stale request can't drop a newer one.
  pending.then(
    (issue) => {
      if (!issue && issueDetailCache.get(key) === entry) issueDetailCache.delete(key);
    },
    () => {
      if (issueDetailCache.get(key) === entry) issueDetailCache.delete(key);
    },
  );
  issueDetailCache.set(key, entry);
  return pending;
}

/** Lazily fetch (and cache) an issue's description as markdown. */
export function fetchIssueDescription(key: string): Promise<string> {
  let pending = descriptionCache.get(key);
  if (!pending) {
    pending = fetchIssuesByKeys([key]).then((issues) => issues[0]?.description || "");
    pending.catch(() => descriptionCache.delete(key));
    descriptionCache.set(key, pending);
  }
  return pending;
}
