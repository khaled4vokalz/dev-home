import { useState } from "react";
import {
  IconTarget,
  IconPin,
  IconPinFilled,
  IconClock,
  IconExternalLink,
  IconAlertTriangle,
  IconAt,
  IconGitPullRequest,
  IconSubtask,
  IconNotes,
  IconEye,
  IconX,
  IconArrowBackUp,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Dropdown from "react-bootstrap/Dropdown";
import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import {
  snoozePresets,
  type RankedFocusItem,
  type FocusItem,
  type FocusKind,
  type FocusMention,
} from "../services/focus";
import { type FocusGroups } from "../hooks/useFocus";
import { EmptyState } from "./EmptyState";

interface Props {
  groups: FocusGroups;
  loading: boolean;
  offline: boolean;
  onPin: (itemId: string, pinned: boolean) => void;
  onSnooze: (itemId: string, until: number | null) => void;
  onDismiss: (itemId: string, dismissed: boolean) => void;
}

const KIND_ICON: Record<FocusKind, typeof IconTarget> = {
  "pr-mine": IconGitPullRequest,
  "pr-review": IconEye,
  jira: IconSubtask,
  mention: IconAt,
  note: IconNotes,
};

const ageLabel = (at: number) => {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  return days > 0 ? `${days}d` : "today";
};

/** The individual comments of a grouped mention row, newest first. */
function MentionList({ mentions }: { mentions: FocusMention[] }) {
  return (
    <ul className="list-unstyled mb-0 mt-2 ms-4 ps-2 border-start">
      {mentions.map((m) => (
        <li key={m.id} className="d-flex gap-2 py-1 text-truncate">
          <span className="text-muted flex-shrink-0">
            {m.who} · {ageLabel(m.at)}
          </span>
          {m.url ? (
            <a href={m.url} target="_blank" rel="noreferrer" className="text-reset text-truncate">
              {m.snippet}
            </a>
          ) : (
            <span className="text-truncate">{m.snippet}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function FocusRow({
  item,
  onPin,
  onSnooze,
  onDismiss,
}: {
  item: RankedFocusItem | FocusItem;
  onPin: Props["onPin"];
  onSnooze: Props["onSnooze"];
  onDismiss: Props["onDismiss"];
}) {
  const Icon = KIND_ICON[item.kind];
  const presets = snoozePresets();
  const isPinned = item.signals.isPinned;
  const isDismissed = item.signals.isDismissed;
  const mentionCount = item.mentions?.length ?? 0;
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="py-2 border-bottom small">
      <div className="d-flex align-items-center gap-2">
        <Icon size={16} className="flex-shrink-0 text-muted" />
        <div className="flex-grow-1 text-truncate">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="text-reset">
              {item.title}
            </a>
          ) : (
            item.title
          )}
          <div className="d-flex gap-1 mt-1">
            {Math.floor(item.signals.ageDays) > 0 && (
              <Badge bg="light" text="dark" className="fw-normal">
                age {Math.floor(item.signals.ageDays)}d
              </Badge>
            )}
            {item.signals.ciFailing && (
              <Badge bg="danger" className="fw-normal">
                <IconAlertTriangle size={10} /> CI
              </Badge>
            )}
            {item.signals.jiraPriority && (
              <Badge bg="secondary" className="fw-normal">
                {item.signals.jiraPriority}
              </Badge>
            )}
            {item.signals.isMention &&
              (mentionCount > 1 ? (
                <Badge
                  as="button"
                  type="button"
                  bg="info"
                  className="fw-normal border-0"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  title={expanded ? "Hide mentions" : "Show mentions"}
                >
                  {expanded ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}{" "}
                  {mentionCount} mentions
                </Badge>
              ) : (
                <Badge bg="info" className="fw-normal">
                  mention
                </Badge>
              ))}
            {item.signals.isReviewRequested && (
              <Badge bg="warning" text="dark" className="fw-normal">
                review
              </Badge>
            )}
          </div>
        </div>
        <ButtonGroup size="sm">
          <Button
            variant={isPinned ? "primary" : "outline-secondary"}
            onClick={() => onPin(item.id, !isPinned)}
            title={isPinned ? "Unpin" : "Pin to top"}
          >
            {isPinned ? <IconPinFilled size={12} /> : <IconPin size={12} />}
          </Button>
          <Dropdown as={ButtonGroup}>
            <Dropdown.Toggle variant="outline-secondary" size="sm" title="Snooze">
              <IconClock size={12} />
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {presets.map((p) => (
                <Dropdown.Item
                  key={p.label}
                  onClick={() => {
                    if (p.until !== null) onSnooze(item.id, p.until);
                    else {
                      const input = window.prompt("Snooze until (YYYY-MM-DD HH:mm)");
                      if (!input) return;
                      const t = new Date(input).getTime();
                      if (!Number.isFinite(t)) {
                        window.alert("Could not parse date");
                        return;
                      }
                      onSnooze(item.id, t);
                    }
                  }}
                >
                  {p.label}
                </Dropdown.Item>
              ))}
              {item.signals.snoozedUntil && (
                <>
                  <Dropdown.Divider />
                  <Dropdown.Item onClick={() => onSnooze(item.id, null)}>Un-snooze</Dropdown.Item>
                </>
              )}
            </Dropdown.Menu>
          </Dropdown>
          {item.url && (
            <Button
              variant="outline-secondary"
              href={item.url}
              target="_blank"
              rel="noreferrer"
              title="Open"
            >
              <IconExternalLink size={12} />
            </Button>
          )}
          <Button
            variant="outline-secondary"
            onClick={() => onDismiss(item.id, !isDismissed)}
            title={isDismissed ? "Restore" : "Dismiss"}
          >
            {isDismissed ? <IconArrowBackUp size={12} /> : <IconX size={12} />}
          </Button>
        </ButtonGroup>
      </div>
      {expanded && mentionCount > 1 && <MentionList mentions={item.mentions!} />}
    </div>
  );
}

const whyPopover = (
  <Popover>
    <Popover.Header>How items are ranked</Popover.Header>
    <Popover.Body className="small">
      <strong>Base score</strong> by kind: review-requested PR 50, mention 45, JIRA 10–60 by
      priority, your PR 30, note 20.
      <br />
      <strong>+ age × 2</strong> (capped at +40), <strong>+30</strong> if CI failing on your PR,
      <strong> +1000</strong> if pinned.
    </Popover.Body>
  </Popover>
);

export function FocusView({ groups, loading, offline, onPin, onSnooze, onDismiss }: Props) {
  const [snoozedOpen, setSnoozedOpen] = useState(false);
  const [dismissedOpen, setDismissedOpen] = useState(false);

  const totalActive = groups.pinned.length + groups.topPriority.length + groups.rest.length;

  if (loading && totalActive === 0) {
    return <div className="text-muted small p-3">Loading…</div>;
  }

  if (totalActive === 0 && groups.snoozed.length === 0 && groups.dismissed.length === 0) {
    return (
      <EmptyState
        icon={<IconTarget size={48} />}
        title="Nothing urgent"
        description="You're all caught up — new PRs, mentions, and tasks will show up here."
      />
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3">
        <IconTarget size={20} />
        <h5 className="mb-0">Focus</h5>
        <OverlayTrigger trigger="click" placement="bottom" overlay={whyPopover} rootClose>
          <Button variant="link" size="sm" className="text-muted ms-auto">
            Why these?
          </Button>
        </OverlayTrigger>
      </div>

      {offline && (
        <Alert variant="warning" className="small py-2">
          Saved locally — will sync when backend reconnects.
        </Alert>
      )}

      <section>
        <h6 className="text-uppercase text-muted small">📌 Pinned ({groups.pinned.length})</h6>
        {groups.pinned.length === 0 ? (
          <div className="text-muted small py-2">Pin items you want to focus on today.</div>
        ) : (
          groups.pinned.map((i) => (
            <FocusRow key={i.id} item={i} onPin={onPin} onSnooze={onSnooze} onDismiss={onDismiss} />
          ))
        )}
      </section>

      {groups.topPriority.length > 0 && (
        <section className="mt-3">
          <h6 className="text-uppercase text-muted small">🔥 Top priority</h6>
          {groups.topPriority.map((i) => (
            <FocusRow key={i.id} item={i} onPin={onPin} onSnooze={onSnooze} onDismiss={onDismiss} />
          ))}
        </section>
      )}

      {groups.rest.length > 0 && (
        <section className="mt-3">
          <h6 className="text-uppercase text-muted small">Everything else</h6>
          {groups.rest.map((i) => (
            <FocusRow key={i.id} item={i} onPin={onPin} onSnooze={onSnooze} onDismiss={onDismiss} />
          ))}
        </section>
      )}

      {groups.snoozed.length > 0 && (
        <section className="mt-3">
          <Button
            variant="link"
            size="sm"
            className="text-muted ps-0"
            onClick={() => setSnoozedOpen((o) => !o)}
          >
            💤 Snoozed ({groups.snoozed.length}) {snoozedOpen ? "▾" : "▸"}
          </Button>
          {snoozedOpen &&
            groups.snoozed.map((i) => (
              <FocusRow
                key={i.id}
                item={i}
                onPin={onPin}
                onSnooze={onSnooze}
                onDismiss={onDismiss}
              />
            ))}
        </section>
      )}

      {groups.dismissed.length > 0 && (
        <section className="mt-3">
          <Button
            variant="link"
            size="sm"
            className="text-muted ps-0"
            onClick={() => setDismissedOpen((o) => !o)}
          >
            🗑 Dismissed ({groups.dismissed.length}) {dismissedOpen ? "▾" : "▸"}
          </Button>
          {dismissedOpen &&
            groups.dismissed.map((i) => (
              <FocusRow
                key={i.id}
                item={i}
                onPin={onPin}
                onSnooze={onSnooze}
                onDismiss={onDismiss}
              />
            ))}
        </section>
      )}
    </div>
  );
}
