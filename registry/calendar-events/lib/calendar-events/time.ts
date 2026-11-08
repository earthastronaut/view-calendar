import type { CalendarEvent, DateRange } from "./types"

/** Timezone helpers built on Intl; no date library needed. */

export function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

interface Parts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
  weekday: number // 0=Sun
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function zonedParts(date: Date, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  })
  const m: Record<string, string> = {}
  for (const p of f.formatToParts(date)) m[p.type] = p.value
  return {
    year: +m.year,
    month: +m.month,
    day: +m.day,
    hour: +m.hour % 24,
    minute: +m.minute,
    second: +m.second,
    weekday: WEEKDAYS.indexOf(m.weekday),
  }
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function offsetAt(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Build the instant for a wall-clock time in `timeZone`. DST-safe for normal times. */
export function zonedDate(
  year: number,
  month: number,
  day: number,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  let t = guess - offsetAt(new Date(guess), timeZone)
  // Re-check around DST transitions.
  t = guess - offsetAt(new Date(t), timeZone)
  return new Date(t)
}

export function startOfDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  return zonedDate(p.year, p.month, p.day, timeZone)
}

export function addDays(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  // Use UTC arithmetic on the calendar date, then re-anchor in the zone.
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), timeZone, p.hour, p.minute, p.second)
}

export function startOfMonth(date: Date, timeZone: string, monthOffset = 0): Date {
  const p = zonedParts(date, timeZone)
  const d = new Date(Date.UTC(p.year, p.month - 1 + monthOffset, 1))
  return zonedDate(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, timeZone)
}

/** `YYYY-MM-DD` key of the calendar day containing `date` in `timeZone`. */
export function dayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`
}

export function formatEventDate(date: Date, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export function formatEventTime(date: Date, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(date)
}

/** Compact start time for dense rows: "9a", "12p", "10:30a". */
export function formatCompactTime(date: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(date, timeZone)
  const suffix = hour < 12 ? "a" : "p"
  const h = hour % 12 === 0 ? 12 : hour % 12
  return minute === 0 ? `${h}${suffix}` : `${h}:${String(minute).padStart(2, "0")}${suffix}`
}

/** Human range, e.g. "Saturday, March 1, 2026 · 7:00 PM – 10:00 PM". */
export function formatEventRange(
  e: { start: Date; end: Date; allDay: boolean },
  timeZone: string,
  locale = "en-US",
): string {
  const date = formatEventDate(e.start, timeZone, locale)
  if (e.allDay) {
    const last = new Date(e.end.getTime() - 1)
    if (dayKey(last, timeZone) !== dayKey(e.start, timeZone)) {
      return `${date} – ${formatEventDate(last, timeZone, locale)}`
    }
    return `${date} · All day`
  }
  return `${date} · ${formatEventTime(e.start, timeZone, locale)} – ${formatEventTime(e.end, timeZone, locale)}`
}

/** Last instant an event covers: end is exclusive, and zero-length events cover their start. */
function lastInstant(e: { start: Date; end: Date }): Date {
  return new Date(Math.max(e.start.getTime(), e.end.getTime() - 1))
}

/** True when the event touches more than one calendar day in `timeZone`. */
export function isMultiDay(e: { start: Date; end: Date }, timeZone: string): boolean {
  return dayKey(lastInstant(e), timeZone) !== dayKey(e.start, timeZone)
}

/**
 * Start and end of an event on one line, for a list entry shown only once. Same-day events
 * read "7:00 PM – 10:00 PM" (or "All day"); multi-day ones include both dates, e.g.
 * "Sat, Mar 7, 7:00 PM – Mon, Mar 9, 9:00 AM" or "Sat, Mar 7 – Mon, Mar 9" when all-day.
 */
export function formatEventSpan(
  e: { start: Date; end: Date; allDay: boolean },
  timeZone: string,
  locale = "en-US",
): string {
  const multi = isMultiDay(e, timeZone)
  if (!multi) {
    return e.allDay ? "All day" : `${formatEventTime(e.start, timeZone, locale)} – ${formatEventTime(e.end, timeZone, locale)}`
  }
  const date = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", month: "short", day: "numeric" })
  const last = lastInstant(e)
  if (e.allDay) return `${date.format(e.start)} – ${date.format(last)}`
  return `${date.format(e.start)}, ${formatEventTime(e.start, timeZone, locale)} – ${date.format(e.end)}, ${formatEventTime(e.end, timeZone, locale)}`
}

/** e.g. "November 2026" for the month containing `date`. */
export function formatMonthTitle(date: Date, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, month: "long", year: "numeric" }).format(date)
}

/** Short human label for an inclusive day range, e.g. "Nov 9, 2026 – Nov 15, 2026". */
export function formatDayRange(range: DateRange, timeZone: string, locale = "en-US"): string {
  const fmt = new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric", year: "numeric" })
  if (!range.to || range.to.getTime() === range.from.getTime()) return fmt.format(range.from)
  return `${fmt.format(range.from)} – ${fmt.format(range.to)}`
}

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * Week number of the week containing `day`. Week 1 is the week containing Jan 1, and weeks
 * begin on `weekStartsOn`. A week that spans New Year's Day is week 1 of the new year.
 */
export function weekNumber(day: Date, weekStartsOn: WeekStart, timeZone: string): number {
  const p = zonedParts(day, timeZone)
  // Plain calendar-date arithmetic in UTC, so DST never shifts a day.
  const dayMs = Date.UTC(p.year, p.month - 1, p.day)
  const DAY = 86_400_000
  const weekStart = dayMs - ((p.weekday - weekStartsOn + 7) % 7) * DAY
  const weekEnd = weekStart + 6 * DAY
  const startOfWeekOne = (year: number) => {
    const jan1 = Date.UTC(year, 0, 1)
    return jan1 - ((new Date(jan1).getUTCDay() - weekStartsOn + 7) % 7) * DAY
  }
  const endYear = new Date(weekEnd).getUTCFullYear()
  const year = endYear > new Date(weekStart).getUTCFullYear() ? endYear : p.year
  return Math.round((weekStart - startOfWeekOne(year)) / (7 * DAY)) + 1
}

/** Longest span (in days) a range-driven fetch may request. */
export const MAX_FETCH_DAYS = 366

/**
 * Visible grid for the month containing `month`: whole weeks starting on `weekStartsOn`.
 * `from` is inclusive, `to` is exclusive, and `days` is a multiple of 7.
 */
export function monthGridWindow(
  month: Date,
  weekStartsOn: WeekStart,
  timeZone: string,
): { from: Date; to: Date; days: number } {
  const first = startOfMonth(month, timeZone)
  const p = zonedParts(first, timeZone)
  const lead = (p.weekday - weekStartsOn + 7) % 7
  const daysInMonth = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()
  const days = Math.ceil((lead + daysInMonth) / 7) * 7
  const from = addDays(first, -lead, timeZone)
  return { from, to: addDays(from, days, timeZone), days }
}

/**
 * Half-open window `[from, to)` to load so the month grid (with its leading and trailing
 * padding days) is fully populated. An absolute `range` widens the window, capped at
 * `MAX_FETCH_DAYS` days from the start of the range.
 */
export function fetchWindow(
  month: Date,
  range: DateRange | undefined,
  weekStartsOn: WeekStart,
  timeZone: string,
): { from: Date; to: Date } {
  const grid = monthGridWindow(month, weekStartsOn, timeZone)
  if (!range) return { from: grid.from, to: grid.to }
  const rangeFrom = startOfDay(range.from, timeZone)
  const last = startOfDay(range.to ?? range.from, timeZone)
  const cap = addDays(rangeFrom, MAX_FETCH_DAYS, timeZone)
  const rangeTo = (() => {
    const end = addDays(last, 1, timeZone)
    return end > cap ? cap : end
  })()
  return {
    from: rangeFrom < grid.from ? rangeFrom : grid.from,
    to: rangeTo > grid.to ? rangeTo : grid.to,
  }
}

/**
 * Group events by the calendar days (in `timeZone`) they cover, clipped to `[from, to)`.
 * Multi-day events appear under every covered day. A timed event ending exactly at
 * midnight does not spill onto the next day; all-day ends are exclusive. Within a day,
 * all-day events come first, then by start time.
 */
export function bucketByDay(
  events: CalendarEvent[],
  from: Date,
  to: Date,
  timeZone: string,
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  const lastKey = dayKey(new Date(to.getTime() - 1), timeZone)
  for (const e of events) {
    // Zero-length events occupy the day they start on.
    const lastInstant = new Date(Math.max(e.start.getTime(), e.end.getTime() - 1))
    if (lastInstant < from || e.start >= to) continue
    const endKey = (() => {
      const k = dayKey(lastInstant, timeZone)
      return k < lastKey ? k : lastKey
    })()
    let cursor = startOfDay(e.start > from ? e.start : from, timeZone)
    // Bounded so a malformed event can never spin forever.
    for (let i = 0; i <= MAX_FETCH_DAYS * 10; i++) {
      const k = dayKey(cursor, timeZone)
      if (k > endKey) break
      const list = map.get(k)
      if (list) list.push(e)
      else map.set(k, [e])
      cursor = addDays(cursor, 1, timeZone)
    }
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.start.getTime() - b.start.getTime() ||
        a.summary.localeCompare(b.summary),
    )
  }
  return map
}

/**
 * Group events by the single day they start on, keeping only starts inside `[from, to)`.
 * Unlike `bucketByDay`, a multi-day event appears once. Ordering matches `bucketByDay`.
 */
export function bucketByStartDay(
  events: CalendarEvent[],
  from: Date,
  to: Date,
  timeZone: string,
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    if (e.start < from || e.start >= to) continue
    const k = dayKey(e.start, timeZone)
    const list = map.get(k)
    if (list) list.push(e)
    else map.set(k, [e])
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.start.getTime() - b.start.getTime() ||
        a.summary.localeCompare(b.summary),
    )
  }
  return map
}
