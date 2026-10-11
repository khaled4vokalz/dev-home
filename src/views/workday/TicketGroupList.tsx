import React from "react";
import type { GitHubPR } from "../../types";
import { PRCard, type PRCardFields } from "../../components/PRCard";
import { VARIANT_FIELDS } from "../../components/PRTable";
import { TicketGroupHeader } from "../../components/TicketGroupHeader";
import { Badge } from "../../components/primitives/Badge";
import { usePRNoteCounts } from "../../hooks/usePRNoteCounts";
import type { TicketGroup } from "./types";

export const MY_PR_FIELDS: PRCardFields = VARIANT_FIELDS["my-prs"];

/** Review-requests fields, plus the branch so it can be copied for checkout. */
export const REVIEW_PR_FIELDS: PRCardFields = {
  ...VARIANT_FIELDS["review-requests"],
  showBranch: true,
};

/** Dashed marker for tickets assigned to me but not in an active sprint. */
export function OffSprintPill() {
  return <span className="workday-pill workday-pill--offsprint">Off-sprint</span>;
}

/** Most recent updated_at across PRs, or null for none. */
function latestUpdate(prs: GitHubPR[]): string | null {
  return prs.reduce<string | null>(
    (latest, pr) =>
      !latest || new Date(pr.updated_at) > new Date(latest) ? pr.updated_at : latest,
    null,
  );
}

interface TicketGroupListProps<G extends TicketGroup> {
  groups: G[];
  fields: PRCardFields;
  jiraBaseUrl: string;
  /** Optional trailing label per PR row (e.g. "Review requested"). */
  rowSuffix?: (pr: GitHubPR) => React.ReactNode;
  /** Optional extra pills on a group header (e.g. "Flagged"). */
  groupExtra?: (group: G) => React.ReactNode;
  /** Show "No PR yet" on PR-less groups; off where a PR-less ticket means something else. */
  showNoPR?: boolean;
  /** Opens the PR detail modal. */
  onOpen: (pr: GitHubPR) => void;
  onCopyBranch?: (branch: string) => void;
  onCopyLink?: (url: string) => void;
  onCopyRef?: (ref: string) => void;
  onCopyTicket?: (key: string) => void;
}

/**
 * PRs grouped under a header per ticket. Unlike PRTable, every group gets a
 * header (even single-PR ones) so ticket context is always visible, and
 * ticket-only groups render as a "No PR yet" header with no rows.
 */
export function TicketGroupList<G extends TicketGroup>({
  groups,
  fields,
  jiraBaseUrl,
  rowSuffix,
  groupExtra,
  showNoPR = true,
  onOpen,
  onCopyBranch,
  onCopyLink,
  onCopyRef,
  onCopyTicket,
}: TicketGroupListProps<G>) {
  const noteCount = usePRNoteCounts();
  return (
    <>
      {groups.map((g) => (
        <React.Fragment key={g.ticket?.key ?? "__none__"}>
          <TicketGroupHeader
            className="workday-group-header"
            ticket={g.ticket?.key ?? null}
            jiraBaseUrl={jiraBaseUrl}
            summary={g.ticket?.summary}
            count={g.prs.length}
            onCopyKey={onCopyTicket}
            updatedAt={g.ticket?.updated ?? latestUpdate(g.prs)}
          >
            {g.ticket?.offSprint && <OffSprintPill />}
            {g.ticket?.statusName && <Badge variant="info">{g.ticket.statusName}</Badge>}
            {groupExtra?.(g)}
            {showNoPR && g.prs.length === 0 && (
              <span className="workday-pill workday-pill--nopr">No PR yet</span>
            )}
          </TicketGroupHeader>
          {g.prs.map((pr) => (
            <div key={pr.id} className="workday-pr-row">
              <PRCard
                pr={pr}
                fields={fields}
                jiraBaseUrl={jiraBaseUrl}
                clustered
                noteCount={noteCount(pr)}
                onOpen={onOpen}
                onCopyBranch={onCopyBranch}
                onCopyLink={onCopyLink}
                onCopyRef={onCopyRef}
              />
              {rowSuffix && <span className="workday-row-suffix">{rowSuffix(pr)}</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
