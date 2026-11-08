import type { CalendarEvent, LoadOptions, LoadResult } from "./types"
import { fetchFromGoogleApi } from "./google-api"
import { fetchFromICal } from "./ical"

const PREFIX = "calendar-events:"

interface Cached {
  at: number
  events: (Omit<CalendarEvent, "start" | "end"> & { start: string; end: string })[]
}

function cacheKeyFor(o: LoadOptions): string | null {
  if (o.cacheKey === null) return null
  return `${PREFIX}${o.cacheKey ?? o.calendarId}:${o.timeMin.toISOString()}_${o.timeMax.toISOString()}`
}

function readCache(key: string | null): CalendarEvent[] | null {
  if (!key || typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    return c.events.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }))
  } catch {
    return null
  }
}

function writeCache(key: string | null, events: CalendarEvent[]) {
  if (!key || typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), events } satisfies Omit<Cached, "events"> & { events: unknown }))
  } catch {
    /* quota or privacy mode: ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let err: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e) {
      err = e
      // Auth/permission errors will not recover on retry.
      const status = (e as { status?: number }).status
      if (status === 400 || status === 403 || status === 404) break
      if (i < retries) await sleep(600 * (i + 1))
    }
  }
  throw err
}

/**
 * Load events for [timeMin, timeMax]: Google API first (when an apiKey is given),
 * falling back to the public iCal feed, then to the last cached result.
 */
export async function loadEvents(opts: LoadOptions): Promise<LoadResult> {
  const key = cacheKeyFor(opts)
  const retries = opts.retries ?? 2
  let apiError: unknown

  if (opts.apiKey) {
    try {
      const events = await withRetry(() => fetchFromGoogleApi({ ...opts, apiKey: opts.apiKey! }), retries)
      writeCache(key, events)
      return { events, source: "google-api" }
    } catch (e) {
      apiError = e
    }
  }

  try {
    const events = await withRetry(() => fetchFromICal(opts), retries)
    writeCache(key, events)
    return { events, source: "ical" }
  } catch (e) {
    const cached = readCache(key)
    if (cached) return { events: cached, source: "cache" }
    // Without a key, iCal was the only attempt. With one, report why the API failed too,
    // otherwise a bad key looks like it was never used.
    if (apiError === undefined) throw e
    throw new Error(`${errorMessage(apiError)} | iCal fallback also failed: ${errorMessage(e)}`, { cause: e })
  }
}
