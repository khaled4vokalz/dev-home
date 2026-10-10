import type { GitHubPR, ReviewState } from "../../types";
import type { TicketRef, WorkdaySections } from "./types";

const REVIEW_WORD: Record<ReviewState, string> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes requested",
  COMMENTED: "commented",
};

/** "2d" / "5h" since `iso`. */
function shortAge(iso: string, now: Date): string {
  const hours = Math.max(1, Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`;
}

/** "app#12": repo short name + number, for PRs with no ticket. */
const repoRef = (pr: GitHubPR) => `${pr.repo_full_name.split("/").pop()}#${pr.number}`;

/** Append the off-sprint marker, merging it into a trailing "(no PR yet)". */
function offSprint(line: string, ticket: TicketRef | null): string {
  if (!ticket?.offSprint) return line;
  if (line.endsWith(" (no PR yet)"))
    return line.replace(/ \(no PR yet\)$/, " (off-sprint, no PR yet)");
  return `${line} (off-sprint)`;
}

/**
 * Slack-ready standup text: *Yesterday* (done), *Today* (working on +
 * reviewing) and *Blockers* (blockers + waiting + note lines). Each PR/ticket
 * appears once, Blockers taking priority over Today; empty headings are dropped.
 */
export function workdayToMarkdown(s: WorkdaySections, noteContent: string, now: Date): string {
  // Yesterday
  const yesterday: string[] = [];
  const reviewed: string[] = [];
  let reviewedAt = -1;
  for (const item of s.done.items) {
    if (item.kind === "merged") {
      const key = item.ticket ? `${item.ticket.key} ` : "";
      yesterday.push(offSprint(`Merged ${key}${item.pr.title} (#${item.pr.number})`, item.ticket));
    } else if (item.kind === "status") {
      yesterday.push(offSprint(`Moved ${item.ticket.key} to ${item.toStatus}`, item.ticket));
    } else {
      if (reviewedAt < 0) {
        reviewedAt = yesterday.length;
        yesterday.push("");
      }
      reviewed.push(`${item.ticket?.key ?? repoRef(item.pr)} (${REVIEW_WORD[item.state]})`);
    }
  }
  if (reviewedAt >= 0) yesterday[reviewedAt] = `Reviewed ${reviewed.join(", ")}`;

  // Blockers (computed first so Today can skip what's here)
  const blockers: string[] = [];
  const blockedPRs = new Set<string>();
  const blockedKeys = new Set<string>();
  const label = (pr: GitHubPR, ticket: TicketRef | null) => ticket?.key ?? pr.title;
  const addPR = (pr: GitHubPR, ticket: TicketRef | null, text: string) => {
    if (blockedPRs.has(pr.html_url)) return;
    blockedPRs.add(pr.html_url);
    blockers.push(offSprint(text, ticket));
  };
  const addTicket = (ticket: TicketRef, text: string) => {
    if (blockedKeys.has(ticket.key)) return;
    blockedKeys.add(ticket.key);
    blockers.push(offSprint(text, ticket));
  };
  for (const b of s.blockers.items) {
    if (b.kind === "flagged") addTicket(b.ticket, `${b.ticket.key} flagged in Jira`);
    else
      addPR(
        b.pr,
        b.ticket,
        `${label(b.pr, b.ticket)} #${b.pr.number} ${b.reasons.join(", ").toLowerCase()}`,
      );
  }
  for (const w of s.waiting.items) {
    if (w.kind === "code-review") {
      addTicket(w.ticket, `${w.ticket.key} in Code Review with ${w.reviewers.join(", ")}`);
    } else if (w.kind === "your-move") {
      addPR(w.pr, w.ticket, `${label(w.pr, w.ticket)} #${w.pr.number} approved, ready to merge`);
    } else {
      const from = w.reviewers.length > 0 ? ` from ${w.reviewers.join(", ")}` : "";
      addPR(
        w.pr,
        w.ticket,
        `${label(w.pr, w.ticket)} #${w.pr.number} waiting on review${from} (${shortAge(w.since, now)})`,
      );
    }
  }
  for (const raw of noteContent.split("\n")) {
    const line = raw.trim().replace(/^([-*•])\s+/, "");
    if (line) blockers.push(line);
  }

  // Today
  const today: string[] = [];
  for (const g of s.workingOn.items) {
    const prs = g.prs.filter((p) => !blockedPRs.has(p.html_url));
    if (g.ticket === null) {
      for (const p of prs) today.push(`${p.title} (#${p.number})`);
      continue;
    }
    if (g.prs.length > 0 && prs.length === 0) continue;
    if (g.prs.length === 0 && blockedKeys.has(g.ticket.key)) continue;
    const head = `${g.ticket.key} ${g.ticket.summary}`.trim();
    const line =
      prs.length === 0
        ? `${head} (no PR yet)`
        : `${head} — ${prs.map((p) => `#${p.number} ${p.draft ? "draft" : "in review"}`).join(", ")}`;
    today.push(offSprint(line, g.ticket));
  }
  const reviewLabels = [
    ...new Set(s.reviewing.items.flatMap((g) => (g.ticket ? [g.ticket.key] : g.prs.map(repoRef)))),
  ];
  if (reviewLabels.length > 0) today.push(`Reviewing ${reviewLabels.join(", ")}`);

  const block = (title: string, lines: string[]) =>
    lines.length === 0 ? null : [`*${title}*`, ...lines.map((l) => `• ${l}`)].join("\n");
  return [block("Yesterday", yesterday), block("Today", today), block("Blockers", blockers)]
    .filter((b): b is string => b !== null)
    .join("\n\n");
}
