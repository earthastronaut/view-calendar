# Problem Statement

The registry already ships a working list + month-grid view of a public Google Calendar, but it diverges from the target build instructions (month grid + card list + shadcn date-picker filter). The main gaps are the date-range picker, month-grid correctness and accessibility, multi-day handling in the list, mobile defaults, and missing tests for day bucketing and range filtering. This plan closes those gaps while keeping the deliberate design choices that make the registry dependency-light.

Follow-up (Phase 5): in the playground the "Calendar" view does not render as a monthly calendar; the grid collapses into a stacked list of cells. The most likely cause is that `dev/styles.css` has no Tailwind `@source` for `registry/` (the Vite root is `dev/`, so Tailwind v4 never scans the registry files and utilities such as `grid-cols-7` are never generated), and the theme lacks the `muted`, `destructive` and `popover` tokens the components use. Beyond fixing that, the month view should match the reference design: one toolbar, week-number badges, multi-day bars that span day columns, compact "9a Title" rows, a `+N more` overflow, and a highlighted today badge.

# Scope

## Decisions

- The absolute date-range picker **replaces** the relative "Date range" select and the Upcoming/Past/All select. `timeframe` and the relative `range` are removed from `FilterState`. Quick ranges survive as picker presets.
- **No category filter.** The existing Location filter stays as the only facet.
- AGENTS.md conventions: do only the **cheap parts** in this branch (named React imports, remove the modal's reset `useEffect`). The hand-rolled `useCalendarEvents` hook and the deep-link `useEffect` stay; TanStack Query is not adopted.
- In Month view, a selected date range **highlights** days and events; it does not hide the rest of the month. Search and location still filter both views.

## Deliberate divergences from the instructions (keep; do not "fix")

- No `date-fns`, `@tanstack/react-query` or `dompurify` in `registry/` runtime code. Time math uses `lib/calendar-events/time.ts` (Intl-based) and descriptions use `normalizeDescription` plus the `renderDescription` prop (see AGENTS.md "Dependencies").
- Explicit `timeZone` prop (defaults to the viewer's zone) instead of implicit local time.
- Google API -> iCal -> sessionStorage fallback chain, `baseUrl` proxy, `?event=<id>` deep links, add-to-calendar / `.ics` / share in the modal.
- `CalendarEvent` field names (`summary`, `description`, `htmlLink`) are kept; no rename to `title` / `descriptionHtml`.

## Already satisfied

- Half-open `[start, end)` model; all-day dates parsed as local midnight in the display zone; cancelled events dropped; "(No title)" fallback (`google-api.ts`).
- Pagination via `nextPageToken`, `singleEvents=true`, `orderBy=startTime`.
- Client-side search (title, location, description) and location filter (`filters.ts`).
- Dialog with title, date/time wording, maps link, description, Open in Google.
- Error panel with Retry, mobile count-dot cells, token-only styling.
- Months already loaded are never refetched (the loaded window only grows).

## Gaps to close

1. **Date-range filter.** Need an absolute range chosen with shadcn `Calendar` (`mode="range"`) in a `Popover`, with presets, a label, a Clear button, and event-day dots. A range with only `from` means that single day. It shares `month` state with the grid. It replaces the relative selects (see Decisions).
2. **List view without a timeframe.** Removing Upcoming/Past means the list needs its own month navigation (prev / Today / next, as in the instructions' header). With no range selected, the list shows the visible month only. The "Load earlier events" button goes away; `loadMorePast` stays on the headless hook.
3. **Month grid bucketing.** `byDay` in `calendar-view.tsx` has these problems:
   - It walks at most 42 days from `e.start`, so an event that started before the grid and spans into it is missing or truncated. It needs clipping to the grid window.
   - It does not sort all-day events first.
   - It is private and untested.
4. **Month grid data window.** `changeMonth` ensures only `[monthStart, nextMonthStart)`, so the leading and trailing padding days can be empty for months outside the initial -1/+6 window. It should ensure the week-padded window, with a cap (~366 days) on range-driven fetches.
5. **Month grid UX and a11y:**
   - No `role="row"` wrappers.
   - Day cells are non-focusable `div`s with click handlers (no roving tabindex or arrow/Home/End/PageUp/PageDown keys).
   - `+N more` only toggles an inline card list instead of a Popover.
   - No "continues" marker on days after the first.
   - Chips have no `aria-label` of the form `"{title}, {time|All day}, {date}"`.
   - On mobile, tapping a day should jump to the list filtered to that day.
   - Week start is hard-coded to Sunday (add a `weekStartsOn` prop).
   - No highlight treatment for the selected date range.
6. **Card list.** Events are grouped by start day only, so a multi-day event appears once. It should appear under each covered day, with a sticky day header and all-day events first. Cards should be a single interactive element; today a `div role="button"` contains a nested `<a>`.
7. **Container states.** The loading state is plain text and needs a skeleton on first load. The empty state needs a **Clear filters** button. There is no default to List below `md`.
8. **Modal.** `htmlLink` is rendered without checking it starts with `https://`.
9. **URL state (optional in the instructions).** Only `?event=` is synced. Add `view`, `q`, `from`, `to`, `month`.
10. **Fetch payload.** No `fields` param on `events.list`.
11. **Tests.** Missing coverage for: bucketing (single all-day, 3-day all-day, crossing midnight, ending exactly at midnight, DST weekend with `TZ=America/Los_Angeles`, event starting before the window), absolute-range filtering (range Nov 9-9 excludes the all-day Nov 8 event), the highlight rule, and the date filter component. Existing tests for `timeframe` / relative `range` must be replaced.
12. **Cheap AGENTS.md conventions.** Replace `import * as React from "react"` with named / `import type` imports in `registry/` files, and replace the `useEffect` that resets share state in `event-modal.tsx` (derive it by keying state on the event).

## Month view redesign (reference screenshot)

Target layout, top to bottom:

1. **Toolbar** (one row, shared by Month and List): `[Today]` `[‹][›]` **Month YYYY** on the left, a segmented `Month | List` switcher on the right. The screenshot's Add Event button and Week tab are intentionally omitted: the registry is read-only and has no Week view. This replaces the "List / Calendar" tabs in `calendar-events.tsx` and the per-view `MonthHeader`. The view value `"calendar"` is renamed `"month"`.
2. **Weekday header row**: uppercase, muted, centred over each column, ordered by `weekStartsOn`.
3. **Week rows**: 6 (or 5) equal-height rows with 1px dividers, inside one rounded bordered container. Each row starts with a **week-number badge** (`W45`). Week 1 is the week containing Jan 1, and weeks begin on `weekStartsOn`; this gives `W45` for the row starting Sun Nov 1 2026.
4. **Day cell**: day number top-left. Today gets a filled circular badge (token colour). Days outside the month use a muted number. Hover gives a subtle cell background.
5. **All-day events render as bars**, single-day or multi-day. A bar is a filled, rounded, token-coloured block with the title at its left edge. It spans the day columns it covers within the week row, and splits at the week boundary (square end on the clipped side, title repeated on the continuation). Bars sit in lanes above the timed rows, and every cell the bar covers reserves its lane so timed rows align below it.
6. **Timed events render as one-line rows**: a small dot, the compact start time (`9a`, `1p`, `10:30a`, `12p`), then the bold title, truncated.
7. **Overflow**: a cell shows at most 3 rows (lanes + timed rows). When more exist, the last row becomes `+N more`, where N counts every hidden item. Example: 7 timed events plus 1 bar show the bar, 1 event and `+6 more`. The existing popover lists all events for the day.
8. **Mobile** (below `md`) keeps the count-dot cells and the tap-to-list behaviour; bars and rows are desktop only.

The grid must keep the roving-tabindex keyboard model, `role="grid"` / `row` / `gridcell` structure, chip `aria-label`s (bars use `"{title}, All day, {first day} to {last day}"`), range highlight and dimming from Phase 3.

## Playground styling (root-cause fix)

- `dev/styles.css` must add `@source "../registry"` so Tailwind scans the component files, and define the missing theme tokens (`muted`, `muted-foreground`, `destructive`, `popover`, `popover-foreground`) plus a dark set so the reference look can be reproduced.
- Consumers are unaffected, since their Tailwind already scans their `components/` directory.

## Out of scope

- Category filter.
- Week and day views, an Add Event button or any editing, drag-and-drop, multiple calendars, per-calendar colours.
- Migrating `useCalendarEvents` to TanStack Query, and removing the deep-link `useEffect`.

# Solution

Build on the existing structure rather than re-creating `src/features/gcal/`. Map the instruction files onto current ones:

| Instruction file | Existing home | Change |
| --- | --- | --- |
| `types.ts`, `google.ts` | `lib/calendar-events/types.ts`, `google-api.ts` | Add `fields` |
| `date-utils.ts` | `lib/calendar-events/time.ts` | Add `bucketByDay`, `fetchWindow`, week-start helpers (tz-aware, no date-fns) |
| `filters.ts` | `lib/calendar-events/filters.ts` | Replace `timeframe` / `range` with absolute `dateRange` |
| `use-calendar-events.ts` | `hooks/use-calendar-events.ts` | Keep API; `ensureRange` receives the padded window |
| `filter-bar.tsx`, `date-filter.tsx` | `filters-bar.tsx` + new `date-filter.tsx` | Search + date picker + location + Clear |
| `month-grid.tsx`, `event-list.tsx`, `event-dialog.tsx` | `calendar-view.tsx`, `list-view.tsx`, `event-modal.tsx` | Fix/extend in place; keep names |

**Filter model.** `FilterState` becomes `{ search, location, dateRange?: { from: Date; to?: Date } }`. `dateRange` has absolute dates and `to` defaults to `from`. `filterEvents` applies search and location, and applies `dateRange` as half-open overlap against `[startOfDay(from), endOfDay(to ?? from)]`. It sorts by start time ascending. `rangeWindow`, `Timeframe`, `RelativeRange` and `matchesTimeframe` are removed. The headless API is breaking, so update the README example.

**Views.**
- **List:** `filterEvents` with the month fallback range when `dateRange` is unset. Events are bucketed per day with `bucketByDay`.
- **Grid:** `filterEvents` with search and location only. `dateRange` is passed separately so days inside the range get a highlight style and events on other days are dimmed (`opacity` + token classes). Nothing is hidden.
- **Parity:** for the same search and location, both views show the same events; only the date range treatment differs.

**Date filter.** The picker imports shadcn `calendar` and `popover` via `registryDependencies`. Presets (Today, Next 7 days, This month, Last 7 days, Last month) are computed in the component from `time.ts` helpers. Add `react-day-picker` and `date-fns` to **devDependencies only**, with dev stand-ins in `dev/ui/` as with `button` and `dialog`. Selecting a range calls `ensureRange` with the padded window, capped at 366 days.

**Bucketing.** One shared `bucketByDay(events, from, to, timeZone)` clips to `[from, to)` and sorts all-day first and then by start. Both views use it.

**Week layout (Phase 5).** A pure, tz-aware `layoutWeek(events, weekDays, timeZone, maxRows)` in `lib/calendar-events/` (next to `bucketByDay`, exported from `index.ts`) returns, for one week row:
- `bars`: `{ event, startCol, span, lane, continuesBefore, continuesAfter }` for all-day events, clipped to the row, with lanes assigned greedily (earliest start, then longest first) so overlapping bars stack.
- `days[7]`: `{ timed: CalendarEvent[], hidden: number }`, where `hidden` is what no longer fits under `maxRows` once the lanes the day uses are counted.

`CalendarView` renders each week as one `role="row"` CSS grid (`grid-cols-7`). The day cells keep their own `gridcell` role and focus handling; bars are `<button>`s positioned by `grid-column: {startCol} / span {span}` in the lane rows above the cells' timed content, so keyboard order and the bucketing from Phase 1 are unchanged. Timed rows use a new `formatCompactTime` in `time.ts`. Week numbers come from a `weekNumber(day, weekStartsOn, timeZone)` helper in `time.ts`.

Rendering all-day events as bars replaces the per-day "↳ continues" chip from Phase 3, since the bar itself shows continuation. The list view still uses `bucketByDay`, so multi-day events keep repeating per day there.

**Why not copy the instructions' stack.** The `date-fns`, `react-query` and `dompurify` choices would add runtime dependencies that AGENTS.md says to avoid, and the Intl-based `time.ts` is already tested against DST and all-day edge cases.

# Tasks

## Phase 1: Shared day math and correctness

- [x] Add tz-aware `bucketByDay(events, from, to, timeZone)` (clipped to `[from, to)`, all-day first, then start) and a week-padded `fetchWindow(month, range?, weekStartsOn, timeZone)` capped at 366 days. Place them in `lib/calendar-events/` and export them from `index.ts`. Covers gaps 3 and 4.
- [x] Replace the inline `byDay` in `calendar-view.tsx` with `bucketByDay`, and make `changeMonth` / `ensureRange` use the padded window.
- [x] Add `fields` to the `events.list` request. Tests in `tests/core.test.ts`, run with `TZ=America/Los_Angeles`, for every bucketing case in gap 11.

## Phase 2: Filter model and date picker

- [x] Replace `timeframe` / relative `range` with absolute `dateRange` in `filters.ts` (`FilterState`, `defaultFilters`, `isFiltered`, `filterEvents`; remove `rangeWindow` and the related types). Add the month-fallback helper for List. Replace the old filter tests with range tests (single-day-when-only-`from`, Nov 9-9 excludes the all-day Nov 8 event, overlap).
- [x] Create `ui/calendar-events/date-filter.tsx` (shadcn `Calendar` in `Popover`, presets, label, Clear, event-day dots from loaded days, shared `month`). Rewrite `filters-bar.tsx` to search + date filter + location + Clear, dropping both selects.
- [x] Update `registry.json` (`registryDependencies`: `calendar`, `popover`, plus the new files), add dev stand-ins and devDependencies, update the README filter example, and confirm `pnpm registry:build` output.

## Phase 3: Views

- [x] List view: add prev / Today / next month header, per-day grouping through `bucketByDay` so multi-day events repeat, sticky day headers, no "Load earlier events" button, and a single-interactive-element card (stretched-button pattern, maps link not nested).
- [x] Month grid a11y: `role="row"` wrappers, roving `tabIndex` with arrow/Home/End/PageUp/PageDown keys, Enter/Space to focus the first chip, chip `aria-label`s, a "continues" marker, a `weekStartsOn` prop, and a `+N more` Popover.
- [x] Month grid range highlight (highlight days in `dateRange`, dim other events) and mobile behaviour: default to List below `md` (via a `matchMedia` subscription, not an effect that sets state), and make a day tap set `dateRange = { from: day, to: day }` and switch to List.

## Phase 4: States, modal, conventions

- [x] Container: first-load skeleton and an empty state with **Clear filters**. Modal: render `htmlLink` only when it starts with `https://`.
- [x] Cheap AGENTS.md conventions (gap 12): named React imports across `registry/`, and drop the `useEffect` in `event-modal.tsx` (state now lives in `EventDetails`, keyed on the event id).
- [ ] Optional: sync `view`, `q`, `from`, `to`, `month` to the query string beside `event` (behind `syncUrl`). Not started: a `from`/`to` or `month` outside the hook's initial -1/+6 month window would need the hook to accept an initial window, or an effect-once `ensureRange` on mount. Then run `pnpm typecheck` and `pnpm test` (both pass as of this phase), and walk through the manual checklist from the build instructions section 11 in `pnpm dev` (not yet done).

## Phase 5: Monthly calendar rendering (reference screenshot)

- [x] Fix the playground styling: add `@source "../registry"` and the missing tokens (`muted`, `muted-foreground`, `destructive`, `popover`, `popover-foreground`) plus a dark set in `dev/styles.css`. Run `pnpm dev` and confirm the grid renders as 7 columns before changing any component code. If it still stacks, diagnose further before continuing.
- [x] Add the pure helpers with tests in `tests/core.test.ts` (run with `TZ=America/Los_Angeles`): `layoutWeek` (single-day bar, 3-day bar, bar crossing the week boundary splits with `continuesBefore` / `continuesAfter`, overlapping bars take separate lanes, overflow `hidden` count matching the 7-timed + 1-bar example), `weekNumber` (`W45` for Nov 1 2026, year wrap) and `formatCompactTime` (`9a`, `12p`, `10:30a`).
- [x] Rebuild the `CalendarView` week rows on `layoutWeek`: week-number badge column, bars in lanes with rounded/square ends, one-line dot + time + bold-title rows, `+N more` as the last row (popover unchanged), today badge, hover background, muted out-of-month days. Keep roving tabindex, `role` structure, range highlight/dim and the mobile count dots.
- [x] Unify the toolbar in `calendar-events.tsx`: Today, prev/next, month title, and a Month | List switcher (no Add Event, no Week). Rename the view `"calendar"` to `"month"` (type, `defaultView`, dev `config-form`, README) and drop `MonthHeader` from inside `CalendarView` and `ListView`.
- [x] Add component tests in `tests/component.test.tsx`: the grid has 7 `columnheader`s and 5-6 `row`s of 7 cells, a multi-day all-day event renders one bar per week row with the expected `aria-label`, a day with 5 timed events shows `+N more`, and the week-number badge is present. Then run `pnpm typecheck` and `pnpm test`, and compare `pnpm dev` against the screenshot at desktop width (also check dark mode and a 375px width).

# Additional Tasks

- [x] add an expire for the cache. On the dev page have a event cache clear button
- [x] for dev mode, read variables from .env if available and pre-populate the fields. Create .env.example
- [x] list view, for multiple day events, have an option (`multiDayList="start"`) to show one entry based on start date, showing start and end time
- [x] for calendar view, multi day events should be a bar across multiple days (all-day bars already existed; timed events that cross midnight now also render as bars via `layoutWeek`)
- [x] In calendar view add an option that the day can be rendered into a modal if click the day itself (not an event). renderDay as an option passed in as well. (`dayModal` and `renderDay` props on `CalendarEvents`; new `day-modal.tsx`; `renderDay` implies `dayModal` unless it is `false`)
