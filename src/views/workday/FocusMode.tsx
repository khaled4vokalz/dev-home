import { useState } from "react";
import type { GitHubPR } from "../../types";
import type { StateBadge } from "./prState";
import { useOptionalJiraDrawer } from "../../context/JiraDrawerContext";
import { WorkdaySection } from "./WorkdaySection";
import { NeedsYouStrip } from "./NeedsYouStrip";
import { OffSprintPill, TicketKey, WorkdayItemRow, WorkdaySubhead } from "./CompactRow";
import { compactAge } from "./dates";
import { repoRef, titleWithoutKey } from "./prState";
import type { FocusData, WaitingOnAuthor } from "./types";

type SectionToggle = (id: string) => { collapsed: boolean; onToggle: () => void };

interface FocusModeProps {
  focus: FocusData;
  /** Open PRs / review requests still loading. */
  loading: boolean;
  mentionsLoading: boolean;
  jiraBaseUrl: string;
  now: Date;
  sectionToggle: SectionToggle;
  onOpen: (pr: GitHubPR) => void;
  onCopyLink: (url: string) => void;
}

/** "You requested changes · 3d" for a review that's waiting on its author. */
function authorBadge(w: WaitingOnAuthor, now: Date): StateBadge {
  const age = w.at ? ` · ${compactAge(w.at, now)}` : "";
  if (w.state === "CHANGES_REQUESTED")
    return { label: `You requested changes${age}`, tone: "danger" };
  if (w.state === "COMMENTED") return { label: `You commented${age}`, tone: "info" };
  if (w.state === "APPROVED") return { label: `You approved${age}`, tone: "success" };
  return { label: "You reviewed", tone: "info" };
}

/** Focus mode: what needs me, mentions, what I'm on, and what I'm waiting on. */
export function FocusMode({
  focus,
  loading,
  mentionsLoading,
  jiraBaseUrl,
  now,
  sectionToggle,
  onOpen,
  onCopyLink,
}: FocusModeProps) {
  const openIssue = useOptionalJiraDrawer();
  const [showApproved, setShowApproved] = useState(false);
  const { needs, mentions, working, waiting } = focus;
  const waitingCount =
    waiting.onReviewers.length + waiting.onAuthor.length + waiting.approved.length;

  const prRow = (pr: GitHubPR, ticketKey: string | null, badge: StateBadge, sub: string) => (
    <WorkdayItemRow
      key={pr.html_url}
      kind="pr"
      ticketKey={ticketKey}
      jiraBaseUrl={jiraBaseUrl}
      title={titleWithoutKey(pr.title, ticketKey)}
      sub={sub}
      badge={badge}
      time={compactAge(pr.updated_at, now)}
      url={pr.html_url}
      onCopyLink={onCopyLink}
      onClick={() => onOpen(pr)}
    />
  );

  return (
    <div className="workday-focus">
      <NeedsYouStrip
        {...sectionToggle("needs")}
        items={needs}
        loading={loading}
        error={null}
        jiraBaseUrl={jiraBaseUrl}
        now={now}
        onOpen={onOpen}
      />

      <WorkdaySection
        {...sectionToggle("mentions")}
        title="Mentions"
        count={mentions.length}
        loading={mentionsLoading}
        error={null}
        hint="last 3 days"
        empty="No mentions in the last 3 days"
      >
        {mentions.map((m) => (
          <div
            key={m.id}
            className="workday-mention"
            role="button"
            tabIndex={0}
            onClick={() =>
              m.source === "Jira"
                ? openIssue?.(m.where)
                : window.open(m.url, "_blank", "noopener,noreferrer")
            }
          >
            <span className="workday-mention-src">{m.source}</span>
            <span className="workday-mention-main">
              <span className="workday-mention-line1">
                <span className="workday-mention-who">{m.who}</span>
                {m.ticketKey && <TicketKey ticketKey={m.ticketKey} jiraBaseUrl={jiraBaseUrl} />}
                {m.where !== m.ticketKey && (
                  <span className="workday-mention-where">{m.where}</span>
                )}
              </span>
              <span className="workday-mention-snippet">{m.snippet}</span>
            </span>
            <span className="workday-item-time">{compactAge(m.at, now)}</span>
          </div>
        ))}
      </WorkdaySection>

      <WorkdaySection
        {...sectionToggle("working")}
        title="Working on"
        count={working.length}
        loading={loading}
        error={null}
        hint="your active tickets"
        empty="No open PRs or in-progress tickets"
      >
        {working.map((w) => {
          if (!w.ticket) {
            const pr = w.prs[0];
            return prRow(pr, null, w.state, `${repoRef(pr)} · no ticket`);
          }
          const { ticket } = w;
          const prCount =
            w.prs.length > 0 ? ` · ${w.prs.length} PR${w.prs.length > 1 ? "s" : ""}` : "";
          return (
            <WorkdayItemRow
              key={ticket.key}
              kind="ticket"
              ticketKey={ticket.key}
              jiraBaseUrl={jiraBaseUrl}
              title={ticket.summary || ticket.key}
              extra={ticket.offSprint && <OffSprintPill />}
              sub={`${ticket.statusName ?? "—"}${prCount}`}
              badge={w.state}
              time={w.at && compactAge(w.at, now)}
              onClick={() => openIssue?.(ticket.key)}
            />
          );
        })}
      </WorkdaySection>

      <WorkdaySection
        {...sectionToggle("waiting")}
        title="Waiting on others"
        count={waitingCount}
        loading={loading}
        error={null}
        hint="nothing for you to do · useful for nudging"
        empty="Not waiting on anyone"
      >
        {waiting.onReviewers.length > 0 && (
          <WorkdaySubhead>Your PRs, waiting on reviewers</WorkdaySubhead>
        )}
        {waiting.onReviewers.map((w) =>
          prRow(
            w.pr,
            w.ticketKey,
            { label: `${w.reviewers.join(", ")} · ${compactAge(w.since, now)}`, tone: "neutral" },
            repoRef(w.pr),
          ),
        )}
        {waiting.onAuthor.length > 0 && <WorkdaySubhead>Reviews, waiting on author</WorkdaySubhead>}
        {waiting.onAuthor.map((w) =>
          prRow(w.pr, w.ticketKey, authorBadge(w, now), `${w.pr.user.login} · ${repoRef(w.pr)}`),
        )}
        {showApproved &&
          waiting.approved.map((w) =>
            prRow(w.pr, w.ticketKey, authorBadge(w, now), `${w.pr.user.login} · ${repoRef(w.pr)}`),
          )}
        {waiting.approved.length > 0 && (
          <button type="button" className="workday-more" onClick={() => setShowApproved((v) => !v)}>
            {showApproved
              ? "Hide approved"
              : `+ ${waiting.approved.length} you approved, awaiting merge`}
          </button>
        )}
      </WorkdaySection>
    </div>
  );
}
