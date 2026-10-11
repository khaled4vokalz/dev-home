import type { GitHubPR } from "../../types";
import { WorkdaySection } from "./WorkdaySection";
import { WorkdayLine } from "./CompactRow";
import { compactAge } from "./dates";
import { titleWithoutKey } from "./prState";
import type { NeedsItem, NeedsTier } from "./types";

const TIER_LABEL: Record<NeedsTier, string> = {
  self: "Unblock yourself",
  others: "Unblock others",
  ship: "Ship",
};

interface NeedsYouStripProps {
  items: NeedsItem[];
  loading: boolean;
  error: string | null;
  jiraBaseUrl: string;
  now: Date;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (pr: GitHubPR) => void;
}

/**
 * Focus's to-do strip: what's waiting on me, most blocking first. View-only:
 * the coloured verb is a label, and items clear when upstream state changes.
 */
export function NeedsYouStrip({
  items,
  loading,
  error,
  jiraBaseUrl,
  now,
  collapsed,
  onToggle,
  onOpen,
}: NeedsYouStripProps) {
  const empty = items.length === 0;
  return (
    <WorkdaySection
      title="Needs you"
      count={items.length}
      loading={loading}
      error={error}
      empty={<span className="workday-all-clear">✓ Nothing needs you right now</span>}
      hint={empty ? undefined : "most blocking first"}
      className={`workday-needs${empty ? " workday-needs--empty" : ""}`}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {items.map((item, i) => (
        <div key={item.pr.html_url} className="workday-needs-entry">
          {(i === 0 || items[i - 1].tier !== item.tier) && (
            <div className="workday-tier">{TIER_LABEL[item.tier]}</div>
          )}
          <WorkdayLine
            className="workday-line--needs"
            lead={item.verb}
            tone={item.tone}
            dot
            ticketKey={item.ticketKey}
            jiraBaseUrl={jiraBaseUrl}
            title={titleWithoutKey(item.pr.title, item.ticketKey)}
            meta={`${item.reason} · ${compactAge(item.at, now)}`}
            onClick={() => onOpen(item.pr)}
          />
        </div>
      ))}
    </WorkdaySection>
  );
}
