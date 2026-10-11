# Workday modes (Focus | Standup) — design

Date: 2026-10-12
Status: approved in brainstorming (mockup signed off), pending implementation
Builds on: `2026-10-11-workday-design.md`

## Goal

Workday currently does two jobs on one page, and does both noisily:

1. **Focus**: "what needs me right now?" (triage, through the day)
2. **Standup**: "what do I tell the team?" (once a day, then copy to Slack)

Those are different needs with different UX. Split Workday into two **modes**
behind a toggle, both built from the same data:

- **Focus** is a short, prioritised list of what's waiting on you, plus
  mentions, current work, and what you're waiting on.
- **Standup** is a compact report whose on-screen sections mirror the copied
  standup text exactly.

Both modes are **view-only**: no action buttons. Rows open the existing
read-only PR modal / Jira drawer, same as today.

Mockups (gitignored; regenerate from this spec if lost):
- `.superpowers/brainstorm/workday-modes/workday-modes.html`: the interactive
  two-mode mockup, the approved design
- `.superpowers/brainstorm/workday-modes/workday-mockup.html`: an earlier
  single-page iteration, kept for reference

## Problems with today's page (why)

- **Duplication.** "Working on" lists every open PR of mine. "Blockers" and
  "Waiting on others" are subsets of the same PRs, so most PRs render twice,
  each under its own ticket header.
- **Two rows per PR.** Every ticket gets a header (key, summary, status, count,
  time) and then a full PR card whose title usually repeats the key and summary.
- **Too many badges.** Jira status, off-sprint, reason badges, review state, CI
  icon and GitHub labels all compete for attention.
- **Mixed intent.** The section order suits writing a standup. Triage items
  (blockers, reviews waiting on me) sit mid-page.
- **Unclear review labels.** "Review requested" vs "Reviewed" described GitHub
  state, not whose move it is. A re-request looked identical to a fresh request.

## Decisions

| Topic | Decision |
|---|---|
| Structure | One Workday tab with a **Focus \| Standup** mode toggle in the header |
| Default mode | **Focus**; last choice persisted in localStorage (`workday.mode`) |
| Shortcuts | `F` / `S` switch modes (ignored while typing in inputs) |
| Interaction | **View-only.** No action buttons anywhere. Rows open the existing PR modal / Jira drawer |
| Needs you | A to-do-style strip in Focus. Rows clear themselves when upstream state changes. Never part of the copied standup |
| Overlap | Intended. A PR can be in *Needs you* (Focus) and *In progress* (Standup); each mode is complete on its own |
| Ordering | Needs you: by tier, then newest first. Every other section: newest first (already implemented) |
| Sprint filter / Copy / Collapse all | **Standup only** |
| Copied standup text | Format unchanged |
| Focus tab | Out of scope here. The old Focus tab is deprecated and will be removed separately. Nothing here reuses its scoring, pin/snooze storage or UI |

## Header

```
Workday  [Mon, Oct 12]  [ Focus F | Standup S ]          [All|Sprint only|Off-sprint·N]  Refresh  [Copy standup]
7 things need you · updated just now                       └──────── Standup only ────────┘          └ Standup only ┘
```

- The subtitle depends on mode. Focus: "N things need you" / "All clear".
  Standup: "Since <last workday>".
- Sections in both modes fold open and closed; fold state is persisted per section.

## Focus mode

Single column, top to bottom:

### 1. Needs you

One line per item: **coloured verb** · ticket key (or `—`) · title · short
reason · relative time. The verb is a label, not a button. Clicking the row
opens the PR/ticket. Items are grouped into tiers, in this order:

| Tier | Verb | Tone | Rule (own PRs exclude drafts) |
|---|---|---|---|
| Unblock yourself | **Fix CI** | danger | my PR, `checks_status === "FAILURE"` |
| | **Resolve conflict** | danger | my PR, `has_conflict` |
| | **Address feedback** | danger | my PR, `review_status === "CHANGES_REQUESTED"` |
| | **Request review** | warning | my PR, no requested reviewers and no reviews (same rule as today's "No reviewer requested" blocker) |
| Unblock others | **Re-review** | warning | review requested **and** `viewer_engaged` (re-request) |
| | **Re-review** | warning | *(phase 3)* not requested, `new_commits_since_review`, and my latest review ≠ APPROVED |
| | **Review** | info | review requested, not `viewer_engaged` |
| Ship | **Merge** | success | my PR, approved, CI success, no conflict, not in merge queue |

- A PR that matches several "unblock yourself" rules shows once, using the
  first matching verb in table order.
- The reason text gives one fact: "lint + unit failing · 20m", "abu
  re-requested · 1h", "3 commits since your review · 3h", "approved by tomas ·
  CI green". For new review requests, append the diff size.
- **Empty state:** the strip shrinks to one line, "✓ Nothing needs you right
  now".
- Visual: amber border and tint, matching the mockup. Tier labels are small
  uppercase subheads.

### 2. Mentions

GitHub and Jira mentions from the **last 3 days**, newest first. Each row shows
the source, who, ticket key, where (repo#/key), a one-line snippet, and the
time. Data comes from `useDashboard` (`githubMentions` + Jira mentions); it is
not passed to Workday today.

### 3. Working on

One line per active ticket (in-progress tickets assigned to me, plus tickets my
open PRs reference): key, summary, Jira status, PR count, **one** state badge,
and the time. The badge is the most severe state across the ticket's PRs:

`CI failing > Conflict > Changes requested > No reviewer > Approved > Waiting on <reviewer> > Draft > No PR yet`

Off-sprint tickets keep the dashed **Off-sprint** pill.

### 4. Waiting on others (collapsed by default)

Nothing for you to do here; it's useful for nudging people. Three parts:

- **Your PRs, waiting on reviewers:** "tomas · 1d", "team cmp-fe · 2d".
- **Reviews, waiting on author:** you reviewed, nothing is pending on you. The
  badge says what you did and when: "You requested changes · 3d" (danger), "You
  commented · 1d" (info). *(Phase 1 shows "You reviewed" until phase 3 data
  lands.)*
- **Approved by you:** folded into a single "+N you approved, awaiting merge"
  line that expands when clicked. *(Phase 3.)*

## Standup mode

Two columns. On the left are sections that mirror the copied text. On the right
are notes and Copy.

1. **Done since <last workday>.** Compact one-line rows (what · key · title ·
   time). Same data and lookback as today.
2. **In progress.** Each PR appears **once**, with its state as the row's single
   badge. A PR alone on its ticket is one row with the key inline. Only tickets
   with 2+ PRs keep a group header, with the PRs indented beneath it. Tickets
   with no PR show a "No PR yet" row. PRs without a ticket are rows with "no
   ticket". This replaces today's Working on + Blockers + Waiting card
   duplication.
3. **Blockers.** One-liners (reason · key · title): CI failing, conflict,
   changes requested, no reviewer, Jira-flagged tickets. These intentionally
   overlap In progress, because the Blockers heading in the copied text needs
   them.
4. **Reviewing.** One-liners with a state label: Re-requested / New commits /
   Requested / Waiting on author, plus the author.
5. **Assigned, not started** (collapsed by default). Same as today, compact
   rows, with an Off-sprint subhead.

Side column: **Standup notes** (unchanged), plus **Standup text** with a
*Preview* toggle. The preview is hidden by default and updates live as you type
notes. **Copy standup** stays the primary header button.

The sprint filter (All / Sprint only / Off-sprint · N) applies to every Standup
section and to the copied text, as it does today.

## Row density (both modes)

Workday rows drop author (on my own PRs), branch, diff stat, GitHub labels and
the copy-ref button. All of these stay available in the PR modal. Copy-link
remains available on hover. The reason/state badges added on 2026-10-12 (inside
the card's top-right slot, above timestamps) are the single place state shows.

## Data

### Reused as-is
`openPRs`, `reviewRequests` (with `viewer_engaged`), `reviewingPRs`, the Jira
assigned/sprint/off-sprint sets, and the `workday` extras (merged, reviewed,
doneTickets). These already drive today's page.

### New: pass mentions into Workday
`App.tsx` passes `githubMentions` and the Jira mentions from `useDashboard` to
`WorkdayView`. They're already fetched for the Mentions view, so this adds no
new request.

### New: review-plate fields (phase 3)
`REVIEW_SEARCH_QUERY` doesn't fetch reviews or commit times today. Add:

- `reviews(last: 20) { nodes { state submittedAt author { login } } }`
- the head commit's `committedDate` (alongside the existing checks rollup)

Map the following onto `GitHubPR`, in `mapping.ts` and `types.ts`:

| Field | Meaning |
|---|---|
| `viewer_review_state` | my latest review: `APPROVED` / `CHANGES_REQUESTED` / `COMMENTED` / null |
| `viewer_reviewed_at` | when I submitted it |
| `new_commits_since_review` | head commit date is later than `viewer_reviewed_at` |

`committedDate` can predate a force-push. That's acceptable as an approximation;
switch to `pushedDate` / timeline events only if it proves noisy.

### Composition
- New pure module `src/views/workday/buildFocus.ts`: `buildFocus(inputs, now)`
  returns `{ needs: NeedsItem[], mentions, working, waiting }`, with the tier and
  verb rules above. Fully unit-tested, like `buildWorkday.ts`.
- `buildWorkday.ts` keeps building the Standup sections. It changes to emit In
  progress without the Blockers/Waiting duplication, and Blockers/Reviewing as
  one-liner items.

## Components

- `WorkdayView.tsx`: the shell. Header, mode toggle, shortcuts, shared PR modal,
  toast, refresh.
- `FocusMode.tsx`: Needs you, Mentions, Working on, Waiting on others.
- `StandupMode.tsx`: the current sections, notes, preview and copy (moved out
  of `WorkdayView`).
- `NeedsYouStrip.tsx`, plus a small compact-row component shared by the
  one-liner sections.
- Reuses `WorkdaySection`, `TicketGroupList`/`PRCard` (with the compact field
  set), and `Badge`.

## Phases (each shippable)

0. **Checkpoint.** Commit the in-flight changes: review badges inside the card,
   newest-first ordering in every section.
1. **Mode shell plus Needs you from existing data.** Toggle, shortcuts,
   persistence. Focus shows Needs you (every rule except phase-3 Re-review),
   Working on and Waiting on others. Standup keeps today's sections.
2. **Standup cleanup.** Each PR once in In progress, compact rows, Blockers and
   Reviewing as one-liners, preview on demand.
3. **Review data.** The new review-plate fields, "Re-review: new commits",
   "You requested changes · 3d" badges, and folding approved PRs.
4. **Mentions in Focus.**

## Errors and loading

- Each section keeps today's skeleton/error behaviour (`WorkdaySection`).
- Needs you shows skeleton rows while open PRs or review requests are loading.
  A source error shows inline in the strip and doesn't hide items from other
  sources.
- If a mode's data isn't loaded yet, switching modes doesn't trigger extra
  fetches. Both modes read the same already-loaded data.

## Testing

- `buildFocus.test.ts`: each verb rule, the tier order, one verb per PR, draft
  exclusion, Merge preconditions, the empty result, and newest-first within a
  tier.
- `buildWorkday.test.ts`: In progress has no duplicates; Blockers and Reviewing
  one-liner items.
- `mapping.test.ts` (phase 3): `viewer_review_state`, `viewer_reviewed_at` and
  `new_commits_since_review`, including no review, dismissed, and comment-only.
- `WorkdayView.test.tsx`: the toggle switches sections and persists; `F`/`S`
  shortcuts work and are ignored in the notes textarea; sprint filter and Copy
  appear only in Standup; Needs you empty state.
- Copied standup output is unchanged (the existing `workdayMarkdown` tests keep
  passing).

## Out of scope

- Removing the old Focus tab (separate session).
- Any write actions: merge, request review, dismiss/snooze. The page stays
  view-only. "Dismiss for today" can be revisited later if Needs you proves
  noisy.
- Changes to the copied standup format.
- Auto-switching mode by time of day.
