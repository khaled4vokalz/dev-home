import React from "react";
import type { GitHubPR } from "../../types";
import { PRCard, type PRCardFields } from "../../components/PRCard";
import { TicketChip } from "../../components/PRTable";
import { Badge } from "../../components/primitives/Badge";
import type { TicketGroup } from "./types";

export const MY_PR_FIELDS: PRCardFields = {
  showAuthor: false,
  showBranch: true,
  showStatus: true,
  showChecks: true,
  timestamps: "open",
};

export const REVIEW_PR_FIELDS: PRCardFields = {
  ...MY_PR_FIELDS,
  showAuthor: true,
  showStatus: false,
};

/** Dashed marker for tickets assigned to me but not in an active sprint. */
export function OffSprintPill() {
  return <span className="workday-pill workday-pill--offsprint">Off-sprint</span>;
}

const openPR = (p: GitHubPR) => window.open(p.html_url, "_blank", "noopener,noreferrer");

interface TicketGroupListProps {
  groups: TicketGroup[];
  fields: PRCardFields;
  jiraBaseUrl: string;
  /** Optional trailing label per PR row (e.g. "Review requested"). */
  rowSuffix?: (pr: GitHubPR) => React.ReactNode;
  onCopyBranch?: (branch: string) => void;
  onCopyLink?: (url: string) => void;
}

/**
 * PRs grouped under a header per ticket. Unlike PRTable, every group gets a
 * header (even single-PR ones) so ticket context is always visible, and
 * ticket-only groups render as a "No PR yet" header with no rows.
 */
export function TicketGroupList({
  groups,
  fields,
  jiraBaseUrl,
  rowSuffix,
  onCopyBranch,
  onCopyLink,
}: TicketGroupListProps) {
  return (
    <>
      {groups.map((g) => (
        <React.Fragment key={g.ticket?.key ?? "__none__"}>
          <div className="pr-cluster-header workday-group-header">
            {g.ticket ? (
              <>
                <TicketChip ticket={g.ticket.key} jiraBaseUrl={jiraBaseUrl} />
                {g.ticket.summary && <span className="pr-cluster-summary">{g.ticket.summary}</span>}
                {g.ticket.offSprint && <OffSprintPill />}
                {g.ticket.statusName && <Badge variant="info">{g.ticket.statusName}</Badge>}
              </>
            ) : (
              <span className="workday-no-ticket">No ticket</span>
            )}
            {g.prs.length === 0 ? (
              <span className="workday-pill workday-pill--nopr">No PR yet</span>
            ) : (
              <span className="pr-cluster-count" title={`${g.prs.length} PRs`}>
                {g.prs.length}
              </span>
            )}
          </div>
          {g.prs.map((pr) => (
            <div key={pr.id} className="workday-pr-row">
              <PRCard
                pr={pr}
                fields={fields}
                jiraBaseUrl={jiraBaseUrl}
                clustered
                onOpen={openPR}
                onCopyBranch={onCopyBranch}
                onCopyLink={onCopyLink}
              />
              {rowSuffix && <span className="workday-row-suffix">{rowSuffix(pr)}</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
    </>
  );
}
