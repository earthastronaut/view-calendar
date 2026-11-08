# calendar-events

A shadcn-style registry for showing a **public Google Calendar** as a list or month grid, with filtering, an event modal, and Maps / add-to-calendar / share links.

Two registry items:

- `calendar-events-core` — headless: loading (Google API → iCal → cache), filters, links, plain-text descriptions, `useCalendarEvents` hook. No UI, no runtime dependencies.
- `calendar-events` — UI built on shadcn `button`, `calendar`, `dialog`, `input`, `popover`. Depends on the core.

## Use

```tsx
import { CalendarEvents } from "@/components/calendar-events"

<CalendarEvents
  calendarId="xxxx@group.calendar.google.com"
  apiKey={import.meta.env.PUBLIC_GOOGLE_CALENDAR_API_KEY} // optional; falls back to iCal
  timeZone="America/Los_Angeles"                          // optional; default browser tz
  defaultView="list"                                      // optional: "list" | "month"; default is month at md+, list below
  multiDayList="start"                                    // optional: "each" (default) repeats multi-day events per day; "start" lists them once
/>
```

Headless only:

```ts
const { events, status } = useCalendarEvents({ calendarId, apiKey })
// dateRange is an inclusive range of calendar days; a missing `to` means the single day `from`.
const next7Days = filterEvents(
  events,
  { ...defaultFilters, dateRange: { from: new Date(), to: addDays(new Date(), 6, timeZone) } },
  { timeZone },
)
```

Props worth knowing: `view`/`onViewChange`, `filters`/`onFiltersChange`, `getShareUrl`, `syncUrl` (opens `?event=<id>`, and mirrors the day modal as `?day=YYYY-MM-DD`), `renderEvent`, `renderDescription`, `dayModal` (click a day in the month grid to open it in a modal) and `renderDay` (custom modal body: `(day, events, { select, close }) => ReactNode`; implies `dayModal`), `baseUrl` (proxy the Google API), `icalProxies`.

## Rich descriptions

Descriptions render as plain text: `normalizeDescription` flattens Google's pseudo-HTML (`<br>`, `<p>`, `<html-blob>`) into paragraphs and line breaks, bare `http(s)` URLs become links, and nothing is ever passed to `dangerouslySetInnerHTML`. There is no markdown parser and no sanitizer to keep the core dependency-free.

If you want markdown or rich text, bring your own renderer — `event.description` is the raw Google payload:

```tsx
<CalendarEvents
  calendarId={calendarId}
  renderDescription={(event) => <MyMarkdown source={event.description} />}
/>
```

Sanitizing is then your renderer's job, since the raw value contains untrusted HTML.

## Notes

- The API key is public by nature; restrict it by HTTP referrer and to the Calendar API. The calendar must be public.
- Without a key (or if the API fails) the iCal feed is used; browsers block it cross-origin, so it goes through the CORS proxies in `ical.ts` (`DEFAULT_PROXIES`). Prefer the API or your own `baseUrl` proxy in production.
- When hosting the registry, change `registryDependencies: ["calendar-events-core"]` in `registry.json` to the full URL of `calendar-events-core.json`.
- `dev/` holds stand-ins for shadcn primitives so this repo can typecheck and test; they are not shipped.

## Develop

```
pnpm dev            # dev-only playground at http://localhost:5173
pnpm test           # vitest (core + component smoke tests)
pnpm typecheck
pnpm registry:build   # writes public/r/*.json
```

`pnpm dev` starts a Vite page (`dev/`) with input fields for calendar id, API
key, a source toggle (API key or iCal), time zone, default view, and proxy base URL, plus tabs that exercise the
full component, the list/calendar sub-views, and the headless `useCalendarEvents`
hook directly. Values are kept in `localStorage` so you don't have to re-enter
them. If a `.env` file exists (copy `.env.example`), `GOOGLE_CALENDAR_ID` and
`PUBLIC_GOOGLE_CALENDAR_API_KEY` pre-populate the calendar id and API key
fields. It's for local iteration only and isn't part of the published registry.
