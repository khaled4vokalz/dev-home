import { jiraClient } from "../http";
import type { DoneTicket, OffSprintTicket, SprintTicket, StatusCategoryKey } from "../../types";
import { formatJqlDate } from "../../views/workday/dates";
import {
  BASE_ISSUE_FIELDS,
  FLAGGED_FIELD,
  SPRINT_FIELD,
  STORY_POINTS_FIELD,
  getMyself,
  mapIssue,
} from "./issues";

/** Upper bound on off-sprint tickets fetched across pages. */
const MAX_OFF_SPRINT = 200;
/** Upper bound on "done since" tickets. */
const MAX_DONE = 50;

const isFlagged = (f: any): boolean =>
  Array.isArray(f[FLAGGED_FIELD]) && f[FLAGGED_FIELD].length > 0;

/** Active sprint's name, else the first non-closed one, else null. */
function sprintNameOf(f: any): string | null {
  const sprints: any[] = Array.isArray(f[SPRINT_FIELD]) ? f[SPRINT_FIELD] : [];
  const active = sprints.find((s) => s?.state === "active");
  const open = active ?? sprints.find((s) => s?.state !== "closed");
  return open?.name ?? null;
}

/** Assigned, not-done tickets in any open sprint, with sprint name / points / flagged. */
export async function getSprintTickets(signal?: AbortSignal): Promise<{ tickets: SprintTicket[] }> {
  const jql = "assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done";
  const fields = ["summary", "status", SPRINT_FIELD, STORY_POINTS_FIELD, FLAGGED_FIELD];
  const { data } = await jiraClient().post(
    "/search/jql",
    { jql, fields, maxResults: 100 },
    { signal },
  );
  const tickets = (data.issues || []).map((issue: any): SprintTicket => {
    const f = issue.fields ?? {};
    return {
      key: issue.key,
      summary: f.summary ?? "",
      status: {
        name: f.status?.name ?? "",
        categoryKey: (f.status?.statusCategory?.key ?? "new") as StatusCategoryKey,
      },
      sprintName: sprintNameOf(f),
      points: typeof f[STORY_POINTS_FIELD] === "number" ? f[STORY_POINTS_FIELD] : null,
      flagged: isFlagged(f),
    };
  });
  return { tickets };
}

/**
 * Assigned, unresolved tickets outside every open sprint, updated in the last
 * 60 days. Feeds the Off-sprint indicator, not a section of its own.
 */
export async function getOffSprintTickets(
  signal?: AbortSignal,
): Promise<{ issues: OffSprintTicket[] }> {
  const jira = jiraClient();
  const jql =
    "assignee = currentUser() AND resolution = Unresolved AND (sprint is EMPTY OR sprint not in openSprints()) AND updated >= -60d ORDER BY updated DESC";
  const raw: any[] = [];
  let nextPageToken: string | undefined;
  do {
    const payload: Record<string, any> = {
      jql,
      fields: [...BASE_ISSUE_FIELDS, FLAGGED_FIELD],
      maxResults: 100,
    };
    if (nextPageToken) payload.nextPageToken = nextPageToken;
    const { data } = await jira.post("/search/jql", payload, { signal });
    raw.push(...(data.issues || []));
    nextPageToken = data.nextPageToken || undefined;
  } while (nextPageToken && raw.length < MAX_OFF_SPRINT);

  return {
    issues: raw
      .slice(0, MAX_OFF_SPRINT)
      .map((issue) => ({ ...mapIssue(issue), flagged: isFlagged(issue.fields ?? {}) })),
  };
}

/**
 * Tickets whose status the current user changed after `since`, with the latest
 * such change. Histories by other people are ignored when the current user can
 * be resolved; otherwise JQL's CHANGED BY is trusted.
 */
export async function getDoneSince(
  since: Date,
  signal?: AbortSignal,
): Promise<{ tickets: DoneTicket[] }> {
  const jql = `status CHANGED BY currentUser() AFTER "${formatJqlDate(since)}" ORDER BY updated DESC`;
  const { data } = await jiraClient().post(
    "/search/jql",
    { jql, fields: ["summary"], expand: "changelog", maxResults: MAX_DONE },
    { signal },
  );
  const issues: any[] = data.issues || [];
  const me = issues.length > 0 ? await getMyself() : null;
  const sinceMs = since.getTime();

  const tickets: DoneTicket[] = [];
  for (const issue of issues) {
    let latest: { at: number; created: string; to: string } | null = null;
    for (const h of issue.changelog?.histories || []) {
      if (me && h.author?.accountId !== me.accountId) continue;
      const at = new Date(h.created).getTime();
      if (Number.isNaN(at) || at < sinceMs) continue;
      const item = (h.items || []).find((i: any) => i.field === "status");
      if (!item) continue;
      if (!latest || at > latest.at) latest = { at, created: h.created, to: item.toString ?? "" };
    }
    if (latest) {
      tickets.push({
        key: issue.key,
        summary: issue.fields?.summary ?? "",
        toStatus: latest.to,
        changedAt: latest.created,
      });
    }
  }
  return { tickets };
}
