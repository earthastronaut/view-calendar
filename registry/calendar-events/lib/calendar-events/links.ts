import type { CalendarEvent } from "./types"
import { addDays, defaultTimeZone, zonedParts } from "./time"

export { icalUrl } from "./ical"

/** Google Maps search link, or null when there's nothing useful to search. */
export function createMapsUrl(location: string | undefined | null): string | null {
  const l = location?.trim()
  if (!l || /^(tbd|location tbd|online|virtual|zoom)$/i.test(l)) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l)}`
}

/** Public "view this calendar" page. */
export function calendarViewUrl(calendarId: string, opts: { timeZone?: string; mode?: "MONTH" | "WEEK" | "AGENDA" } = {}): string {
  const p = new URLSearchParams({ src: calendarId, mode: opts.mode ?? "MONTH" })
  if (opts.timeZone) p.set("ctz", opts.timeZone)
  return `https://calendar.google.com/calendar/embed?${p}`
}

/** Subscribe link: adds the whole calendar to a user's Google Calendar. */
export function subscribeUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(calendarId)}`
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "")

function dateOnly(d: Date, timeZone: string): string {
  const p = zonedParts(d, timeZone)
  return `${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`
}

/** One-click "add this event" link for Google Calendar. */
export function googleAddToCalendarUrl(e: CalendarEvent, timeZone: string = defaultTimeZone()): string {
  const dates = e.allDay
    ? `${dateOnly(e.start, timeZone)}/${dateOnly(e.end > e.start ? e.end : addDays(e.start, 1, timeZone), timeZone)}`
    : `${utcStamp(e.start)}/${utcStamp(e.end > e.start ? e.end : new Date(e.start.getTime() + 3600_000))}`
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.summary, dates })
  if (e.description) p.set("details", e.description)
  if (e.location) p.set("location", e.location)
  return `https://calendar.google.com/calendar/render?${p}`
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

function fold(line: string): string {
  // RFC 5545: max 75 octets per line; fold by characters conservatively at 70.
  const parts: string[] = []
  let rest = line
  while (rest.length > 70) {
    parts.push(rest.slice(0, 70))
    rest = " " + rest.slice(70)
  }
  parts.push(rest)
  return parts.join("\r\n")
}

/** Single-event .ics document (CRLF line endings). */
export function buildIcs(e: CalendarEvent, timeZone: string = defaultTimeZone()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//calendar-events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@calendar-events`,
    `DTSTAMP:${utcStamp(new Date())}`,
    e.allDay ? `DTSTART;VALUE=DATE:${dateOnly(e.start, timeZone)}` : `DTSTART:${utcStamp(e.start)}`,
    e.allDay
      ? `DTEND;VALUE=DATE:${dateOnly(e.end > e.start ? e.end : addDays(e.start, 1, timeZone), timeZone)}`
      : `DTEND:${utcStamp(e.end > e.start ? e.end : new Date(e.start.getTime() + 3600_000))}`,
    `SUMMARY:${escapeText(e.summary)}`,
  ]
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`)
  if (e.htmlLink) lines.push(`URL:${e.htmlLink}`)
  lines.push("END:VEVENT", "END:VCALENDAR")
  return lines.map(fold).join("\r\n") + "\r\n"
}

export function downloadIcs(e: CalendarEvent, timeZone?: string): void {
  const blob = new Blob([buildIcs(e, timeZone)], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${e.summary.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "event"}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const SHARE_PARAM = "event"
/** Query param holding the day (`YYYY-MM-DD`) whose modal is open. */
export const DAY_PARAM = "day"

/** Deep link that re-opens the event modal. Defaults to the current page. */
export function shareUrl(e: CalendarEvent, baseUrl?: string): string {
  const base = baseUrl ?? (typeof location !== "undefined" ? location.href : "https://example.com/")
  const u = new URL(base)
  u.searchParams.set(SHARE_PARAM, e.id)
  return u.toString()
}

/** Native share sheet when available, otherwise clipboard. Returns which path ran. */
export async function shareEvent(e: CalendarEvent, url: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: e.summary, url })
      return "shared"
    }
    await navigator.clipboard.writeText(url)
    return "copied"
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return "shared"
    try {
      await navigator.clipboard.writeText(url)
      return "copied"
    } catch {
      return "failed"
    }
  }
}
