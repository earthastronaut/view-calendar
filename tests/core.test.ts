import { describe, expect, it } from "vitest"
import { parseICal, expandRRule, parseRRule } from "@/lib/calendar-events/ical"
import { mapApiItem } from "@/lib/calendar-events/google-api"
import { filterEvents, defaultFilters, uniqueLocations, NO_LOCATION } from "@/lib/calendar-events/filters"
import { buildIcs, createMapsUrl, googleAddToCalendarUrl, shareUrl } from "@/lib/calendar-events/links"
import { descriptionExcerpt, normalizeDescription } from "@/lib/calendar-events/description"
import { dayKey, zonedDate } from "@/lib/calendar-events/time"
import type { CalendarEvent } from "@/lib/calendar-events/types"

const TZ = "America/Los_Angeles"
const ev = (o: Partial<CalendarEvent>): CalendarEvent => ({
  id: "x", summary: "Swing", description: "", location: "", allDay: false,
  start: new Date("2026-03-01T20:00:00Z"), end: new Date("2026-03-01T22:00:00Z"), ...o,
})

describe("api mapping", () => {
  it("keeps all-day events on their own calendar day (not UTC)", () => {
    const e = mapApiItem({ id: "a", summary: "Fest", start: { date: "2026-03-07" }, end: { date: "2026-03-08" } }, TZ)!
    expect(e.allDay).toBe(true)
    expect(dayKey(e.start, TZ)).toBe("2026-03-07")
  })
  it("skips cancelled events", () => {
    expect(mapApiItem({ id: "a", status: "cancelled", start: { date: "2026-03-07" } }, TZ)).toBeNull()
  })
})

describe("ical", () => {
  const ics = [
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:abc", "DTSTART;TZID=America/Los_Angeles:20260305T190000",
    "DTEND;TZID=America/Los_Angeles:20260305T210000", "SUMMARY:Dance\\, social",
    "DESCRIPTION:Line one\\nfolded ", " continues\; ok", "LOCATION:Hall", "END:VEVENT",
    "BEGIN:VEVENT", "UID:allday", "DTSTART;VALUE=DATE:20260310", "DTEND;VALUE=DATE:20260311", "SUMMARY:Holiday", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
  const range = { from: new Date("2026-03-01T00:00:00Z"), to: new Date("2026-04-01T00:00:00Z") }

  it("parses folded lines, escapes and timezones", () => {
    const [a] = parseICal(ics, range, TZ)
    expect(a.summary).toBe("Dance, social")
    expect(a.description).toBe("Line one\nfolded continues; ok")
    expect(a.start.toISOString()).toBe("2026-03-06T03:00:00.000Z")
  })
  it("parses all-day dates in the display zone", () => {
    const e = parseICal(ics, range, TZ).find((x) => x.allDay)!
    expect(dayKey(e.start, TZ)).toBe("2026-03-10")
  })
  it("expands first and last Thursday monthly rules", () => {
    const start = zonedDate(2026, 1, 1, TZ, 19)
    const from = zonedDate(2026, 1, 1, TZ)
    const to = zonedDate(2026, 4, 1, TZ)
    const first = expandRRule(start, parseRRule("FREQ=MONTHLY;BYDAY=1TH", TZ)!, TZ, from, to)
    expect(first.map((d) => dayKey(d, TZ))).toEqual(["2026-01-01", "2026-02-05", "2026-03-05"])
    const last = expandRRule(start, parseRRule("FREQ=MONTHLY;BYDAY=-1TH", TZ)!, TZ, from, to)
    expect(last.map((d) => dayKey(d, TZ))).toEqual(["2026-01-29", "2026-02-26", "2026-03-26"])
  })
  it("honors COUNT, weekly BYDAY and keeps wall-clock time across DST", () => {
    const start = zonedDate(2026, 3, 2, TZ, 19) // Monday
    const out = expandRRule(start, parseRRule("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4", TZ)!, TZ, zonedDate(2026, 3, 1, TZ), zonedDate(2026, 6, 1, TZ))
    expect(out).toHaveLength(4)
    const out2 = expandRRule(start, parseRRule("FREQ=WEEKLY", TZ)!, TZ, zonedDate(2026, 3, 1, TZ), zonedDate(2026, 3, 20, TZ))
    // DST began Mar 8 2026; all instances should still be 19:00 local
    for (const d of out2) expect(d.toLocaleTimeString("en-US", { timeZone: TZ, hour12: false })).toBe("19:00:00")
  })
})

describe("filters", () => {
  const now = new Date("2026-03-04T18:00:00Z")
  const events = [
    ev({ id: "past", summary: "Old", start: new Date("2026-02-01T20:00:00Z"), end: new Date("2026-02-01T22:00:00Z") }),
    ev({ id: "soon", summary: "Waltz", location: "Studio A", start: new Date("2026-03-06T20:00:00Z"), end: new Date("2026-03-06T22:00:00Z") }),
    ev({ id: "later", summary: "Tango", start: new Date("2026-04-20T20:00:00Z"), end: new Date("2026-04-20T22:00:00Z") }),
  ]
  const ctx = { now, timeZone: TZ }
  it("splits past/future", () => {
    expect(filterEvents(events, defaultFilters, ctx).map((e) => e.id)).toEqual(["soon", "later"])
    expect(filterEvents(events, { ...defaultFilters, timeframe: "past" }, ctx).map((e) => e.id)).toEqual(["past"])
  })
  it("applies relative ranges", () => {
    expect(filterEvents(events, { ...defaultFilters, range: "week" }, ctx).map((e) => e.id)).toEqual(["soon"])
    expect(filterEvents(events, { ...defaultFilters, range: "month" }, ctx).map((e) => e.id)).toEqual(["soon"])
    expect(filterEvents(events, { ...defaultFilters, range: "next-month" }, ctx).map((e) => e.id)).toEqual(["later"])
  })
  it("searches and filters by location", () => {
    expect(filterEvents(events, { ...defaultFilters, search: "tan" }, ctx).map((e) => e.id)).toEqual(["later"])
    expect(filterEvents(events, { ...defaultFilters, location: "Studio A" }, ctx).map((e) => e.id)).toEqual(["soon"])
    expect(filterEvents(events, { ...defaultFilters, location: NO_LOCATION }, ctx).map((e) => e.id)).toEqual(["later"])
    expect(uniqueLocations(events).map((l) => l.label)).toEqual(["Studio A", "No location"])
  })
})

describe("links", () => {
  it("builds maps links only for real locations", () => {
    expect(createMapsUrl("1 Main St, Eugene")).toContain("query=1%20Main%20St%2C%20Eugene")
    expect(createMapsUrl("TBD")).toBeNull()
    expect(createMapsUrl("")).toBeNull()
  })
  it("builds google add-to-calendar urls", () => {
    const u = new URL(googleAddToCalendarUrl(ev({ location: "Hall" }), TZ))
    expect(u.searchParams.get("dates")).toBe("20260301T200000Z/20260301T220000Z")
    expect(u.searchParams.get("location")).toBe("Hall")
  })
  it("uses exclusive date-only ends for all-day events", () => {
    const e = ev({ allDay: true, start: zonedDate(2026, 3, 7, TZ), end: zonedDate(2026, 3, 8, TZ) })
    expect(new URL(googleAddToCalendarUrl(e, TZ)).searchParams.get("dates")).toBe("20260307/20260308")
  })
  it("builds a valid ics with escaping", () => {
    const ics = buildIcs(ev({ summary: "A, B; C", description: "x\ny" }), TZ)
    expect(ics).toContain("SUMMARY:A\\, B\; C")
    expect(ics).toContain("DESCRIPTION:x\\ny")
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
  })
  it("adds the event param to share urls", () => {
    expect(shareUrl(ev({ id: "abc" }), "https://site.test/events?x=1")).toBe("https://site.test/events?x=1&event=abc")
  })
})

describe("description", () => {
  it("flattens Google's pseudo-html to text", () => {
    const text = normalizeDescription('<html-blob><p>Hi<br>there</p><p>&amp; <a href="https://a.test">link</a></p></html-blob>')
    expect(text).toBe("Hi\nthere\n\n& link")
  })
  it("drops scripts, handlers and leftover tags", () => {
    const text = normalizeDescription('hi <script>alert(1)</script><img src=x onerror="alert(1)">')
    expect(text).toBe("hi")
  })
  it("decodes entities only after tags are stripped", () => {
    expect(normalizeDescription("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("<script>alert(1)</script>")
    expect(normalizeDescription("caf&#233; &#x26; bar")).toBe("café & bar")
  })
  it("collapses an excerpt to one truncated line", () => {
    expect(descriptionExcerpt("<p>a</p><p>b</p>")).toBe("a b")
    expect(descriptionExcerpt("abcdef", 4)).toBe("abc…")
  })
})
