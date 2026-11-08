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
