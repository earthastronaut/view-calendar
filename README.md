# calendar-events

A shadcn-style registry for showing a **public Google Calendar** as a list or month grid, with filtering, an event modal, and Maps / add-to-calendar / share links.

Two registry items:

- `calendar-events-core` — headless: loading (Google API → iCal → cache), filters, links, sanitized markdown, `useCalendarEvents` hook. No UI.
- `calendar-events` — UI built on shadcn `button`, `dialog`, `input`. Depends on the core.

## Use

```tsx
import { CalendarEvents } from "@/components/calendar-events"

<CalendarEvents
  calendarId="xxxx@group.calendar.google.com"
  apiKey={import.meta.env.PUBLIC_GOOGLE_CALENDAR_API_KEY} // optional; falls back to iCal
  timeZone="America/Los_Angeles"                          // optional; default browser tz
  defaultView="list"                                      // "list" | "calendar"
/>
```

Headless only:

```ts
const { events, status, loadMorePast } = useCalendarEvents({ calendarId, apiKey })
const upcoming = filterEvents(events, { ...defaultFilters, range: "week" }, { timeZone })
```

Props worth knowing: `view`/`onViewChange`, `filters`/`onFiltersChange`, `getShareUrl`, `syncUrl` (opens `?event=<id>`), `renderEvent`, `baseUrl` (proxy the Google API), `icalProxies`.

## Notes

- The API key is public by nature; restrict it by HTTP referrer and to the Calendar API. The calendar must be public.
- Without a key (or if the API fails) the iCal feed is used; browsers block it cross-origin, so it goes through the CORS proxies in `ical.ts` (`DEFAULT_PROXIES`). Prefer the API or your own `baseUrl` proxy in production.
- When hosting the registry, change `registryDependencies: ["calendar-events-core"]` in `registry.json` to the full URL of `calendar-events-core.json`.
- `dev/` holds stand-ins for shadcn primitives so this repo can typecheck and test; they are not shipped.

## Develop

```
pnpm test          # vitest (core + component smoke tests)
pnpm typecheck
pnpm registry:build   # writes public/r/*.json
```
