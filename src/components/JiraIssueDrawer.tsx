import React from "react";
import Offcanvas from "react-bootstrap/Offcanvas";
import Spinner from "react-bootstrap/Spinner";
import { IconExternalLink, IconGitPullRequest, IconRefresh } from "@tabler/icons-react";
import { JiraIssue } from "../types";
import type { LinkedPR } from "../types/teams";
import { useIssueDescription } from "../hooks/useIssueDescription";
import { Avatar } from "./primitives/Avatar";
import { staleTone } from "../views/teams/cockpit/staleTone";
import { Markdown } from "./Markdown";
import "./JiraIssueDrawer.css";
import { jiraBrowseUrl } from "../utils/tickets";
import { prNoteKey } from "../utils/prNotes";

interface JiraIssueDrawerProps {
  issue: JiraIssue | null;
  show: boolean;
  onHide: () => void;
  baseUrl?: string;
  /** PRs linked to this issue, shown at the bottom of the drawer. */
  linkedPRs?: LinkedPR[];
  staleDays?: number;
  /** Refetch the issue, bypassing the cache. Shows a reload button when set. */
  onReload?: () => void;
  reloading?: boolean;
  /** Key of an issue still being fetched: the drawer opens on it with a spinner. */
  loadingKey?: string | null;
}

export const JiraIssueDrawer: React.FC<JiraIssueDrawerProps> = ({
  issue,
  show,
  onHide,
  baseUrl,
  linkedPRs,
  staleDays,
  onReload,
  reloading,
  loadingKey,
}) => {
  // Still fetching: the header shows the key with placeholders for the rest.
  const loading = !issue && !!loadingKey;
  const issueKey = issue?.key ?? loadingKey;
  const url = issueKey ? jiraBrowseUrl(baseUrl, issueKey) : undefined;

  // Lists omit the description; lazy-load it (cached) when the drawer opens.
  const { description, loading: isDescLoading } = useIssueDescription(issue, show);

  // A static backdrop swallows outside clicks: they neither close the drawer nor
  // reach the page (so a stray click can't open another modal). Only the close
  // button and Escape dismiss the drawer.
  return (
    <Offcanvas
      show={show || !!loadingKey}
      onHide={onHide}
      placement="end"
      backdrop="static"
      keyboard
      className="jira-issue-drawer"
    >
      <Offcanvas.Header closeButton>
        <div className="jira-drawer-header">
          {loading ? (
            <div className="jira-drawer-type" aria-hidden="true">
              <span className="jira-drawer-skeleton" style={{ width: 56 }} />
            </div>
          ) : (
            issue?.issueType?.name && (
              <div className="jira-drawer-type">
                {issue.issueType.iconUrl && (
                  <img
                    src={issue.issueType.iconUrl}
                    alt={issue.issueType.name}
                    width={14}
                    height={14}
                  />
                )}
                <span>{issue.issueType.name}</span>
              </div>
            )
          )}
          <div className="jira-drawer-title">
            {issue ? `${issue.key}: ${issue.summary}` : (loadingKey ?? "")}
          </div>
          {loading ? (
            <div className="jira-drawer-subtitle" aria-hidden="true">
              <span className="jira-drawer-skeleton" style={{ width: 120 }} />
            </div>
          ) : (
            issue?.project.name && <div className="jira-drawer-subtitle">{issue.project.name}</div>
          )}
          <div className="jira-drawer-actions">
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="jira-drawer-link">
                Open in Jira
                <IconExternalLink size={13} stroke={1.5} />
              </a>
            )}
            {onReload && (
              <button
                type="button"
                className="jira-drawer-link jira-drawer-reload"
                onClick={onReload}
                disabled={reloading || loading}
                title="Reload from Jira"
              >
                {reloading ? (
                  <Spinner animation="border" size="sm" style={{ width: 12, height: 12 }} />
                ) : (
                  <IconRefresh size={13} stroke={1.5} />
                )}
                Reload
              </button>
            )}
          </div>
        </div>
      </Offcanvas.Header>

      <Offcanvas.Body className="jira-drawer-body">
        {issue ? (
          <JiraDrawerDetails
            issue={issue}
            description={description}
            isDescLoading={isDescLoading}
            linkedPRs={linkedPRs}
            staleDays={staleDays}
          />
        ) : (
          loading && <LoadingRow />
        )}
      </Offcanvas.Body>
    </Offcanvas>
  );
};

const LoadingRow: React.FC = () => (
  <div className="d-flex align-items-center gap-2 text-secondary-custom">
    <Spinner animation="border" size="sm" variant="secondary" />
    <span style={{ fontSize: "0.8125rem" }}>Loading…</span>
  </div>
);

const JiraDrawerDetails: React.FC<{
  issue: JiraIssue;
  description: string;
  isDescLoading: boolean;
  linkedPRs?: LinkedPR[];
  staleDays?: number;
}> = ({ issue, description, isDescLoading, linkedPRs, staleDays }) => (
  <>
    <div className="jira-drawer-content">
      <div className="modal-body-section-header">Description</div>
      {isDescLoading ? (
        <LoadingRow />
      ) : description ? (
        <Markdown>{description}</Markdown>
      ) : (
        <p className="text-secondary-custom" style={{ fontStyle: "italic" }}>
          No description provided.
        </p>
      )}
    </div>

    <div className="jira-drawer-assignee">
      <div className="modal-body-section-header">Assignee</div>
      {issue.assignee ? (
        <div className="d-flex align-items-center gap-2">
          <Avatar
            src={issue.assignee.avatarUrls ? issue.assignee.avatarUrls["48x48"] : ""}
            alt={issue.assignee.displayName}
            size="sm"
          />
          <span style={{ fontSize: "0.8125rem" }}>{issue.assignee.displayName}</span>
        </div>
      ) : (
        <span className="text-secondary-custom" style={{ fontSize: "0.8125rem" }}>
          Unassigned
        </span>
      )}
    </div>

    {staleDays != null && staleDays > 0 && (
      <div className="jira-drawer-assignee">
        <div className="modal-body-section-header">Staleness</div>
        <span style={{ fontSize: "0.8125rem", color: staleTone(staleDays) }}>
          No update in {staleDays} days
        </span>
      </div>
    )}

    {linkedPRs && linkedPRs.length > 0 && (
      <div className="jira-drawer-linked-prs">
        <div className="modal-body-section-header">Linked PRs</div>
        <div className="d-flex flex-column gap-2">
          {linkedPRs.map((pr) => (
            <a
              key={prNoteKey(pr)}
              href={pr.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="d-flex align-items-start gap-2 text-decoration-none"
              style={{ fontSize: "0.8125rem" }}
            >
              <IconGitPullRequest size={15} stroke={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ minWidth: 0 }}>
                <span className="text-secondary-custom">{pr.repo_full_name}</span>{" "}
                <span className="text-secondary-custom">#{pr.number}</span>
                <span className="d-block">{pr.title}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    )}
  </>
);
