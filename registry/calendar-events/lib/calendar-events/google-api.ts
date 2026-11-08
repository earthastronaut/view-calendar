import type { CalendarEvent, LoadOptions } from "./types"
import { defaultTimeZone, zonedDate } from "./time"

interface ApiDateTime {
  dateTime?: string
  date?: string
}
export interface ApiEventItem {
  id?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  recurringEventId?: string
  status?: string
  start?: ApiDateTime
  end?: ApiDateTime
}
interface ApiEventList {
  items?: ApiEventItem[]
  nextPageToken?: string
}

/** Only the fields `mapApiItem` reads; keeps `events.list` payloads small. */
export const EVENT_LIST_FIELDS =
  "nextPageToken,items(id,summary,description,location,htmlLink,recurringEventId,status,start,end)"

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function fetchWithTimeout(
  url: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetcher(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Status line plus Google's own explanation (e.g. a blocked referrer), when the body has one. */
async function describeApiFailure(res: Response): Promise<string> {
  const base = `Google Calendar API responded ${res.status}`
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    const detail = body.error?.message
    return detail ? `${base}: ${detail}` : base
  } catch {
    return base
  }
}

/** Parse `YYYY-MM-DD` as local midnight in `timeZone` (never as UTC). */
export function parseDateOnly(value: string, timeZone: string): Date {
  const [y, m, d] = value.split("-").map(Number)
  return zonedDate(y, m, d, timeZone)
}

export function mapApiItem(item: ApiEventItem, timeZone: string): CalendarEvent | null {
  if (!item.id || item.status === "cancelled" || !item.start) return null
  const allDay = !item.start.dateTime && !!item.start.date
  const start = allDay ? parseDateOnly(item.start.date!, timeZone) : new Date(item.start.dateTime!)
  const endRaw = item.end?.dateTime ?? item.end?.date
  const end = !endRaw
    ? start
    : item.end?.dateTime
      ? new Date(item.end.dateTime)
      : parseDateOnly(item.end!.date!, timeZone)
  if (Number.isNaN(start.getTime())) return null
  return {
    id: item.id,
    summary: item.summary?.trim() || "(No title)",
    description: item.description ?? "",
    location: item.location?.trim() ?? "",
    start,
    end,
    allDay,
    htmlLink: item.htmlLink,
    recurringId: item.recurringEventId,
  }
}

export async function fetchFromGoogleApi(opts: LoadOptions & { apiKey: string }): Promise<CalendarEvent[]> {
  const fetcher = opts.fetcher ?? fetch
  const base = (opts.baseUrl ?? "https://www.googleapis.com").replace(/\/$/, "")
  const timeZone = opts.timeZone ?? defaultTimeZone()
  const events: CalendarEvent[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      key: opts.apiKey,
      timeMin: opts.timeMin.toISOString(),
      timeMax: opts.timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      fields: EVENT_LIST_FIELDS,
    })
    if (pageToken) params.set("pageToken", pageToken)
    const url = `${base}/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events?${params}`
    const res = await fetchWithTimeout(url, fetcher, opts.timeoutMs ?? 8000)
    if (!res.ok) throw new HttpError(res.status, await describeApiFailure(res))
    const data = (await res.json()) as ApiEventList
    for (const item of data.items ?? []) {
      const e = mapApiItem(item, timeZone)
      if (e) events.push(e)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return events
}

/** Fetch a single event by id (used for share-link deep links). */
export async function fetchGoogleEvent(
  opts: Pick<LoadOptions, "calendarId" | "baseUrl" | "fetcher" | "timeZone" | "timeoutMs"> & {
    apiKey: string
    eventId: string
  },
): Promise<CalendarEvent | null> {
  const fetcher = opts.fetcher ?? fetch
  const base = (opts.baseUrl ?? "https://www.googleapis.com").replace(/\/$/, "")
  const url = `${base}/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(
    opts.eventId,
  )}?key=${encodeURIComponent(opts.apiKey)}`
  const res = await fetchWithTimeout(url, fetcher, opts.timeoutMs ?? 8000)
  if (res.status === 404) return null
  if (!res.ok) throw new HttpError(res.status, await describeApiFailure(res))
  return mapApiItem((await res.json()) as ApiEventItem, opts.timeZone ?? defaultTimeZone())
}
