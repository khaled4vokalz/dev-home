import React from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import Card from "react-bootstrap/Card";
import { Badge } from "../../components/primitives/Badge";
import { SectionHeader } from "../../components/primitives/SectionHeader";

interface WorkdaySectionProps {
  title: string;
  count: number;
  loading: boolean;
  error: string | null;
  /** Muted one-liner shown when there's nothing to list. */
  empty: string;
  actions?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * One card on the Workday page. Shows skeleton bars only while loading with
 * nothing to show yet; an error is an inline line that keeps any items visible.
 * The header toggles the body; the parent owns (and persists) collapsed state.
 */
export function WorkdaySection({
  title,
  count,
  loading,
  error,
  empty,
  actions,
  collapsed,
  onToggle,
  children,
}: WorkdaySectionProps) {
  const Chevron = collapsed ? IconChevronRight : IconChevronDown;

  return (
    <Card className="workday-section">
      <Card.Body className="p-0">
        <SectionHeader
          className={`workday-section-header${collapsed ? " workday-section-header--collapsed" : ""}`}
          action={actions}
        >
          <button
            type="button"
            className="workday-section-toggle"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            <Chevron size={16} stroke={2} className="workday-section-chevron" />
            <span>{title}</span>
            <Badge variant="neutral">{count}</Badge>
          </button>
        </SectionHeader>
        {!collapsed && (
          <>
            {error && <div className="workday-section-error">{error}</div>}
            {loading && count === 0 ? (
              <div className="workday-skeletons" aria-hidden="true">
                <div className="workday-skeleton" />
                <div className="workday-skeleton" />
                <div className="workday-skeleton" />
              </div>
            ) : count === 0 ? (
              // With an error, "nothing to show" would be misleading.
              !error && <div className="workday-empty">{empty}</div>
            ) : (
              <div className="workday-rows">{children}</div>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
