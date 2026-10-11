import React, { useMemo, useState } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import type { GitHubPR, Note, NoteType, ReviewState } from "../../types";
import { SectionHeader } from "../../components/primitives/SectionHeader";
import { SegmentedTabs } from "../../components/SegmentedTabs";
import { useOptionalJiraDrawer } from "../../context/JiraDrawerContext";
import { blockerLabel, inProgressCount, reviewingLines } from "./buildWorkday";
import { standupRef, compactAge, type Lookback } from "./dates";
import { myPRState, NO_PR_YET, REVIEWING_LABEL, repoRef, titleWithoutKey } from "./prState";
import type { StateBadge } from "./prState";
import type { DoneItem, NotStartedItem, TicketRef, WorkdaySections } from "./types";
import { WorkdaySection } from "./WorkdaySection";
import { OffSprintPill, WorkdayItemRow, WorkdayLine, WorkdaySubhead } from "./CompactRow";
import { StandupNotes } from "./StandupNotes";

type SectionToggle = (id: string) => { collapsed: boolean; onToggle: () => void };

export const LOOKBACKS = ["workday", "3d", "7d"] as const satisfies readonly Lookback[];
const LOOKBACK_LABELS: Record<Lookback, string> = {
  workday: "Last workday",
  "3d": "3 days",
  "7d": "7 days",
};
const DONE_TITLES: Record<Lookback, string> = {
  workday: "Done since last workday",
  "3d": "Done in the last 3 days",
  "7d": "Done in the last 7 days",
};
/** Off-sprint not-started rows shown before "Show n more". */
const OFF_SPRINT_PREVIEW = 3;

const REVIEW_PILL: Record<ReviewState, StateBadge> = {
  APPROVED: { label: "Approved", tone: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "danger" },
  COMMENTED: { label: "Commented", tone: "neutral" },
};

function doneLead(item: DoneItem): StateBadge {
  if (item.kind === "merged") return { label: "Merged", tone: "success" };
  if (item.kind === "reviewed") return REVIEW_PILL[item.state];
  return { label: `To ${item.toStatus}`, tone: "info" };
}

const offPill = (ticket: TicketRef | null) => ticket?.offSprint && <OffSprintPill />;

export interface StandupModeProps {
  sections: WorkdaySections;
  sinceLabel: string;
  lookback: Lookback;
  onLookback: (l: Lookback) => void;
  loading: boolean;
  jiraBaseUrl: string;
  now: Date;
  sectionToggle: SectionToggle;
  onOpen: (pr: GitHubPR) => void;
  onCopyLink: (url: string) => void;
  markdown: string;
  onNoteChange: (text: string) => void;
  notes: Note[];
  notesLoaded: boolean;
  addNote: (type: NoteType, content: string, referenceId?: string, title?: string) => Promise<Note>;
  editNote: (id: number, updates: { content?: string; title?: string }) => Promise<void>;
}

/**
 * Standup mode: compact sections that mirror the copied text (Done, In
 * progress, Blockers, Reviewing, Not started), plus notes and a text preview.
 */
export function StandupMode({
  sections,
  sinceLabel,
  lookback,
  onLookback,
  loading,
  jiraBaseUrl,
  now,
  sectionToggle,
  onOpen,
  onCopyLink,
  markdown,
  onNoteChange,
  notes,
  notesLoaded,
  addNote,
  editNote,
}: StandupModeProps) {
  const openIssue = useOptionalJiraDrawer();
  const [showAllOff, setShowAllOff] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const { done, workingOn, blockers, notStarted } = sections;
  const reviewing = useMemo(() => reviewingLines(sections), [sections]);
  const offItems = notStarted.offSprintItems;
  const visibleOff = showAllOff ? offItems : offItems.slice(0, OFF_SPRINT_PREVIEW);
  const openTicket = (key: string) => openIssue?.(key);

  const prRow = (pr: GitHubPR, ticket: TicketRef | null, opts: { child?: boolean } = {}) => (
    <WorkdayItemRow
      key={pr.html_url}
      kind="pr"
      ticketKey={ticket?.key ?? null}
      hideKey={opts.child}
      child={opts.child}
      jiraBaseUrl={jiraBaseUrl}
      title={titleWithoutKey(pr.title, ticket?.key ?? null)}
      extra={!opts.child && offPill(ticket)}
      sub={
        opts.child || !ticket
          ? `${repoRef(pr)}${ticket ? "" : " · no ticket"}`
          : `${repoRef(pr)}${ticket.statusName ? ` · ${ticket.statusName}` : ""}`
      }
      badge={myPRState(pr)}
      time={compactAge(pr.updated_at, now)}
      url={pr.html_url}
      onCopyLink={onCopyLink}
      onClick={() => onOpen(pr)}
    />
  );

  const notStartedLine = (item: NotStartedItem) => (
    <WorkdayLine
      key={item.ticket.key}
      lead={item.points !== null ? `${item.points} pt${item.points === 1 ? "" : "s"}` : "—"}
      ticketKey={item.ticket.key}
      jiraBaseUrl={jiraBaseUrl}
      title={item.ticket.summary}
      meta={
        item.ticket.offSprint
          ? item.updated && `updated ${compactAge(item.updated, now)} ago`
          : item.sprintName
      }
      onClick={() => openTicket(item.ticket.key)}
    />
  );

  return (
    <div className="workday">
      <div className="workday-main">
        <WorkdaySection
          {...sectionToggle("done")}
          title={DONE_TITLES[lookback]}
          count={done.items.length}
          loading={done.loading}
          error={done.error}
          empty={`Nothing merged, reviewed or moved since ${sinceLabel}`}
          actions={
            <SegmentedTabs
              className="compact"
              tabs={LOOKBACKS.map((l) => ({ key: l, label: LOOKBACK_LABELS[l] }))}
              activeKey={lookback}
              onChange={(k) => onLookback(k as Lookback)}
            />
          }
        >
          {done.items.map((item) => {
            const lead = doneLead(item);
            return (
              <WorkdayLine
                key={`${item.kind}:${item.kind === "status" ? item.ticket.key : item.pr.html_url}:${item.at}`}
                lead={lead.label}
                tone={lead.tone}
                ticketKey={item.ticket?.key ?? null}
                jiraBaseUrl={jiraBaseUrl}
                title={
                  item.kind === "status"
                    ? item.ticket.summary
                    : titleWithoutKey(item.pr.title, item.ticket?.key ?? null)
                }
                extra={offPill(item.ticket)}
                meta={compactAge(item.at, now)}
                onClick={() =>
                  item.kind === "status" ? openTicket(item.ticket.key) : onOpen(item.pr)
                }
              />
            );
          })}
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("inProgress")}
          title="In progress"
          count={inProgressCount(workingOn.items)}
          loading={loading}
          error={workingOn.error}
          empty="No open PRs or in-progress tickets"
        >
          {workingOn.items.map((g) => {
            if (!g.ticket) return g.prs.map((pr) => prRow(pr, null));
            const { ticket } = g;
            if (g.prs.length === 1) return prRow(g.prs[0], ticket);
            if (g.prs.length === 0)
              return (
                <WorkdayItemRow
                  key={ticket.key}
                  kind="ticket"
                  ticketKey={ticket.key}
                  jiraBaseUrl={jiraBaseUrl}
                  title={ticket.summary || ticket.key}
                  extra={offPill(ticket)}
                  sub={ticket.statusName ?? undefined}
                  badge={NO_PR_YET}
                  time={ticket.updated && compactAge(ticket.updated, now)}
                  onClick={() => openTicket(ticket.key)}
                />
              );
            return (
              <React.Fragment key={ticket.key}>
                <WorkdayLine
                  className="workday-line--group"
                  lead={null}
                  ticketKey={ticket.key}
                  jiraBaseUrl={jiraBaseUrl}
                  title={ticket.summary}
                  extra={offPill(ticket)}
                  meta={`${ticket.statusName ? `${ticket.statusName} · ` : ""}${g.prs.length} PRs`}
                  onClick={() => openTicket(ticket.key)}
                />
                {g.prs.map((pr) => prRow(pr, ticket, { child: true }))}
              </React.Fragment>
            );
          })}
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("blockers")}
          title="Blockers"
          count={blockers.items.length}
          loading={loading || blockers.loading}
          error={blockers.error}
          empty="Nothing blocked"
        >
          {blockers.items.map((b) => {
            const lead = blockerLabel(b);
            return (
              <WorkdayLine
                key={b.kind === "pr" ? b.pr.html_url : `flagged:${b.ticket.key}`}
                lead={lead.label}
                tone={lead.tone}
                ticketKey={b.ticket?.key ?? null}
                jiraBaseUrl={jiraBaseUrl}
                title={
                  b.kind === "pr"
                    ? titleWithoutKey(b.pr.title, b.ticket?.key ?? null)
                    : b.ticket.summary
                }
                extra={offPill(b.ticket)}
                meta={
                  b.kind === "pr" && b.reasons.length > 1 ? b.reasons.slice(1).join(", ") : null
                }
                onClick={() => (b.kind === "pr" ? onOpen(b.pr) : openTicket(b.ticket.key))}
              />
            );
          })}
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("reviewing")}
          title="Reviewing"
          count={reviewing.length}
          loading={loading}
          error={sections.reviewing.error}
          empty="No reviews requested or in progress"
        >
          {reviewing.map((r) => {
            const lead = REVIEWING_LABEL[r.state];
            return (
              <WorkdayLine
                key={r.pr.html_url}
                lead={lead.label}
                tone={lead.tone}
                ticketKey={r.ticket?.key ?? null}
                jiraBaseUrl={jiraBaseUrl}
                title={titleWithoutKey(r.pr.title, r.ticket?.key ?? null)}
                extra={<span className="workday-line-sub">· {r.pr.user.login}</span>}
                meta={compactAge(r.pr.updated_at, now)}
                onClick={() => onOpen(r.pr)}
              />
            );
          })}
        </WorkdaySection>

        <WorkdaySection
          {...sectionToggle("notStarted")}
          title="Assigned, not started"
          count={notStarted.items.length + offItems.length}
          loading={loading || notStarted.loading}
          error={notStarted.error}
          empty="No assigned tickets waiting to start"
        >
          {notStarted.items.map(notStartedLine)}
          {offItems.length > 0 && (
            <>
              <WorkdaySubhead>Off-sprint</WorkdaySubhead>
              {visibleOff.map(notStartedLine)}
              {offItems.length > OFF_SPRINT_PREVIEW && (
                <button
                  type="button"
                  className="workday-more"
                  onClick={() => setShowAllOff((v) => !v)}
                >
                  {showAllOff ? "Show fewer" : `Show ${offItems.length - OFF_SPRINT_PREVIEW} more`}
                </button>
              )}
            </>
          )}
        </WorkdaySection>
      </div>

      <div className="workday-side">
        <StandupNotes
          key={standupRef(now)}
          now={now}
          notes={notes}
          notesLoaded={notesLoaded}
          addNote={addNote}
          editNote={editNote}
          onChange={onNoteChange}
        />
        <Card className="workday-side-card">
          <Card.Body className="p-0">
            <SectionHeader
              className={`workday-section-header${showPreview ? "" : " workday-section-header--collapsed"}`}
              action={
                <Button
                  variant="outline-secondary"
                  size="sm"
                  aria-expanded={showPreview}
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? "Hide" : "Preview"}
                </Button>
              }
            >
              Standup text
            </SectionHeader>
            {showPreview && (
              <pre className="workday-preview">{markdown || "Nothing to report yet."}</pre>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
