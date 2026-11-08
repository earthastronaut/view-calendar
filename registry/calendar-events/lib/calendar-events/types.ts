export interface CalendarEvent {
  /** Stable id. For API events this is the Google event id (instance id for recurring). */
  id: string
  summary: string
  description: string
  location: string
  start: Date
  end: Date
  /** All-day events carry local-midnight dates in the display timezone; `end` is exclusive. */
  allDay: boolean
  /** Google's own event page, when known. */
  htmlLink?: string
  /** Id of the recurring series, when known. */
  recurringId?: string
}

export type EventSource = "google-api" | "ical" | "cache"

export interface LoadOptions {
  calendarId: string
  apiKey?: string
  timeMin: Date
  timeMax: Date
  /** IANA timezone used for all-day dates and recurrence expansion. */
  timeZone?: string
  /** Override the Google API origin, e.g. a server-side proxy. */
  baseUrl?: string
  /** Custom fetch, e.g. for tests or proxies. */
  fetcher?: typeof fetch
  /** CORS proxies tried in order if the direct iCal fetch fails. Use `{url}` as the placeholder. */
  icalProxies?: string[]
  /** sessionStorage key prefix; set to null to disable caching. */
  cacheKey?: string | null
  timeoutMs?: number
  retries?: number
}

export interface LoadResult {
  events: CalendarEvent[]
  source: EventSource
}
