import type { GitHubPR } from "../../types";
import { extractTicketKey, ticketKeyOf } from "../../utils/tickets";
import { RED_CHECK_STATUSES } from "../../utils/prCategories";
import { groupUpdatedAt } from "./buildWorkday";
import { ciFailing, noReviewer, readyToMerge, worstState } from "./prState";
import type {
  FocusData,
  FocusInputs,
  MentionItem,
  NeedsItem,
  NeedsTier,
  WaitingOnAuthor,
  WorkingItem,
} from "./types";
import { NEEDS_TIER_ORDER } from "./types";

/** Mentions older than this are left out of Focus. */
const MENTION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const newestFirst = <T>(items: T[], at: (item: T) => string | null | undefined) =>
  [...items].sort((a, b) => time(at(b)) - time(at(a)));

/** "lint + unit failing", or "CI failing" when the failing checks aren't known. */
function failingChecks(pr: GitHubPR): string {
  const names = [
    ...new Set(pr.checks.filter((c) => RED_CHECK_STATUSES.has(c.status)).map((c) => c.name)),
  ];
  if (names.length === 0) return "CI failing";
  const shown = names.slice(0, 2).join(" + ");
  return `${shown}${names.length > 2 ? ` +${names.length - 2}` : ""} failing`;
}

const diffSize = (pr: GitHubPR) =>
  pr.additions != null && pr.deletions != null ? ` · +${pr.additions} −${pr.deletions}` : "";

/** The first "unblock yourself" rule an own PR matches, in table order. */
function selfNeed(pr: GitHubPR): Pick<NeedsItem, "verb" | "tone" | "reason"> | null {
  if (ciFailing(pr)) return { verb: "Fix CI", tone: "danger", reason: failingChecks(pr) };
  if (pr.has_conflict)
    return { verb: "Resolve conflict", tone: "danger", reason: `conflicts with ${pr.base.ref}` };
  if (pr.review_status === "CHANGES_REQUESTED")
    return { verb: "Address feedback", tone: "danger", reason: "changes requested" };
  if (noReviewer(pr))
    return { verb: "Request review", tone: "warning", reason: "no reviewer assigned" };
  return null;
}

/** The "Needs you" strip: tiered, one verb per PR, newest first within a tier. */
function buildNeeds(inp: FocusInputs): NeedsItem[] {
  const items: NeedsItem[] = [];
  const add = (tier: NeedsTier, pr: GitHubPR, need: Pick<NeedsItem, "verb" | "tone" | "reason">) =>
    items.push({ tier, pr, ticketKey: ticketKeyOf(pr), at: pr.updated_at, ...need });

  for (const pr of inp.openPRs) {
    if (pr.draft) continue;
    const need = selfNeed(pr);
    if (need) add("self", pr, need);
    else if (readyToMerge(pr))
      add("ship", pr, { verb: "Merge", tone: "success", reason: "approved · CI green" });
  }

  const requested = new Set(inp.reviewRequests.map((p) => p.html_url));
  for (const pr of inp.reviewRequests) {
    if (pr.viewer_engaged)
      add("others", pr, {
        verb: "Re-review",
        tone: "warning",
        reason: `${pr.user.login} re-requested`,
      });
    else
      add("others", pr, {
        verb: "Review",
        tone: "info",
        reason: `${pr.user.login} requested${diffSize(pr)}`,
      });
  }
  for (const pr of inp.reviewingPRs) {
    if (requested.has(pr.html_url)) continue;
    if (pr.new_commits_since_review && pr.viewer_review_state !== "APPROVED")
      add("others", pr, {
        verb: "Re-review",
        tone: "warning",
        reason: "new commits since your review",
      });
  }

  return NEEDS_TIER_ORDER.flatMap((tier) =>
    newestFirst(
      items.filter((i) => i.tier === tier),
      (i) => i.at,
    ),
  );
}

/** One line of a comment body, whitespace collapsed. */
const snippetOf = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith(">"))
    ?.replace(/\s+/g, " ")
    .slice(0, 200) ?? "";

function buildMentions(inp: FocusInputs, now: Date): MentionItem[] {
  const cutoff = now.getTime() - MENTION_WINDOW_MS;
  const items: MentionItem[] = [
    ...inp.githubMentions.map(
      (m): MentionItem => ({
        id: `gh:${m.id}`,
        source: "GitHub",
        who: m.user.login,
        ticketKey: extractTicketKey({ title: m.context_title }),
        where: `${m.repo_full_name.split("/").pop()}#${m.pr_number}`,
        snippet: snippetOf(m.body),
        at: m.created_at,
        url: m.html_url,
      }),
    ),
    ...inp.jiraMentions.map(
      (c): MentionItem => ({
        id: `jira:${c.id}`,
        source: "Jira",
        who: c.author.displayName,
        ticketKey: c.issueKey,
        where: c.issueKey,
        snippet: snippetOf(c.body.text),
        at: c.created,
        url: "",
      }),
    ),
  ];
  return newestFirst(
    items.filter((m) => time(m.at) >= cutoff),
    (m) => m.at,
  );
}

/** One line per active ticket (plus ticketless PRs), with the worst PR state as its badge. */
function buildWorking(inp: FocusInputs): WorkingItem[] {
  const items: WorkingItem[] = inp.workingOn.flatMap((g): WorkingItem[] =>
    g.ticket
      ? [{ ticket: g.ticket, prs: g.prs, state: worstState(g.prs), at: groupUpdatedAt(g) }]
      : g.prs.map((pr) => ({
          ticket: null,
          prs: [pr],
          state: worstState([pr]),
          at: pr.updated_at,
        })),
  );
  return newestFirst(items, (i) => i.at);
}

function buildWaiting(inp: FocusInputs): FocusData["waiting"] {
  const onReviewers = newestFirst(
    inp.openPRs
      .filter(
        (pr) =>
          !pr.draft &&
          !pr.in_merge_queue &&
          !selfNeed(pr) &&
          pr.review_status !== "APPROVED" &&
          (pr.requested_reviewers ?? []).length > 0,
      )
      .map((pr) => ({
        pr,
        ticketKey: ticketKeyOf(pr),
        reviewers: pr.requested_reviewers ?? [],
        since: pr.created_at,
      })),
    (w) => w.pr.updated_at,
  );

  const requested = new Set(inp.reviewRequests.map((p) => p.html_url));
  const onAuthor: WaitingOnAuthor[] = [];
  const approved: WaitingOnAuthor[] = [];
  for (const pr of inp.reviewingPRs) {
    if (requested.has(pr.html_url)) continue;
    const state = pr.viewer_review_state ?? null;
    const item = { pr, ticketKey: ticketKeyOf(pr), state, at: pr.viewer_reviewed_at ?? null };
    if (state === "APPROVED") approved.push(item);
    else if (!pr.new_commits_since_review) onAuthor.push(item);
  }
  const at = (w: WaitingOnAuthor) => w.pr.updated_at;
  return { onReviewers, onAuthor: newestFirst(onAuthor, at), approved: newestFirst(approved, at) };
}

/** Compose Focus mode from the same data Standup uses. */
export function buildFocus(inp: FocusInputs, now: Date): FocusData {
  return {
    needs: buildNeeds(inp),
    mentions: buildMentions(inp, now),
    working: buildWorking(inp),
    waiting: buildWaiting(inp),
  };
}
