import { afterEach, describe, expect, it, vi } from "vitest"
import { parseICal, expandRRule, parseRRule } from "@/lib/calendar-events/ical"
import { EVENT_LIST_FIELDS, fetchFromGoogleApi, mapApiItem } from "@/lib/calendar-events/google-api"
import { filterEvents, defaultFilters, isFiltered, monthRange, uniqueLocations, NO_LOCATION } from "@/lib/calendar-events/filters"
import { buildIcs, createMapsUrl, googleAddToCalendarUrl, shareUrl } from "@/lib/calendar-events/links"
import { descriptionExcerpt, normalizeDescription } from "@/lib/calendar-events/description"
import { clearEventCache, loadEvents } from "@/lib/calendar-events/source"
import { addDays, bucketByDay, bucketByStartDay, dayKey, formatEventSpan, fetchWindow, formatCompactTime, monthGridWindow, weekNumber, zonedDate } from "@/lib/calendar-events/time"
import { layoutWeek } from "@/lib/calendar-events/week-layout"
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

describe("events.list request", () => {
  it("asks only for the fields it maps, and still pages", async () => {
    const urls: string[] = []
    const fetcher = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return Response.json(urls.length === 1 ? { items: [], nextPageToken: "p2" } : { items: [] })
    }) as typeof fetch
    await fetchFromGoogleApi({
      calendarId: "c", apiKey: "k", timeZone: TZ, fetcher,
      timeMin: new Date("2026-03-01T00:00:00Z"), timeMax: new Date("2026-04-01T00:00:00Z"),
    })
    expect(urls).toHaveLength(2)
    for (const u of urls) expect(new URL(u).searchParams.get("fields")).toBe(EVENT_LIST_FIELDS)
    expect(EVENT_LIST_FIELDS).toContain("nextPageToken")
    expect(new URL(urls[1]).searchParams.get("pageToken")).toBe("p2")
  })
})

describe("loadEvents source order", () => {
  const range = { timeMin: new Date("2026-03-01T00:00:00Z"), timeMax: new Date("2026-04-01T00:00:00Z") }
  const base = { calendarId: "cal@group.calendar.google.com", cacheKey: null, retries: 0, icalProxies: [], ...range }
  const apiBody = { items: [{ id: "api1", summary: "From API", start: { dateTime: "2026-03-05T19:00:00Z" } }] }
  const ics = [
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:ical1", "DTSTART:20260305T190000Z",
    "SUMMARY:From iCal", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n")
  const blocked = {
    error: { message: "Requests from referer http://localhost:5173/ are blocked." },
  }

  function mockFetch(handlers: { api: () => Response; ical: () => Response }) {
    const urls: string[] = []
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      return url.includes("googleapis.com") ? handlers.api() : handlers.ical()
    }) as typeof fetch
    return { fetcher, urls }
  }

  it("uses the API first when a key is provided and skips iCal on success", async () => {
    const { fetcher, urls } = mockFetch({
      api: () => Response.json(apiBody),
      ical: () => new Response(ics),
    })
    const res = await loadEvents({ ...base, apiKey: "k", timeZone: TZ, fetcher })
    expect(res.source).toBe("google-api")
    expect(res.events.map((e) => e.summary)).toEqual(["From API"])
    expect(urls.every((u) => u.includes("googleapis.com"))).toBe(true)
  })

  it("goes straight to iCal when no key is provided", async () => {
    const { fetcher, urls } = mockFetch({
      api: () => Response.json(apiBody),
      ical: () => new Response(ics),
    })
    const res = await loadEvents({ ...base, timeZone: TZ, fetcher })
    expect(res.source).toBe("ical")
    expect(urls.some((u) => u.includes("googleapis.com"))).toBe(false)
  })

  it("falls back to iCal when the API rejects the key", async () => {
    const { fetcher } = mockFetch({
      api: () => Response.json(blocked, { status: 403 }),
      ical: () => new Response(ics),
    })
    const res = await loadEvents({ ...base, apiKey: "k", timeZone: TZ, fetcher })
    expect(res.source).toBe("ical")
    expect(res.events.map((e) => e.summary)).toEqual(["From iCal"])
  })

  it("reports the API failure as well when iCal fails too", async () => {
    const { fetcher } = mockFetch({
      api: () => Response.json(blocked, { status: 403 }),
      ical: () => new Response("nope", { status: 403 }),
    })
    const err = await loadEvents({ ...base, apiKey: "k", timeZone: TZ, fetcher }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    expect(message).toContain("Google Calendar API responded 403")
    expect(message).toContain("referer http://localhost:5173/ are blocked")
    expect(message).toContain("iCal fetch responded 403")
  })

  it("keeps the plain iCal error when no key was tried", async () => {
    const { fetcher } = mockFetch({
      api: () => Response.json(apiBody),
      ical: () => new Response("nope", { status: 403 }),
    })
    await expect(loadEvents({ ...base, timeZone: TZ, fetcher })).rejects.toThrow("iCal fetch responded 403")
  })
})

describe("event cache expiry", () => {
  const range = { timeMin: new Date("2026-03-01T00:00:00Z"), timeMax: new Date("2026-04-01T00:00:00Z") }
  const base = { calendarId: "cal@group.calendar.google.com", retries: 0, icalProxies: [], timeZone: TZ, ...range }
  const ics = [
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:ical1", "DTSTART:20260305T190000Z",
    "SUMMARY:From iCal", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n")
  const ok = (async () => new Response(ics)) as typeof fetch
  const down = (async () => new Response("nope", { status: 503 })) as typeof fetch

  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
  })

  it("serves the cache when the network is down and the entry is fresh", async () => {
    await loadEvents({ ...base, fetcher: ok })
    const res = await loadEvents({ ...base, fetcher: down })
    expect(res.source).toBe("cache")
    expect(res.events.map((e) => e.summary)).toEqual(["From iCal"])
  })

  it("ignores and removes an entry older than cacheTtlMs", async () => {
    vi.useFakeTimers()
    await loadEvents({ ...base, fetcher: ok })
    expect(sessionStorage.length).toBe(1)
    vi.advanceTimersByTime(61_000)
    await expect(loadEvents({ ...base, cacheTtlMs: 60_000, fetcher: down })).rejects.toThrow("iCal fetch responded 503")
    expect(sessionStorage.length).toBe(0)
  })

  it("clearEventCache removes only event entries", async () => {
    await loadEvents({ ...base, fetcher: ok })
    sessionStorage.setItem("other", "keep")
    expect(clearEventCache()).toBe(1)
    expect(sessionStorage.getItem("other")).toBe("keep")
    await expect(loadEvents({ ...base, fetcher: down })).rejects.toThrow()
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
  const events = [
    ev({ id: "feb", summary: "Old", start: new Date("2026-02-01T20:00:00Z"), end: new Date("2026-02-01T22:00:00Z") }),
    ev({ id: "soon", summary: "Waltz", location: "Studio A", start: new Date("2026-03-06T20:00:00Z"), end: new Date("2026-03-06T22:00:00Z") }),
    ev({ id: "later", summary: "Tango", start: new Date("2026-04-20T20:00:00Z"), end: new Date("2026-04-20T22:00:00Z") }),
  ]
  const ctx = { timeZone: TZ }
  const day = (y: number, m: number, d: number, h = 0) => zonedDate(y, m, d, TZ, h)
  const ids = (list: CalendarEvent[]) => list.map((e) => e.id)

  it("shows every event, earliest first, when no range is set", () => {
    expect(ids(filterEvents(events, defaultFilters, ctx))).toEqual(["feb", "soon", "later"])
  })
  it("treats a range with only `from` as that single day", () => {
    const list = [
      ev({ id: "nov9", start: day(2026, 11, 9, 19), end: day(2026, 11, 9, 21) }),
      ev({ id: "nov10", start: day(2026, 11, 10, 19), end: day(2026, 11, 10, 21) }),
    ]
    expect(ids(filterEvents(list, { ...defaultFilters, dateRange: { from: day(2026, 11, 9) } }, ctx))).toEqual(["nov9"])
  })
  it("excludes the all-day Nov 8 event from a Nov 9 range (end is exclusive)", () => {
    const list = [
      ev({ id: "nov8", allDay: true, start: day(2026, 11, 8), end: day(2026, 11, 9) }),
      ev({ id: "nov9", allDay: true, start: day(2026, 11, 9), end: day(2026, 11, 10) }),
    ]
    const range = { from: day(2026, 11, 9), to: day(2026, 11, 9) }
    expect(ids(filterEvents(list, { ...defaultFilters, dateRange: range }, ctx))).toEqual(["nov9"])
  })
  it("keeps events overlapping the range edges and drops ones that only touch them", () => {
    const list = [
      ev({ id: "spans-start", start: day(2026, 11, 8, 20), end: day(2026, 11, 9, 2) }),
      ev({ id: "ends-at-start", start: day(2026, 11, 8, 20), end: day(2026, 11, 9) }),
      ev({ id: "spans-end", start: day(2026, 11, 15, 23), end: day(2026, 11, 16, 1) }),
      ev({ id: "starts-after", start: day(2026, 11, 16), end: day(2026, 11, 16, 1) }),
    ]
    const range = { from: day(2026, 11, 9), to: day(2026, 11, 15) }
    expect(ids(filterEvents(list, { ...defaultFilters, dateRange: range }, ctx))).toEqual(["spans-start", "spans-end"])
  })
  it("compares whole days, ignoring the time of day on range edges", () => {
    const list = [ev({ id: "a", start: day(2026, 11, 9, 9), end: day(2026, 11, 9, 10) })]
    expect(ids(filterEvents(list, { ...defaultFilters, dateRange: { from: day(2026, 11, 9, 20) } }, ctx))).toEqual(["a"])
  })
  it("includes a multi-day event under any range it overlaps", () => {
    const list = [ev({ id: "fest", allDay: true, start: day(2026, 11, 7), end: day(2026, 11, 11) })]
    expect(ids(filterEvents(list, { ...defaultFilters, dateRange: { from: day(2026, 11, 10) } }, ctx))).toEqual(["fest"])
    expect(ids(filterEvents(list, { ...defaultFilters, dateRange: { from: day(2026, 11, 11) } }, ctx))).toEqual([])
  })
  it("monthRange covers the whole calendar month in the zone", () => {
    const r = monthRange(day(2026, 2, 15), TZ)
    expect(dayKey(r.from, TZ)).toBe("2026-02-01")
    expect(dayKey(r.to!, TZ)).toBe("2026-02-28")
  })
  it("isFiltered compares the date range with the base filters", () => {
    const next = { from: day(2026, 3, 9) }
    expect(isFiltered(defaultFilters)).toBe(false)
    expect(isFiltered({ ...defaultFilters, dateRange: next })).toBe(true)
    expect(isFiltered({ ...defaultFilters, dateRange: next }, { ...defaultFilters, dateRange: { ...next } })).toBe(false)
    expect(isFiltered({ ...defaultFilters, dateRange: { from: next.from, to: next.from } }, { ...defaultFilters, dateRange: next })).toBe(false)
  })
  it("searches and filters by location", () => {
    expect(filterEvents(events, { ...defaultFilters, search: "tan" }, ctx).map((e) => e.id)).toEqual(["later"])
    expect(filterEvents(events, { ...defaultFilters, location: "Studio A" }, ctx).map((e) => e.id)).toEqual(["soon"])
    expect(filterEvents(events, { ...defaultFilters, location: NO_LOCATION }, ctx).map((e) => e.id)).toEqual(["feb", "later"])
    expect(uniqueLocations(events).map((l) => l.label)).toEqual(["Studio A", "No location"])
  })
})

describe("bucketByDay", () => {
  const day = (y: number, m: number, d: number, h = 0, min = 0) => zonedDate(y, m, d, TZ, h, min)
  const keys = (map: Map<string, CalendarEvent[]>, id: string) =>
    [...map].filter(([, list]) => list.some((e) => e.id === id)).map(([k]) => k)
  const from = day(2026, 3, 1)
  const to = day(2026, 4, 1)

  it("process runs in America/Los_Angeles", () => {
    expect(process.env.TZ).toBe(TZ)
  })
  it("puts a single all-day event on one day", () => {
    const e = ev({ id: "a", allDay: true, start: day(2026, 3, 10), end: day(2026, 3, 11) })
    expect(keys(bucketByDay([e], from, to, TZ), "a")).toEqual(["2026-03-10"])
  })
  it("spreads a 3-day all-day event over exactly 3 days (end is exclusive)", () => {
    const e = ev({ id: "a", allDay: true, start: day(2026, 3, 10), end: day(2026, 3, 13) })
    expect(keys(bucketByDay([e], from, to, TZ), "a")).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"])
  })
  it("covers both days for an event crossing midnight", () => {
    const e = ev({ id: "a", start: day(2026, 3, 10, 22), end: day(2026, 3, 11, 2) })
    expect(keys(bucketByDay([e], from, to, TZ), "a")).toEqual(["2026-03-10", "2026-03-11"])
  })
  it("does not spill onto the next day when ending exactly at midnight", () => {
    const e = ev({ id: "a", start: day(2026, 3, 10, 20), end: day(2026, 3, 11) })
    expect(keys(bucketByDay([e], from, to, TZ), "a")).toEqual(["2026-03-10"])
  })
  it("keeps a zero-length event on its start day", () => {
    const e = ev({ id: "a", start: day(2026, 3, 10, 9), end: day(2026, 3, 10, 9) })
    expect(keys(bucketByDay([e], from, to, TZ), "a")).toEqual(["2026-03-10"])
  })
  it("counts calendar days across the spring-forward weekend", () => {
    // DST began Mar 8 2026 in Los Angeles: Mar 8 is 23 hours long.
    const allDay = ev({ id: "a", allDay: true, start: day(2026, 3, 7), end: day(2026, 3, 10) })
    const overnight = ev({ id: "b", start: day(2026, 3, 7, 22), end: day(2026, 3, 8, 6) })
    const map = bucketByDay([allDay, overnight], from, to, TZ)
    expect(keys(map, "a")).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"])
    expect(keys(map, "b")).toEqual(["2026-03-07", "2026-03-08"])
  })
  it("clips an event that started before the window", () => {
    const e = ev({ id: "a", allDay: true, start: day(2026, 2, 20), end: day(2026, 3, 4) })
    expect(keys(bucketByDay([e], from, to, TZ), "a")).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"])
  })
  it("clips an event that runs past the window", () => {
    const e = ev({ id: "a", allDay: true, start: day(2026, 3, 30), end: day(2026, 4, 5) })
    expect(keys(bucketByDay([e], from, to, TZ), "a")).toEqual(["2026-03-30", "2026-03-31"])
  })
  it("drops events entirely outside the window, including ones ending at its start", () => {
    const before = ev({ id: "a", start: day(2026, 2, 28, 20), end: day(2026, 3, 1) })
    const after = ev({ id: "b", start: day(2026, 4, 1), end: day(2026, 4, 1, 2) })
    expect(bucketByDay([before, after], from, to, TZ).size).toBe(0)
  })
  it("sorts all-day events first, then by start time", () => {
    const late = ev({ id: "late", start: day(2026, 3, 10, 21), end: day(2026, 3, 10, 22) })
    const early = ev({ id: "early", start: day(2026, 3, 10, 9), end: day(2026, 3, 10, 10) })
    const allDay = ev({ id: "all", allDay: true, start: day(2026, 3, 10), end: day(2026, 3, 11) })
    const list = bucketByDay([late, early, allDay], from, to, TZ).get("2026-03-10")!
    expect(list.map((e) => e.id)).toEqual(["all", "early", "late"])
  })
})

describe("bucketByStartDay", () => {
  const day = (y: number, m: number, d: number, h = 0, min = 0) => zonedDate(y, m, d, TZ, h, min)
  const from = day(2026, 3, 1)
  const to = day(2026, 4, 1)

  it("lists a multi-day event once, under its start day", () => {
    const e = ev({ id: "a", allDay: true, start: day(2026, 3, 10), end: day(2026, 3, 13) })
    const map = bucketByStartDay([e], from, to, TZ)
    expect([...map.keys()]).toEqual(["2026-03-10"])
  })
  it("drops an event that started before the window or starts after it", () => {
    const early = ev({ id: "a", allDay: true, start: day(2026, 2, 28), end: day(2026, 3, 3) })
    const late = ev({ id: "b", start: day(2026, 4, 1), end: day(2026, 4, 1, 2) })
    expect(bucketByStartDay([early, late], from, to, TZ).size).toBe(0)
  })
  it("sorts all-day first, then by start time", () => {
    const late = ev({ id: "late", start: day(2026, 3, 10, 21), end: day(2026, 3, 10, 22) })
    const early = ev({ id: "early", start: day(2026, 3, 10, 9), end: day(2026, 3, 10, 10) })
    const all = ev({ id: "all", allDay: true, start: day(2026, 3, 10), end: day(2026, 3, 11) })
    const list = bucketByStartDay([late, early, all], from, to, TZ).get("2026-03-10")!
    expect(list.map((e) => e.id)).toEqual(["all", "early", "late"])
  })
})

describe("formatEventSpan", () => {
  const at = (d: number, h = 0, min = 0) => zonedDate(2026, 3, d, TZ, h, min)

  it("reads like a single-day slice for same-day events", () => {
    expect(formatEventSpan(ev({ id: "a", start: at(10, 19), end: at(10, 21) }), TZ)).toBe("7:00 PM – 9:00 PM")
    expect(formatEventSpan(ev({ id: "a", allDay: true, start: at(10), end: at(11) }), TZ)).toBe("All day")
  })
  it("includes both dates and times for a timed multi-day event", () => {
    const e = ev({ id: "a", start: at(7, 19), end: at(9, 9) })
    expect(formatEventSpan(e, TZ)).toBe("Sat, Mar 7, 7:00 PM – Mon, Mar 9, 9:00 AM")
  })
  it("uses the last covered day for an all-day span", () => {
    const e = ev({ id: "a", allDay: true, start: at(7), end: at(10) })
    expect(formatEventSpan(e, TZ)).toBe("Sat, Mar 7 – Mon, Mar 9")
  })
  it("treats a timed event ending at midnight as single-day", () => {
    expect(formatEventSpan(ev({ id: "a", start: at(10, 20), end: at(11) }), TZ)).toBe("8:00 PM – 12:00 AM")
  })
})

describe("month grid window", () => {
  it("pads to whole weeks for either week start", () => {
    // March 2026 starts on a Sunday and has 31 days.
    const sun = monthGridWindow(zonedDate(2026, 3, 15, TZ), 0, TZ)
    expect(dayKey(sun.from, TZ)).toBe("2026-03-01")
    expect(sun.days).toBe(35)
    const mon = monthGridWindow(zonedDate(2026, 3, 15, TZ), 1, TZ)
    expect(dayKey(mon.from, TZ)).toBe("2026-02-23")
    expect(dayKey(mon.to, TZ)).toBe("2026-04-06")
    expect(mon.days).toBe(42)
  })
  it("fetchWindow covers the padded grid", () => {
    const w = fetchWindow(zonedDate(2026, 5, 10, TZ), undefined, 0, TZ)
    expect(dayKey(w.from, TZ)).toBe("2026-04-26")
    expect(dayKey(w.to, TZ)).toBe("2026-06-07")
  })
  it("fetchWindow widens for a range and caps it at 366 days", () => {
    const month = zonedDate(2026, 3, 10, TZ)
    const near = fetchWindow(month, { from: zonedDate(2026, 3, 20, TZ), to: zonedDate(2026, 5, 2, TZ) }, 0, TZ)
    expect(dayKey(near.to, TZ)).toBe("2026-05-03")
    const huge = fetchWindow(month, { from: zonedDate(2026, 3, 20, TZ), to: zonedDate(2030, 1, 1, TZ) }, 0, TZ)
    expect(dayKey(huge.to, TZ)).toBe("2027-03-21")
  })
})

describe("weekNumber", () => {
  const wn = (y: number, m: number, d: number, start: 0 | 1 = 0) => weekNumber(zonedDate(y, m, d, TZ), start, TZ)
  it("numbers the week starting Sun Nov 1 2026 as W45", () => {
    expect(wn(2026, 11, 1)).toBe(45)
    expect(wn(2026, 11, 7)).toBe(45)
    expect(wn(2026, 11, 8)).toBe(46)
  })
  it("makes the week containing Jan 1 week 1, including its days in the old year", () => {
    expect(wn(2026, 1, 1)).toBe(1)
    expect(wn(2025, 12, 28)).toBe(1) // Sunday of the week containing Thu Jan 1 2026
    expect(wn(2025, 12, 27)).toBe(52)
    expect(wn(2026, 12, 26)).toBe(52)
    expect(wn(2026, 12, 27)).toBe(1) // that week contains Fri Jan 1 2027
    expect(wn(2027, 1, 2)).toBe(1)
    expect(wn(2027, 1, 3)).toBe(2)
  })
  it("follows weekStartsOn", () => {
    // Monday weeks: Mon Oct 26 .. Sun Nov 1 is one week.
    expect(wn(2026, 11, 1, 1)).toBe(wn(2026, 10, 26, 1))
    expect(wn(2026, 11, 2, 1)).toBe(wn(2026, 11, 1, 1) + 1)
  })
})

describe("formatCompactTime", () => {
  const at = (h: number, m = 0) => formatCompactTime(zonedDate(2026, 11, 8, TZ, h, m), TZ)
  it("drops :00 and uses a/p", () => {
    expect(at(9)).toBe("9a")
    expect(at(13)).toBe("1p")
    expect(at(12)).toBe("12p")
    expect(at(0)).toBe("12a")
    expect(at(10, 30)).toBe("10:30a")
    expect(at(23, 5)).toBe("11:05p")
  })
  it("reads the wall clock in the given zone", () => {
    expect(formatCompactTime(new Date("2026-11-08T17:00:00Z"), "UTC")).toBe("5p")
    expect(formatCompactTime(new Date("2026-11-08T17:00:00Z"), TZ)).toBe("9a")
  })
})

describe("layoutWeek", () => {
  const day = (d: number, h = 0) => zonedDate(2026, 11, d, TZ, h)
  // Week of Sun Nov 8 .. Sat Nov 14 2026.
  const week = Array.from({ length: 7 }, (_, i) => day(8 + i))
  const allDay = (id: string, from: number, toExclusive: number) =>
    ev({ id, summary: id, allDay: true, start: day(from), end: day(toExclusive) })
  const timed = (id: string, d: number, h: number) =>
    ev({ id, summary: id, start: day(d, h), end: day(d, h + 1) })
  const layout = (events: CalendarEvent[], maxRows = 3) => layoutWeek(events, week, TZ, maxRows)

  it("lays a single-day all-day event as a one-column bar", () => {
    const { bars } = layout([allDay("a", 10, 11)])
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ startCol: 2, span: 1, lane: 0, continuesBefore: false, continuesAfter: false })
  })
  it("spans a 3-day all-day event over 3 columns", () => {
    const { bars } = layout([allDay("a", 10, 13)])
    expect(bars[0]).toMatchObject({ startCol: 2, span: 3, lane: 0, continuesBefore: false, continuesAfter: false })
  })
  it("splits a bar at the week boundary, marking the clipped sides", () => {
    const event = allDay("a", 12, 18) // Thu Nov 12 .. Tue Nov 17
    const thisWeek = layout([event]).bars[0]
    expect(thisWeek).toMatchObject({ startCol: 4, span: 3, continuesBefore: false, continuesAfter: true })
    const nextWeek = layoutWeek([event], week.map((d) => addDays(d, 7, TZ)), TZ, 3).bars[0]
    expect(nextWeek).toMatchObject({ startCol: 0, span: 3, continuesBefore: true, continuesAfter: false })
  })
  it("marks both sides for a bar that crosses the whole week", () => {
    const { bars } = layout([allDay("a", 5, 20)])
    expect(bars[0]).toMatchObject({ startCol: 0, span: 7, continuesBefore: true, continuesAfter: true })
  })
  it("puts overlapping bars in separate lanes and reuses a lane once it is free", () => {
    const { bars } = layout([allDay("long", 9, 13), allDay("overlap", 11, 14), allDay("later", 13, 14)], 5)
    const lane = (id: string) => bars.find((b) => b.event.id === id)!.lane
    expect(lane("long")).toBe(0)
    expect(lane("overlap")).toBe(1)
    expect(lane("later")).toBe(0)
  })
  it("starts the longer of two same-day bars in the first lane", () => {
    const { bars } = layout([allDay("short", 9, 10), allDay("long", 9, 12)])
    expect(bars.find((b) => b.event.id === "long")!.lane).toBe(0)
    expect(bars.find((b) => b.event.id === "short")!.lane).toBe(1)
  })
  it("keeps timed events out of the bars, in their day", () => {
    const { bars, days } = layout([timed("t", 9, 9)])
    expect(bars).toEqual([])
    expect(days[1].timed.map((e) => e.id)).toEqual(["t"])
    expect(days[1]).toMatchObject({ lanes: 0, hidden: 0 })
  })
  it("draws a timed event that crosses midnight as a bar over each day it touches", () => {
    const retreat = ev({ id: "retreat", summary: "retreat", start: day(9, 19), end: day(11, 14) })
    const { bars, days } = layout([retreat])
    expect(bars).toHaveLength(1)
    expect(bars[0]).toMatchObject({ startCol: 1, span: 3, lane: 0, continuesBefore: false, continuesAfter: false })
    expect(days.every((d) => d.timed.length === 0)).toBe(true)
    expect(days[2]).toMatchObject({ lanes: 1, hidden: 0 })
  })
  it("keeps a timed event that ends exactly at midnight as a one-day row", () => {
    const late = ev({ id: "late", summary: "late", start: day(9, 20), end: day(10) })
    const { bars, days } = layout([late])
    expect(bars).toEqual([])
    expect(days[1].timed.map((e) => e.id)).toEqual(["late"])
  })
  it("reserves the bar's lanes in every day it covers so timed rows line up", () => {
    const { days } = layout([allDay("bar", 9, 11), timed("t", 9, 9), timed("u", 11, 9)])
    expect(days[1].lanes).toBe(1)
    expect(days[2].lanes).toBe(1)
    expect(days[3].lanes).toBe(0)
  })
  it("shows the bar, 1 event and +6 more for 7 timed events plus 1 bar", () => {
    const events = [allDay("bar", 10, 11), ...Array.from({ length: 7 }, (_, i) => timed(`t${i}`, 10, 8 + i))]
    const { bars, days } = layout(events)
    expect(bars).toHaveLength(1)
    expect(days[2].timed.map((e) => e.id)).toEqual(["t0"])
    expect(days[2].hidden).toBe(6)
  })
  it("fills all three rows when the day fits exactly", () => {
    const { days } = layout([allDay("bar", 10, 11), timed("a", 10, 9), timed("b", 10, 10)])
    expect(days[2].timed).toHaveLength(2)
    expect(days[2].hidden).toBe(0)
  })
  it("hides everything but +N more when the cell only has room for that", () => {
    const { days } = layout([timed("a", 10, 9), timed("b", 10, 10)], 1)
    expect(days[2].timed).toEqual([])
    expect(days[2].hidden).toBe(2)
  })
  it("counts a bar that does not fit among the hidden items and drops it from the bars", () => {
    const events = [allDay("a", 10, 11), allDay("b", 10, 11), allDay("c", 10, 11), timed("t", 10, 9)]
    const { bars, days } = layout(events)
    expect(bars.map((b) => b.lane).sort()).toEqual([0, 1])
    expect(days[2].timed).toEqual([])
    expect(days[2].hidden).toBe(2) // one bar + the timed event
  })
  it("hides a multi-day bar everywhere when one of its days overflows", () => {
    const events = [allDay("a", 10, 12), allDay("b", 10, 12), allDay("c", 10, 12), timed("t", 11, 9)]
    const { bars, days } = layout(events)
    expect(bars.map((b) => b.event.id)).toEqual(["a", "b"])
    expect(days[2].hidden).toBe(1)
    expect(days[3].hidden).toBe(2)
  })
  it("returns empty days for an empty week", () => {
    const { bars, days } = layout([])
    expect(bars).toEqual([])
    expect(days).toHaveLength(7)
    expect(days.every((d) => d.timed.length === 0 && d.hidden === 0 && d.lanes === 0)).toBe(true)
  })
  it("handles the DST fall-back weekend", () => {
    // DST ended Sun Nov 1 2026 in Los Angeles: that day is 25 hours long.
    const dstWeek = Array.from({ length: 7 }, (_, i) => zonedDate(2026, 11, 1 + i, TZ))
    const e = ev({ id: "a", summary: "a", allDay: true, start: zonedDate(2026, 10, 31, TZ), end: zonedDate(2026, 11, 3, TZ) })
    expect(layoutWeek([e], dstWeek, TZ, 3).bars[0]).toMatchObject({ startCol: 0, span: 2, continuesBefore: true, continuesAfter: false })
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
