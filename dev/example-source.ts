import type { ApiEventItem } from "@/lib/calendar-events/google-api"
import { addDays, dayKey, defaultTimeZone, startOfDay, zonedDate, zonedParts } from "@/lib/calendar-events/time"
import exampleEvents from "./example-events.json"

/** Calendar ID the example source reports; never sent anywhere. */
export const EXAMPLE_CALENDAR_ID = "example-events"

/**
 * One entry of `example-events.json`. Dates are relative to today (in the display time
 * zone) so the sample data always lands around the current month.
 */
interface ExampleEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  status?: string
  /** Days from today; negative is the past. */
  dayOffset: number
  /** Start as `HH:mm`. Ignored when `allDay`. */
  time?: string
  durationMinutes?: number
  allDay?: boolean
  /** Length of an all-day event in days. Default 1. */
  days?: number
  /** Expand into a series of instances sharing a `recurringEventId`. */
  repeat?: { everyDays: number; count: number }
}

const MS_PER_MINUTE = 60_000

function toApiItem(event: ExampleEvent, dayOffset: number, id: string, today: Date, timeZone: string): ApiEventItem {
  const base = {
    id,
    summary: event.summary,
    description: event.description,
    location: event.location,
    htmlLink: event.htmlLink,
    status: event.status,
    recurringEventId: event.repeat ? event.id : undefined,
  }
  const day = addDays(today, dayOffset, timeZone)

  if (event.allDay) {
    const last = addDays(day, event.days ?? 1, timeZone)
    return { ...base, start: { date: dayKey(day, timeZone) }, end: { date: dayKey(last, timeZone) } }
  }

  const [hour = 0, minute = 0] = (event.time ?? "00:00").split(":").map(Number)
  const p = zonedParts(day, timeZone)
  const start = zonedDate(p.year, p.month, p.day, timeZone, hour, minute)
  const end = new Date(start.getTime() + (event.durationMinutes ?? 60) * MS_PER_MINUTE)
  return { ...base, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } }
}

function buildItems(timeZone: string): ApiEventItem[] {
  const today = startOfDay(new Date(), timeZone)
  return (exampleEvents as ExampleEvent[]).flatMap((event) => {
    if (!event.repeat) return [toApiItem(event, event.dayOffset, event.id, today, timeZone)]
    return Array.from({ length: event.repeat.count }, (_, i) =>
      toApiItem(event, event.dayOffset + i * event.repeat!.everyDays, `${event.id}_${i}`, today, timeZone),
    )
  })
}

function overlaps(item: ApiEventItem, timeMin: number, timeMax: number): boolean {
  const start = new Date(item.start?.dateTime ?? `${item.start?.date}T00:00:00Z`).getTime()
  const end = new Date(item.end?.dateTime ?? `${item.end?.date}T00:00:00Z`).getTime()
  // Date-only values are padded by a day on each side: they carry no zone of their own.
  const pad = item.start?.dateTime ? 0 : 24 * 60 * MS_PER_MINUTE
  return start - pad < timeMax && Math.max(end, start) + pad >= timeMin
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

/**
 * A `fetch` stand-in that answers the two Google Calendar API calls the registry makes
 * (`events.list` and `events.get`) from `example-events.json`, with no network.
 */
function createExampleFetcher(timeZone: string): typeof fetch {
  return async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const items = buildItems(timeZone)
    const eventId = url.pathname.split("/events/")[1]

    if (eventId) {
      const found = items.find((item) => item.id === decodeURIComponent(eventId))
      return found ? json(found) : json({ error: { message: "Not Found" } }, 404)
    }

    const timeMin = new Date(url.searchParams.get("timeMin") ?? 0).getTime()
    const timeMax = new Date(url.searchParams.get("timeMax") ?? 8.64e15).getTime()
    return json({ items: items.filter((item) => overlaps(item, timeMin, timeMax)) })
  }
}

// One stable fetcher per zone: `useCalendarEvents` reloads whenever `fetcher` changes identity.
const fetchers = new Map<string, typeof fetch>()

export function exampleFetcher(timeZone?: string): typeof fetch {
  const zone = timeZone || defaultTimeZone()
  let fetcher = fetchers.get(zone)
  if (!fetcher) {
    fetcher = createExampleFetcher(zone)
    fetchers.set(zone, fetcher)
  }
  return fetcher
}
