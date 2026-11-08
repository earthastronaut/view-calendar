import type { CalendarEvent, LoadOptions } from "./types"
import { addDays, defaultTimeZone, zonedDate, zonedParts } from "./time"
import { fetchWithTimeout, HttpError } from "./google-api"

export function icalUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`
}

export function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n")
}

export function decodeICalText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\;/g, ";")
    .replace(/\\\\/g, "\\")
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

function parseLine(line: string): Prop | null {
  const idx = line.indexOf(":")
  if (idx < 0) return null
  const head = line.slice(0, idx).split(";")
  const params: Record<string, string> = {}
  for (const p of head.slice(1)) {
    const [k, v] = p.split("=")
    if (k && v) params[k.toUpperCase()] = v.replace(/^"|"$/g, "")
  }
  return { name: head[0].toUpperCase(), params, value: line.slice(idx + 1) }
}

/** Returns the date and whether it was date-only. */
export function parseICalDate(
  prop: Prop,
  fallbackTz: string,
): { date: Date; allDay: boolean } | null {
  const v = prop.value.trim()
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (m) return { date: zonedDate(+m[1], +m[2], +m[3], fallbackTz), allDay: true }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v)
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number)
  if (m[7]) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false }
  const tz = prop.params.TZID ?? fallbackTz
  try {
    return { date: zonedDate(y, mo, d, tz, h, mi, s), allDay: false }
  } catch {
    return { date: zonedDate(y, mo, d, fallbackTz, h, mi, s), allDay: false }
  }
}

export interface RRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
  interval: number
  count?: number
  until?: Date
  byday?: { n: number; day: number }[]
}

const DAY_IDX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

export function parseRRule(value: string, tz: string): RRule | null {
  const parts: Record<string, string> = {}
  for (const seg of value.split(";")) {
    const [k, v] = seg.split("=")
    if (k && v) parts[k.toUpperCase()] = v
  }
  const freq = parts.FREQ as RRule["freq"]
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null
  const rule: RRule = { freq, interval: Math.max(1, +(parts.INTERVAL ?? 1)) }
  if (parts.COUNT) rule.count = +parts.COUNT
  if (parts.UNTIL) {
    const u = parseICalDate({ name: "UNTIL", params: {}, value: parts.UNTIL }, tz)
    if (u) rule.until = u.allDay ? new Date(addDays(u.date, 1, tz).getTime() - 1) : u.date
  }
  if (parts.BYDAY) {
    rule.byday = parts.BYDAY.split(",")
      .map((t) => /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(t.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ n: m[1] ? +m[1] : 0, day: DAY_IDX[m[2]] }))
  }
  return rule
}

/** Date of the nth (or last, n<0) `weekday` of a month, as a calendar day. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number | null {
  const daysIn = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days: number[] = []
  for (let d = 1; d <= daysIn; d++) {
    if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === weekday) days.push(d)
  }
  const d = n > 0 ? days[n - 1] : days[days.length + n]
  return d ?? null
}

/** Expand a recurrence into start instants within [from, to]. Includes the base start. */
export function expandRRule(
  start: Date,
  rule: RRule,
  tz: string,
  from: Date,
  to: Date,
  exdates: Set<number> = new Set(),
): Date[] {
  const out: Date[] = []
  const sp = zonedParts(start, tz)
  const limit = rule.until && rule.until < to ? rule.until : to
  let produced = 0
  const push = (d: Date): boolean => {
    if (d < start) return true
    if (d > limit) return false
    produced++
    if (rule.count && produced > rule.count) return false
    if (d >= from && !exdates.has(d.getTime())) out.push(d)
    return true
  }
  const at = (y: number, m: number, d: number) => zonedDate(y, m, d, tz, sp.hour, sp.minute, sp.second)
  const MAX = 5000

  if (rule.freq === "DAILY") {
    for (let i = 0; i < MAX; i++) {
      if (!push(addDays(start, i * rule.interval, tz))) break
    }
  } else if (rule.freq === "WEEKLY") {
    const days = rule.byday?.length ? rule.byday.map((b) => b.day) : [sp.weekday]
    const weekStart = addDays(start, -sp.weekday, tz) // Sunday of base week
    for (let w = 0; w < MAX; w++) {
      const base = addDays(weekStart, w * 7 * rule.interval, tz)
      if (base > limit) break
      for (const d of [...days].sort((a, b) => a - b)) {
        if (!push(addDays(base, d, tz))) return out
      }
    }
  } else if (rule.freq === "MONTHLY") {
    for (let i = 0; i < MAX; i++) {
      const total = sp.month - 1 + i * rule.interval
      const y = sp.year + Math.floor(total / 12)
      const m = (total % 12) + 1
      if (at(y, m, 1) > limit) break
      const dates: number[] = []
      if (rule.byday?.length) {
        for (const b of rule.byday) {
          const day = nthWeekday(y, m, b.day, b.n || 1)
          if (day) dates.push(day)
        }
      } else {
        dates.push(sp.day)
      }
      for (const d of dates.sort((a, b) => a - b)) {
        const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate()
        if (d > daysIn) continue
        if (!push(at(y, m, d))) return out
      }
    }
  } else {
    for (let i = 0; i < 200; i++) {
      if (!push(at(sp.year + i * rule.interval, sp.month, sp.day))) break
    }
  }
  return out
}

/** Parse an .ics document and expand recurrences within [from, to]. */
export function parseICal(
  text: string,
  range: { from: Date; to: Date },
  timeZone: string = defaultTimeZone(),
): CalendarEvent[] {
  const lines = unfold(text)
  const raw: Prop[][] = []
  let cur: Prop[] | null = null
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = []
    else if (line === "END:VEVENT") {
      if (cur) raw.push(cur)
      cur = null
    } else if (cur) {
      const p = parseLine(line)
      if (p) cur.push(p)
    }
  }

  const overrides = new Map<string, true>() // `${uid}|${recurrenceIdMs}`
  const parsed = raw.map((props) => {
    const get = (n: string) => props.find((p) => p.name === n)
    const all = (n: string) => props.filter((p) => p.name === n)
    return { get, all }
  })

  for (const { get } of parsed) {
    const rid = get("RECURRENCE-ID")
    const uid = get("UID")
    if (rid && uid) {
      const d = parseICalDate(rid, timeZone)
      if (d) overrides.set(`${uid.value}|${d.date.getTime()}`, true)
    }
  }

  const events: CalendarEvent[] = []
  for (const { get, all } of parsed) {
    const uid = get("UID")?.value ?? ""
    const startProp = get("DTSTART")
    if (!startProp || get("STATUS")?.value === "CANCELLED") continue
    const s = parseICalDate(startProp, timeZone)
    if (!s) continue
    const endProp = get("DTEND")
    const e = endProp ? parseICalDate(endProp, timeZone) : null
    const duration = e ? e.date.getTime() - s.date.getTime() : s.allDay ? 86400000 : 0
    const make = (start: Date): CalendarEvent => ({
      id: `${uid}_${start.toISOString().replace(/[-:]|\.\d{3}/g, "")}`,
      summary: decodeICalText(get("SUMMARY")?.value ?? "").trim() || "(No title)",
      description: decodeICalText(get("DESCRIPTION")?.value ?? ""),
      location: decodeICalText(get("LOCATION")?.value ?? "").trim(),
      start,
      end: new Date(start.getTime() + duration),
      allDay: s.allDay,
      recurringId: undefined,
    })
    const rruleProp = get("RRULE")
    const isOverride = !!get("RECURRENCE-ID")
    if (rruleProp && !isOverride) {
      const rule = parseRRule(rruleProp.value, timeZone)
      const ex = new Set<number>()
      for (const p of all("EXDATE"))
        for (const v of p.value.split(",")) {
          const d = parseICalDate({ ...p, value: v }, timeZone)
          if (d) ex.add(d.date.getTime())
        }
      if (rule) {
        const rangeFrom = new Date(range.from.getTime() - duration)
        for (const d of expandRRule(s.date, rule, timeZone, rangeFrom, range.to, ex)) {
          if (overrides.has(`${uid}|${d.getTime()}`)) continue
          const ev = make(d)
          ev.recurringId = uid
          events.push(ev)
        }
        continue
      }
    }
    const ev = make(s.date)
    if (ev.end >= range.from && ev.start <= range.to) events.push(ev)
  }
  return events.sort((a, b) => a.start.getTime() - b.start.getTime())
}

export const DEFAULT_PROXIES = [
  "https://api.allorigins.win/raw?url={url}",
  "https://corsproxy.io/?{url}",
]

export async function fetchFromICal(opts: LoadOptions): Promise<CalendarEvent[]> {
  const fetcher = opts.fetcher ?? fetch
  const target = icalUrl(opts.calendarId)
  const candidates = [target, ...(opts.icalProxies ?? DEFAULT_PROXIES).map((p) => p.replace("{url}", encodeURIComponent(target)))]
  let lastError: unknown
  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, fetcher, opts.timeoutMs ?? 8000)
      if (!res.ok) throw new HttpError(res.status, `iCal fetch responded ${res.status}`)
      const text = await res.text()
      if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Response was not an iCal feed")
      return parseICal(text, { from: opts.timeMin, to: opts.timeMax }, opts.timeZone ?? defaultTimeZone())
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error("iCal fetch failed")
}
