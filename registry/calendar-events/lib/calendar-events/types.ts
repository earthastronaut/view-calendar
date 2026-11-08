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

/** Absolute, inclusive range of calendar days. A missing `to` means the single day `from`. */
export interface DateRange {
  from: Date
  to?: Date
}

/**
 * How the list shows an event that spans several days: under `"each"` day it covers, or
 * once under the day it `"start"`s on, with its start and end shown on the card.
 */
export type MultiDayListMode = "each" | "start"

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
  /** How long a cached result may be used as the last-resort fallback, in ms. Default 24 hours. */
  cacheTtlMs?: number
  timeoutMs?: number
  retries?: number
}

export interface LoadResult {
  events: CalendarEvent[]
  source: EventSource
}
