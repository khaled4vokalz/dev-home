import { useCallback, useMemo, useState } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import { IconCopy, IconRefresh, IconSun } from "@tabler/icons-react";
import type { GitHubPR, JiraIssue, Note, NoteType, ReviewState } from "../../types";
import { Badge, type BadgeVariant } from "../../components/primitives/Badge";
import { SectionHeader } from "../../components/primitives/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { TicketChip } from "../../components/PRTable";
import { Toast, useToast } from "../../components/Toast";
import { formatRelativeTime } from "../../utils/time";
import { useWorkdayExtras } from "../../hooks/useWorkdayExtras";
import { buildWorkday, filterWorkday } from "./buildWorkday";
import { workdayToMarkdown } from "./workdayMarkdown";
import { formatSinceLabel, sinceFor, standupRef, type Lookback } from "./dates";
import type {
  BlockerItem,
  DoneItem,
  NotStartedItem,
  SprintFilter,
  TicketRef,
  WaitingItem,
} from "./types";
import { WorkdaySection } from "./WorkdaySection";
import { MY_PR_FIELDS, OffSprintPill, REVIEW_PR_FIELDS, TicketGroupList } from "./TicketGroupList";
import { StandupNotes } from "./StandupNotes";
import "./workday.css";

export interface WorkdayViewProps {
  configured: boolean;
  openPRs: GitHubPR[];
  reviewRequests: GitHubPR[];
  reviewingPRs: GitHubPR[];
  assignedIssues: JiraIssue[];
  allIssues: JiraIssue[];
  /** True while the dashboard sources the page reuses are loading. */
  loading: boolean;
  jiraBaseUrl: string;
  weekendDays: number[];
  refreshKey: number;
  onRefresh: () => void;
  notes: Note[];
  /** useNotes().loaded — today's standup note is only created once Notes have loaded. */
  notesLoaded: boolean;
  addNote: (type: NoteType, content: string, referenceId?: string, title?: string) => Promise<Note>;
  editNote: (id: number, updates: { content?: string; title?: string }) => Promise<void>;
  /** Injectable clock for tests. */
  now?: Date;
}

const FILTER_KEY = "dev-home-workday-filter";
const LOOKBACK_KEY = "dev-home-workday-lookback";
const FILTERS = ["all", "sprint", "off"] as const satisfies readonly SprintFilter[];
const LOOKBACKS = ["workday", "3d", "7d"] as const satisfies readonly Lookback[];
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

const REVIEW_PILL: Record<ReviewState, { label: string; variant: BadgeVariant }> = {
  APPROVED: { label: "Approved", variant: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", variant: "danger" },
  COMMENTED: { label: "Commented", variant: "neutral" },
};

/** A localStorage-backed string state limited to `allowed` values. */
function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : initial;
  });
  const set = useCallback(
    (v: T) => {
      localStorage.setItem(key, v);
      setValue(v);
    },
    [key],
  );
  return [value, set] as const;
}

/** Ticket chip plus the off-sprint marker, or nothing for ticketless items. */
function TicketLabel({ ticket, jiraBaseUrl }: { ticket: TicketRef | null; jiraBaseUrl: string }) {
  if (!ticket) return null;
  return (
    <>
      <TicketChip ticket={ticket.key} jiraBaseUrl={jiraBaseUrl} />
      {ticket.offSprint && <OffSprintPill />}
    </>
  );
}

function PRTitle({ pr }: { pr: GitHubPR }) {
  return (
    <a className="workday-row-title" href={pr.html_url} target="_blank" rel="noopener noreferrer">
      #{pr.number} {pr.title}
    </a>
  );
}

function DoneRow({ item, jiraBaseUrl }: { item: DoneItem; jiraBaseUrl: string }) {
  const pill =
    item.kind === "merged"
      ? { label: "Merged", variant: "success" as const }
      : item.kind === "reviewed"
        ? REVIEW_PILL[item.state]
        : { label: `To ${item.toStatus}`, variant: "info" as const };
  return (
    <div className="workday-row">
      <Badge variant={pill.variant}>{pill.label}</Badge>
      <TicketLabel ticket={item.ticket} jiraBaseUrl={jiraBaseUrl} />
      {item.kind === "status" ? (
        <span className="workday-row-title">{item.ticket.summary}</span>
      ) : (
        <PRTitle pr={item.pr} />
      )}
      <span className="workday-row-meta">{formatRelativeTime(item.at)}</span>
    </div>
  );
}

function BlockerRow({ item, jiraBaseUrl }: { item: BlockerItem; jiraBaseUrl: string }) {
  if (item.kind === "flagged") {
    return (
      <div className="workday-row">
        <Badge variant="danger">Flagged</Badge>
        <TicketLabel ticket={item.ticket} jiraBaseUrl={jiraBaseUrl} />
        <span className="workday-row-title">{item.ticket.summary}</span>
      </div>
    );
  }
  return (
    <div className="workday-row">
      <TicketLabel ticket={item.ticket} jiraBaseUrl={jiraBaseUrl} />
      <PRTitle pr={item.pr} />
      {item.reasons.map((r) => (
        // A missing reviewer is a nudge; CI/conflicts/requested changes block.
        <Badge key={r} variant={r === "No reviewer requested" ? "warning" : "danger"}>
          {r}
        </Badge>
      ))}
    </div>
  );
}

function WaitingRow({ item, jiraBaseUrl }: { item: WaitingItem; jiraBaseUrl: string }) {
  if (item.kind === "code-review") {
    return (
      <div className="workday-row">
        <TicketLabel ticket={item.ticket} jiraBaseUrl={jiraBaseUrl} />
        <span className="workday-row-title">{item.ticket.summary}</span>
        <span className="workday-row-meta">Code Review · {item.reviewers.join(", ")}</span>
      </div>
    );
  }
  return (
    <div className="workday-row">
      <TicketLabel ticket={item.ticket} jiraBaseUrl={jiraBaseUrl} />
      <PRTitle pr={item.pr} />
      <span className="workday-row-meta">
        {item.kind === "your-move"
          ? "Approved — your move"
          : `Waiting on ${item.reviewers.length > 0 ? item.reviewers.join(", ") : "review"} · ${formatRelativeTime(item.since)}`}
      </span>
    </div>
  );
}

function NotStartedRow({ item, jiraBaseUrl }: { item: NotStartedItem; jiraBaseUrl: string }) {
  const meta = item.ticket.offSprint
    ? item.updated && `updated ${formatRelativeTime(item.updated)}`
    : [item.sprintName, item.points !== null ? `${item.points} pts` : null]
        .filter(Boolean)
        .join(" · ");
  return (
    <div className="workday-row">
      <TicketLabel ticket={item.ticket} jiraBaseUrl={jiraBaseUrl} />
      <span className="workday-row-title">{item.ticket.summary}</span>
      {meta && <span className="workday-row-meta">{meta}</span>}
    </div>
  );
}

/**
 * Standup page: what I did since the last workday, what I'm on now, what's
 * blocking or waiting, plus a per-day note and a Slack-ready "Copy standup".
 */
export function WorkdayView(props: WorkdayViewProps) {
  const {
    configured,
    openPRs,
    reviewRequests,
    reviewingPRs,
    assignedIssues,
    allIssues,
    loading,
    jiraBaseUrl,
    weekendDays,
    refreshKey,
    onRefresh,
    notes,
    notesLoaded,
    addNote,
    editNote,
  } = props;

  // refreshKey is a deliberate dep: a refresh re-reads the clock so "since" moves on.
  const now = useMemo(() => props.now ?? new Date(), [props.now, refreshKey]);
  const [filter, setFilter] = useStoredState<SprintFilter>(FILTER_KEY, "all", FILTERS);
  const [lookback, setLookback] = useStoredState<Lookback>(LOOKBACK_KEY, "workday", LOOKBACKS);
  const [showAllOff, setShowAllOff] = useState(false);
  const toast = useToast();

  // Keyed on the joined string: callers often pass a fresh array each render.
  const weekendKey = weekendDays.join(",");
  const since = useMemo(
    () => sinceFor(lookback, now, weekendKey ? weekendKey.split(",").map(Number) : []),
    [lookback, now, weekendKey],
  );
  const extras = useWorkdayExtras(configured, since, refreshKey);
  const sections = useMemo(
    () =>
      buildWorkday(
        { openPRs, reviewRequests, reviewingPRs, assignedIssues, allIssues, extras },
        now,
      ),
    [openPRs, reviewRequests, reviewingPRs, assignedIssues, allIssues, extras, now],
  );
  const filtered = useMemo(() => filterWorkday(sections, filter), [sections, filter]);

  // StandupNotes seeds this on mount and keeps it in sync.
  const [noteText, setNoteText] = useState("");
  const markdown = useMemo(
    () => workdayToMarkdown(filtered, noteText, now),
    [filtered, noteText, now],
  );

  const copyText = async (text: string, confirmation: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(confirmation);
    } catch {
      toast.show("Couldn't copy to clipboard");
    }
  };
  const copy = () => copyText(markdown, "Standup copied");
  const copyBranch = (branch: string) => copyText(branch, "Copied branch name to clipboard");
  const copyLink = (url: string) => copyText(url, "Copied PR link to clipboard");

  if (!configured) {
    return (
      <EmptyState
        icon={<IconSun size={40} stroke={1.5} />}
        title="Connect Jira and GitHub"
        description="Add your credentials in Settings to see your workday."
      />
    );
  }

  const sinceLabel = formatSinceLabel(since);
  const { done, workingOn, reviewing, blockers, waiting, notStarted } = filtered;
  const offItems = notStarted.offSprintItems;
  const visibleOff = showAllOff ? offItems : offItems.slice(0, OFF_SPRINT_PREVIEW);
  const filterLabels: Record<SprintFilter, string> = {
    all: "All",
    sprint: "Sprint only",
    off: `Off-sprint · ${sections.offSprintCount}`,
  };

  return (
    <div className="workday-page">
      <div className="workday-header">
        <h5>Workday</h5>
        <span className="workday-date-pill">{formatSinceLabel(now)}</span>
        <div className="workday-header-spacer" />
        <div className="workday-segmented" role="group" aria-label="Sprint filter">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={filter === f ? "is-active" : ""}
              onClick={() => setFilter(f)}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>
        <Button variant="outline-secondary" size="sm" onClick={onRefresh}>
          <IconRefresh size={14} /> Refresh
        </Button>
        <Button variant="primary" size="sm" onClick={copy}>
          <IconCopy size={14} /> Copy standup
        </Button>
      </div>
      <div className="workday-subtitle">{`Since ${sinceLabel}`}</div>

      <div className="workday">
        <div className="workday-main">
          <WorkdaySection
            id="done"
            title={DONE_TITLES[lookback]}
            count={done.items.length}
            loading={done.loading}
            error={done.error}
            empty={`Nothing merged, reviewed or moved since ${sinceLabel}`}
            actions={
              <div className="workday-segmented" role="group" aria-label="Lookback">
                {LOOKBACKS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={lookback === l}
                    className={lookback === l ? "is-active" : ""}
                    onClick={() => setLookback(l)}
                  >
                    {LOOKBACK_LABELS[l]}
                  </button>
                ))}
              </div>
            }
          >
            {done.items.map((item) => (
              <DoneRow
                key={`${item.kind}:${item.kind === "status" ? item.ticket.key : item.pr.html_url}:${item.at}`}
                item={item}
                jiraBaseUrl={jiraBaseUrl}
              />
            ))}
          </WorkdaySection>

          <WorkdaySection
            id="workingOn"
            title="Working on"
            count={workingOn.items.length}
            loading={loading}
            error={workingOn.error}
            empty="No open PRs or in-progress tickets"
          >
            <TicketGroupList
              groups={workingOn.items}
              fields={MY_PR_FIELDS}
              jiraBaseUrl={jiraBaseUrl}
              onCopyBranch={copyBranch}
              onCopyLink={copyLink}
            />
          </WorkdaySection>

          <WorkdaySection
            id="reviewing"
            title="Reviewing"
            count={reviewing.items.length}
            loading={loading}
            error={reviewing.error}
            empty="No reviews requested or in progress"
          >
            <TicketGroupList
              groups={reviewing.items}
              fields={REVIEW_PR_FIELDS}
              jiraBaseUrl={jiraBaseUrl}
              onCopyBranch={copyBranch}
              onCopyLink={copyLink}
              rowSuffix={(pr) =>
                filtered.reviewRequestedUrls.has(pr.html_url) ? (
                  <Badge variant="warning" className="workday-review-pill">
                    Review requested
                  </Badge>
                ) : (
                  <Badge variant="info" className="workday-review-pill">
                    Reviewed
                  </Badge>
                )
              }
            />
          </WorkdaySection>

          <WorkdaySection
            id="blockers"
            title="Blockers / needs attention"
            count={blockers.items.length}
            loading={loading || blockers.loading}
            error={blockers.error}
            empty="Nothing blocked"
          >
            {blockers.items.map((item) => (
              <BlockerRow
                key={item.kind === "pr" ? item.pr.html_url : `flagged:${item.ticket.key}`}
                item={item}
                jiraBaseUrl={jiraBaseUrl}
              />
            ))}
          </WorkdaySection>

          <WorkdaySection
            id="waiting"
            title="Waiting on others"
            count={waiting.items.length}
            loading={loading}
            error={waiting.error}
            empty="Not waiting on anyone"
          >
            {waiting.items.map((item) => (
              <WaitingRow
                key={item.kind === "code-review" ? `cr:${item.ticket.key}` : item.pr.html_url}
                item={item}
                jiraBaseUrl={jiraBaseUrl}
              />
            ))}
          </WorkdaySection>

          <WorkdaySection
            id="notStarted"
            title="Assigned, not started"
            count={notStarted.items.length + offItems.length}
            loading={loading || notStarted.loading}
            error={notStarted.error}
            empty="No assigned tickets waiting to start"
          >
            {notStarted.items.map((item) => (
              <NotStartedRow key={item.ticket.key} item={item} jiraBaseUrl={jiraBaseUrl} />
            ))}
            {offItems.length > 0 && (
              <>
                <div className="workday-divider">Off-sprint</div>
                {visibleOff.map((item) => (
                  <NotStartedRow key={item.ticket.key} item={item} jiraBaseUrl={jiraBaseUrl} />
                ))}
                {offItems.length > OFF_SPRINT_PREVIEW && (
                  <button
                    type="button"
                    className="workday-more"
                    onClick={() => setShowAllOff((v) => !v)}
                  >
                    {showAllOff
                      ? "Show fewer"
                      : `Show ${offItems.length - OFF_SPRINT_PREVIEW} more`}
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
            onChange={setNoteText}
          />
          <Card className="workday-side-card">
            <Card.Body className="p-0">
              <SectionHeader className="workday-section-header">Copy preview</SectionHeader>
              <pre className="workday-preview">{markdown || "Nothing to report yet."}</pre>
            </Card.Body>
          </Card>
        </div>
      </div>

      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}
