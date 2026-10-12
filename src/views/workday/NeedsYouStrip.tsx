import { IconBolt } from "@tabler/icons-react";
import type { GitHubPR } from "../../types";
import { WorkdaySection } from "./WorkdaySection";
import {
  CountDots,
  countLabel,
  GroupedRows,
  HeatAge,
  LineSub,
  TicketGroupLine,
  WorkdayLine,
} from "./CompactRow";
import { groupByTicketKey } from "./buildWorkday";
import { titleWithoutKey, type StateBadge } from "./prState";
import type { NeedsItem, NeedsTier } from "./types";

const TIER_LABEL: Record<NeedsTier, string> = {
  self: "Unblock yourself",
  others: "Unblock others",
  ship: "Ship",
};

/** Colour of each tier's label dot. */
const TIER_TONE: Record<NeedsTier, StateBadge["tone"]> = {
  self: "danger",
  others: "warning",
  ship: "success",
};

const TIERS: NeedsTier[] = ["self", "others", "ship"];

interface NeedsYouStripProps {
  items: NeedsItem[];
  loading: boolean;
  error: string | null;
  jiraBaseUrl: string;
  /** Ticket key → summary, for group headers. */
  ticketTitles: Map<string, string>;
  onTicket: (key: string) => void;
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
  ticketTitles,
  onTicket,
  now,
  collapsed,
  onToggle,
  onOpen,
}: NeedsYouStripProps) {
  const empty = items.length === 0;
  return (
    <WorkdaySection
      title="Needs you"
      icon={IconBolt}
      count={items.length}
      loading={loading}
      error={error}
      empty={<span className="workday-all-clear">✓ Nothing needs you right now</span>}
      hint={empty ? undefined : "Most blocking first"}
      className={`workday-needs${empty ? " workday-needs--empty" : ""}`}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {TIERS.map((tier) => {
        const tierItems = items.filter((i) => i.tier === tier);
        if (tierItems.length === 0) return null;
        return (
          <div key={tier} className="workday-needs-tier">
            <div className="workday-tier">
              <i className={`workday-tier-dot workday-dot--${TIER_TONE[tier]}`} />
              {TIER_LABEL[tier]}
            </div>
            <GroupedRows
              groups={groupByTicketKey(tierItems, (i) => i.ticketKey)}
              header={(key, group) => (
                <TicketGroupLine
                  key={`group:${key}`}
                  ticketKey={key}
                  jiraBaseUrl={jiraBaseUrl}
                  title={ticketTitles.get(key) ?? ""}
                  meta={
                    <CountDots
                      label={countLabel(group.length, "PR")}
                      tones={group.map((i) => i.tone)}
                    />
                  }
                  onClick={() => onTicket(key)}
                />
              )}
              row={(item, child) => (
                <WorkdayLine
                  key={item.pr.html_url}
                  className={`workday-line--needs${child ? " workday-line--child" : ""}`}
                  lead={item.verb}
                  tone={item.tone}
                  dot
                  icon="pr"
                  ticketKey={item.ticketKey}
                  hideKey={child}
                  jiraBaseUrl={jiraBaseUrl}
                  title={titleWithoutKey(item.pr.title, item.ticketKey)}
                  extra={<LineSub pr={item.pr} />}
                  meta={
                    <>
                      {item.reason} · <HeatAge iso={item.at} now={now} />
                    </>
                  }
                  onClick={() => onOpen(item.pr)}
                />
              )}
            />
          </div>
        );
      })}
    </WorkdaySection>
  );
}
