import React from "react";
import { IconChevronDown, IconChevronRight, IconCopy, IconExternalLink } from "@tabler/icons-react";
import { jiraBrowseUrl } from "../utils/tickets";
import { formatRelativeTime, parseTimestamp } from "../utils/time";
import { ticketClickHandler, useOptionalJiraDrawer } from "../context/JiraDrawerContext";
import "./TicketGroupHeader.css";

/** Ticket key that opens the shared Jira drawer (or a plain chip when no Jira
    base URL). Used on group headers, where the key labels the whole group. */
export function TicketChip({ ticket, jiraBaseUrl }: { ticket: string; jiraBaseUrl?: string }) {
  const openIssue = useOptionalJiraDrawer();
  if (!jiraBaseUrl) return <span className="ticket-chip">{ticket}</span>;
  return (
    <a
      className="ticket-chip"
      href={jiraBrowseUrl(jiraBaseUrl, ticket)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={ticketClickHandler(openIssue, ticket)}
    >
      {ticket}
    </a>
  );
}

interface TicketGroupHeaderProps {
  /** Ticket key, or null for a "No ticket" group. */
  ticket: string | null;
  jiraBaseUrl?: string;
  summary?: string;
  /** PR count badge; hidden when 0. */
  count: number;
  /** Copies the ticket key (surfaces a toast); the button is hidden when omitted. */
  onCopyKey?: (key: string) => void;
  /** Last-updated time shown at the right end; hidden when absent. */
  updatedAt?: string | null;
  /** Makes the header a toggle. Omit for a static header. */
  onToggle?: () => void;
  collapsed?: boolean;
  className?: string;
  /** Extra pills after the summary (status, off-sprint, ...). */
  children?: React.ReactNode;
}

/** The tinted row above a ticket's PRs: chip, summary, extra pills, count. */
export function TicketGroupHeader({
  ticket,
  jiraBaseUrl,
  summary,
  count,
  updatedAt,
  onCopyKey,
  onToggle,
  collapsed = false,
  className,
  children,
}: TicketGroupHeaderProps) {
  const classes = ["pr-cluster-header", !onToggle && "pr-cluster-header--static", className]
    .filter(Boolean)
    .join(" ");
  const toggleProps = onToggle && {
    role: "button",
    tabIndex: 0,
    "aria-expanded": !collapsed,
    onClick: onToggle,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    },
  };

  return (
    <div className={classes} {...toggleProps}>
      {onToggle && (
        <span className="pr-cluster-chevron">
          {collapsed ? (
            <IconChevronRight size={14} stroke={2} />
          ) : (
            <IconChevronDown size={14} stroke={2} />
          )}
        </span>
      )}
      {ticket ? (
        <>
          <TicketChip ticket={ticket} jiraBaseUrl={jiraBaseUrl} />
          {onCopyKey && (
            <button
              type="button"
              className="pr-cluster-icon-btn"
              title="Copy ticket key"
              aria-label={`Copy ${ticket}`}
              onClick={(e) => {
                e.stopPropagation();
                onCopyKey(ticket);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <IconCopy size={14} stroke={1.8} />
            </button>
          )}
          {jiraBaseUrl && (
            <a
              className="pr-cluster-ext"
              href={jiraBrowseUrl(jiraBaseUrl, ticket)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Jira"
              aria-label={`Open ${ticket} in Jira`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <IconExternalLink size={14} stroke={1.8} />
            </a>
          )}
        </>
      ) : (
        <span className="pr-cluster-no-ticket">No ticket</span>
      )}
      {summary && <span className="pr-cluster-summary">{summary}</span>}
      {children}
      {count > 0 && (
        <span className="pr-cluster-count" title={`${count} PRs`}>
          {count}
        </span>
      )}
      {updatedAt && (
        <span className="pr-cluster-updated" title={parseTimestamp(updatedAt).toLocaleString()}>
          updated {formatRelativeTime(updatedAt)}
        </span>
      )}
    </div>
  );
}
