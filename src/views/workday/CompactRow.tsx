import React from "react";
import { IconCopy, IconGitPullRequest, IconTicket } from "@tabler/icons-react";
import { TicketChip } from "../../components/TicketGroupHeader";
import { Badge } from "../../components/primitives/Badge";
import type { StateBadge } from "./prState";

/** Dashed marker for tickets assigned to me but not in an active sprint. */
export function OffSprintPill() {
  return <span className="workday-pill workday-pill--offsprint">Off-sprint</span>;
}

/** Ticket key; its click opens the Jira drawer (not the row). "—" when none. */
export function TicketKey({
  ticketKey,
  jiraBaseUrl,
}: {
  ticketKey: string | null;
  jiraBaseUrl: string;
}) {
  if (!ticketKey) return <span className="workday-key workday-key--none">—</span>;
  return (
    <span className="workday-key">
      <TicketChip ticket={ticketKey} jiraBaseUrl={jiraBaseUrl} />
    </span>
  );
}

/** Click + Enter/Space handlers for a div acting as a button. */
function clickable(onClick?: () => void) {
  if (!onClick) return {};
  return {
    role: "button",
    tabIndex: 0,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };
}

interface WorkdayLineProps {
  /** Left label (verb / what / state), coloured by tone. */
  lead: React.ReactNode;
  tone?: StateBadge["tone"];
  /** Draws a dot before the lead (Needs you verbs). */
  dot?: boolean;
  ticketKey: string | null;
  jiraBaseUrl: string;
  title: React.ReactNode;
  /** Extra inline bits after the title (off-sprint pill, author). */
  extra?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

/** A one-liner: lead label · ticket key · title · meta. */
export function WorkdayLine({
  lead,
  tone,
  dot,
  ticketKey,
  jiraBaseUrl,
  title,
  extra,
  meta,
  className = "",
  onClick,
}: WorkdayLineProps) {
  return (
    <div className={`workday-line ${className}`.trim()} {...clickable(onClick)}>
      <span
        className={`workday-line-lead${tone ? ` workday-tone--${tone}` : ""}${dot ? " workday-line-lead--dot" : ""}`}
      >
        {lead}
      </span>
      <TicketKey ticketKey={ticketKey} jiraBaseUrl={jiraBaseUrl} />
      <span className="workday-line-title">
        <span className="workday-line-text">{title}</span>
        {extra}
      </span>
      <span className="workday-line-meta">{meta}</span>
    </div>
  );
}

interface WorkdayItemRowProps {
  kind: "pr" | "ticket";
  ticketKey?: string | null;
  /** Hide the key column (e.g. PRs nested under a ticket header). */
  hideKey?: boolean;
  jiraBaseUrl: string;
  title: React.ReactNode;
  extra?: React.ReactNode;
  sub?: React.ReactNode;
  badge?: StateBadge | null;
  /** Badge tooltip. */
  badgeTitle?: string;
  time?: string | null;
  /** Shows a copy-link button on hover. */
  url?: string;
  onCopyLink?: (url: string) => void;
  child?: boolean;
  onClick?: () => void;
}

/** A two-line row: icon · key + title / sub-line · one state badge · time. */
export function WorkdayItemRow({
  kind,
  ticketKey = null,
  hideKey,
  jiraBaseUrl,
  title,
  extra,
  sub,
  badge,
  badgeTitle,
  time,
  url,
  onCopyLink,
  child,
  onClick,
}: WorkdayItemRowProps) {
  const Icon = kind === "pr" ? IconGitPullRequest : IconTicket;
  return (
    <div className={`workday-item${child ? " workday-item--child" : ""}`} {...clickable(onClick)}>
      <Icon size={16} stroke={1.75} className="workday-item-icon" />
      <div className="workday-item-main">
        <div className="workday-item-line1">
          {!hideKey && <TicketKey ticketKey={ticketKey} jiraBaseUrl={jiraBaseUrl} />}
          <span className="workday-item-title">{title}</span>
          {extra}
        </div>
        {sub && <div className="workday-item-sub">{sub}</div>}
      </div>
      <div className="workday-item-side">
        {url && onCopyLink && (
          <button
            type="button"
            className="workday-item-copy"
            title="Copy PR link"
            aria-label="Copy PR link"
            onClick={(e) => {
              e.stopPropagation();
              onCopyLink(url);
            }}
          >
            <IconCopy size={13} />
          </button>
        )}
        {badge && (
          <Badge variant={badge.tone} title={badgeTitle}>
            {badge.label}
          </Badge>
        )}
        <span className="workday-item-time">{time}</span>
      </div>
    </div>
  );
}

/** Small uppercase divider inside a section. */
export function WorkdaySubhead({ children }: { children: React.ReactNode }) {
  return <div className="workday-subhead">{children}</div>;
}
