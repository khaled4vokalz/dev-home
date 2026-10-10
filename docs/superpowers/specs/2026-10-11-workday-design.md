# Workday (standup) page — design

Date: 2026-10-11
Status: approved in brainstorming, pending spec review

## Goal

A single **Workday** sidebar tab that holds everything needed for a daily
standup update and stays useful for the rest of the day: what I finished since
the last workday, what I'm working on (own PRs + reviews), what's blocking or
waiting, and what's assigned but not started. Work outside the active sprint
is woven into those sections with an **Off-sprint** indicator rather than
listed separately. A **Copy standup** button produces Slack-ready markdown.

Mockup: `.superpowers/brainstorm/5861-1791656252/content/workday-v2.html`
(gitignored; regenerate from this spec if lost).

## Decisions

| Topic | Decision |
|---|---|
| Use case | Read on screen during standup **and** copy as Slack markdown |
| Placement | New sidebar tab **Workday** only (no Summary button) |
| "In sprint" | Ticket is in **any open sprint** (`sprint in openSprints()`); no board config |
| Off-sprint work | No separate section — woven into the normal sections with a dashed **Off-sprint** label; header filter All / Sprint only / Off-sprint |
| Off-sprint window | Off-sprint *not-started* tickets limited to those updated in the **last 60 days** |
| Weekend | Configurable in Settings, **default Friday + Saturday** |
| Data approach | **A** — compose client-side from existing dashboard sources + one new lazy `workday` source |
| Notes | Real notes in the existing notes store, new note type **`standup`**, shown everywhere with a "Standup" badge |

## Page layout

Two columns: sections on the left, notes + copy preview on the right.
Header: title, today's date pill, "Since <last workday start>" subtitle,
sprint filter chips (**All** · **Sprint only** · **Off-sprint · N**, persisted
in localStorage), **Refresh**, **Copy standup** (primary).

### Off-sprint indicator

A ticket is **off-sprint** when it is assigned to me, unresolved, and not in
any open sprint. Off-sprint tickets are routed into the regular sections by
their state (below) and carry a dashed amber **Off-sprint** pill wherever they
appear (ticket group header, row, Blockers/Waiting rows). Rules:

- Only tickets **assigned to me** can be marked off-sprint; PRs I review on
  other people's tickets never get the indicator (their sprint state is
  unknown).
- PRs inherit the indicator from their ticket.
- The sprint filter hides/shows rows by this flag; **N** counts distinct
  off-sprint tickets on the page. With *Sprint only*, PRs with no ticket stay
  visible.

Sections, top to bottom:

1. **Done since last workday** — lookback toggle: *Last workday* (default) /
   *3 days* / *7 days* (persisted in localStorage). Rows, newest first:
   - my PRs merged since `since` (pill "Merged");
   - reviews I submitted on others' PRs since `since` (latest per PR; pill
     "Approved" / "Changes requested" / "Commented");
   - Jira tickets whose status I changed since `since` (pill "To <status>").
2. **Working on** — same ticket grouping as My PRs (`groupByTicket`; group
   header = ticket key, summary, Jira status, PR count; PR rows nested).
   Contains:
   - my open PRs (`openPRs`), grouped by `ticketKeyOf`;
   - assigned tickets with status category *indeterminate* (In Progress,
     Code Review, …) that have no open PR of mine — rendered as a group header
     only, with a dashed **"No PR yet"** pill;
   - PRs without a ticket key under a "No ticket" group.
   Off-sprint in-progress tickets appear here too, with the Off-sprint pill,
   regardless of age.
3. **Reviewing** — union of `reviewRequests` and `reviewingPRs` (deduped by PR
   URL), grouped by ticket. Rows show author, "review requested" vs "you
   requested changes" (+ "author pushed since" when the head commit is newer
   than my last review), and waiting time.
4. **Blockers / needs attention** — my open PRs whose `categorizeOpenPR`
   result is `needs-action` (failing checks, changes requested, conflicts), my
   non-draft PRs with no reviewer requested, and assigned tickets with Jira
   **Flagged** (`customfield_10021`) set.
5. **Waiting on others** — my non-draft open PRs awaiting review (with age
   since review requested / opened) and approved-but-unmerged PRs ("your
   move"); assigned tickets in status *Code Review* show their Jira **Code
   Reviewers** (`customfield_10324`, already mapped to
   `JiraIssue.codeReviewers`).
6. **Assigned, not started** — tickets with status category *new* and no open
   PR of mine. Sprint tickets first (sprint name, story points
   `customfield_10127`); then, under a muted "Off-sprint" divider, off-sprint
   tickets updated in the last 60 days, newest first, showing the first 3 with
   a "Show N more" expander. Off-sprint rows show last-updated age.

Right column:

- **Notes for today** — textarea bound to today's standup note (below).
- **Copy preview** — live rendering of the markdown that Copy standup puts on
  the clipboard.

A PR may appear in more than one section on screen (e.g. Working on +
Blockers); that is intentional. The copied text deduplicates.

## Data

### Reused (already loaded/cached by `useDashboard`)

- `openPRs` → Working on, Blockers, Waiting.
- `reviewRequests`, `reviewingPRs` → Reviewing.
- `assignedJiraIssues` → ticket summaries/status, no-PR tickets,
  `codeReviewers`.

`tabData.ts` registers the Workday tab against these existing sources plus the
new `workday` source, so `ensure()` lazy-loading and the scoped Refresh work
unchanged.

### New `workday` source (lazy — fetched only when the tab is opened)

Jira (server-proxied, like all Jira calls):

1. **Sprint membership** —
   `assignee = currentUser() AND sprint in openSprints() AND statusCategory != Done`;
   fields: `summary, status, customfield_10020 (Sprint), customfield_10127
   (Story Points), customfield_10021 (Flagged), customfield_10324`.
   Returns per key: sprint name (active one), points, status category, flagged.
2. **Off-sprint tickets** (data for the indicator and routing, not a section) —
   `assignee = currentUser() AND resolution = Unresolved AND (sprint is EMPTY OR sprint not in openSprints()) AND updated >= -60d ORDER BY updated DESC`;
   `BASE_ISSUE_FIELDS` + flagged. Paginate with `nextPageToken`, cap 200.
3. **Done since** —
   `status CHANGED BY currentUser() AFTER "<since yyyy-MM-dd HH:mm>" ORDER BY updated DESC`
   with `expand=changelog` limited to the last status change by me after
   `since`; returns key, summary, `toStatus`, `changedAt`. Cap 50.

Sprint/points/flagged custom-field IDs are site-wide on optimizely-ext and are
hardcoded alongside `CODE_REVIEWERS_FIELD` in `src/api/jira/issues.ts`.

GitHub (client-side):

4. **Merged** — existing `fetchRecentlyMergedPRs("user", since)`.
5. **Reviewed** — GraphQL search `is:pr reviewed-by:@me -author:@me updated:>=<since date>`,
   selecting each PR's reviews by the viewer with `submittedAt`/`state`; keep
   PRs with a viewer review submitted at or after `since`, latest state per PR.
   Cap 50.

Each sub-request resolves independently; a failure is recorded per section and
does not fail the whole source.

### `mapIssue` change

Add `status.statusCategory.key` (`new` | `indeterminate` | `done`) to the
mapped shape and to `JiraIssue`, so "not started" / "in progress" use Jira's
category rather than colour.

### Composition

Pure function `buildWorkday(inputs, now, settings) → WorkdaySections` in
`src/views/workday/buildWorkday.ts`. Inputs are the
reused dashboard arrays plus the `workday` source result; output is the six
sections in display order, each with `items` and an optional `error`.

Pure function `lastWorkdayStart(now, weekendDays) → Date`: local midnight at
the start of the most recent day before `now` that is not a weekend day.
Lookback toggle values map to `since` = `lastWorkdayStart`, `now − 3d`,
`now − 7d` (local midnight).

## Settings

New config field `weekendDays: number[]` (JS `getDay()` values), default
`[5, 6]` (Fri, Sat). Edited in Settings → General as seven day toggles. Stored
with the rest of the config in `services/config.ts`.

## Standup notes

- New `NoteType` **`standup`**; add to `VALID_TYPES` in
  `src/services/notes.ts`. `reference_id` is required:
  `standup:YYYY-MM-DD` (local date). Title: `Standup · Sun 11 Oct`.
- Workday finds today's note by `reference_id`. The note is created on the
  first keystroke (no empty notes for days with nothing typed) and saved
  debounced (~600 ms) via `updateNote`.
- Standup notes appear everywhere notes do (Notes, Summary, Focus, Kanban)
  and are never auto-resolved.
- Badge logic is centralised: new `noteBadge(note) → { label, variant }` in
  `src/utils/` replaces the duplicated type→badge mapping in `App.tsx:371`,
  `useKanban.ts:296`, `KanbanBoard.tsx:275` and the type branches in
  `utils/text.ts`. `standup` → label **"Standup"**, purple variant.

## Copy standup

Pure function `workdayToMarkdown(sections, noteContent) → string`:

```
*Yesterday*
• Merged CCP-1187 Fix autosave race (#2231)
• Moved WMU-402 to Code Review
• Reviewed CPC-49 (approved), DAM-612 (changes requested)

*Today*
• WMU-402 Delete mwr v2 prod data — #3310 in review, #3318 draft
• CCP-1210 Spike: rich-text paste handler (no PR yet)
• Reviewing DAM-640, CPC-55

*Blockers*
• CCP-1190 flagged in Jira
• WMU-402 #3310 waiting on review from Guru Gayen (2d)
• <each non-empty line of today's standup note>
```

- *Yesterday* = section 1. *Today* = sections 2 + 3. *Blockers* = sections
  4 + 5 + note lines.
- Each ticket/PR appears once, at its highest-priority placement:
  Blockers > Today. Empty headings are omitted.
- Not-started section is not included.
- Off-sprint items are suffixed `(off-sprint)`, e.g.
  `• CHD-88 Preview links expire too early (off-sprint, no PR yet)`.
- Clipboard write confirms with the bottom-fixed toast (no inline alert).

## Navigation wiring

- `NAV_GROUPS` (`src/config/navTabs.ts`): add `{ key: "workday", label: "Workday" }`
  directly after Summary; toggleable in Settings → Menu items.
- `tabMeta` icon in `App.tsx`; render branch lazy-imports
  `src/views/workday/WorkdayView.tsx`.
- `TAB_SOURCES` / `PAGE_REFRESH` entries in `src/config/tabData.ts`.

## Errors and loading

- Each section renders its own skeleton while its inputs load and its own
  inline error if its query failed; other sections are unaffected.
- Jira not configured → Jira-backed sections show "Connect Jira in Settings";
  GitHub sections still render.
- Empty sections render a one-line muted empty state rather than disappearing,
  so the page layout stays stable.

## Testing

- `buildWorkday`: ticket grouping, no-PR tickets, off-sprint flagging and
  routing into Working on / Blockers / Waiting / Not started, 60-day limit only
  on off-sprint not-started, not-started by status category, Reviewing dedupe
  (never flagged), Blockers/Waiting selection.
- Sprint filter: All / Sprint only / Off-sprint visibility and the N count.
- `lastWorkdayStart`: weekday, day after weekend, custom weekend sets, all-days
  edge case (falls back to yesterday).
- `workdayToMarkdown`: dedupe priority, omitted empty headings, note lines.
- `noteBadge`: every note type.
- New Jira/GitHub API functions with the mocked HTTP adapter (JQL, fields,
  pagination, per-request failure isolation).
- `WorkdayView` render test with fixture data.

## Out of scope

- Per-board / team-specific sprint selection.
- Posting to Slack directly.
- Commit-level activity and Jira comment activity in "Done since".
