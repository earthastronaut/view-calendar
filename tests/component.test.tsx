import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CalendarEvents, type CalendarEventsProps } from "@/ui/calendar-events"

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
  cleanup()
  sessionStorage.clear()
})

const soon = (days: number, hour = 19) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}
const item = (id: string, summary: string, days: number, extra: object = {}) => ({
  id,
  summary,
  start: { dateTime: soon(days).toISOString() },
  end: { dateTime: soon(days, 21).toISOString() },
  ...extra,
})

const respond = (items: object[]) =>
  (async () => new Response(JSON.stringify({ items }), { status: 200 })) as unknown as typeof fetch

const fetcher = respond([
  item("a", "Waltz Night", 2, { location: "Studio A, Eugene OR", description: "Bring shoes<br>Free entry &mdash; https://signup.test/waltz" }),
  item("b", "Tango Workshop", 5, { location: "Studio B" }),
  item("c", "Old Social", -3),
])

const NEXT_WEEK = { from: soon(0), to: soon(6) }

const setup = (props: Partial<CalendarEventsProps> = {}) =>
  render(
    <CalendarEvents
      calendarId="cal@group.calendar.google.com"
      apiKey="k"
      timeZone="UTC"
      fetcher={fetcher}
      syncUrl={false}
      defaultFilters={{ dateRange: NEXT_WEEK }}
      {...props}
    />,
  )

describe("<CalendarEvents />", () => {
  it("lists events in the default date range and hides the rest", async () => {
    setup()
    expect(await screen.findByText("Waltz Night")).toBeTruthy()
    expect(screen.getByText("Tango Workshop")).toBeTruthy()
    expect(screen.queryByText("Old Social")).toBeNull()
  })

  it("shows the visible month when no range is set", async () => {
    setup({ defaultFilters: {}, fetcher: respond([item("t", "Today Social", 0)]) })
    expect(await screen.findByText("Today Social")).toBeTruthy()
  })

  it("filters by name and clears back to the defaults", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("Waltz Night")
    await user.type(screen.getByLabelText("Search events"), "tango")
    expect(screen.queryByText("Waltz Night")).toBeNull()
    await user.click(screen.getByRole("button", { name: /clear/i }))
    expect(await screen.findByText("Waltz Night")).toBeTruthy()
  })

  it("filters by a quick date range picked from the date filter", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {} })
    await screen.findByText("Waltz Night")
    await user.click(screen.getByRole("button", { name: "Date range" }))
    await user.click(await screen.findByRole("button", { name: "Next 7 days" }))
    expect(screen.getByText("Waltz Night")).toBeTruthy()
    expect(screen.getByText("Tango Workshop")).toBeTruthy()
    expect(screen.queryByText("Old Social")).toBeNull()
  })

  it("filters by location", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("Waltz Night")
    await user.selectOptions(screen.getByLabelText("Location"), "Studio B")
    expect(screen.queryByText("Waltz Night")).toBeNull()
    expect(screen.getByText("Tango Workshop")).toBeTruthy()
  })

  it("opens a modal with the description, maps, add-to-calendar and share", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole("button", { name: /Waltz Night, view details/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/Bring shoes Free entry —/)).toBeTruthy()
    expect(within(dialog).getByRole("link", { name: "https://signup.test/waltz" }).getAttribute("href")).toBe(
      "https://signup.test/waltz",
    )
    expect(within(dialog).getByRole("link", { name: "Studio A, Eugene OR" }).getAttribute("href")).toContain("google.com/maps")
    expect(within(dialog).getByRole("link", { name: /Add to Google Calendar/ }).getAttribute("href")).toContain("action=TEMPLATE")
    expect(within(dialog).getByRole("button", { name: /Share/ })).toBeTruthy()
  })

  it("shows external links and switches to the month grid", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("Waltz Night")
    expect(screen.getByRole("link", { name: /View calendar/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /iCal/ }).getAttribute("href")).toContain("basic.ics")
    await user.click(screen.getByRole("tab", { name: "Month" }))
    expect(screen.getByRole("grid")).toBeTruthy()
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Waltz Night|Tango Workshop/ }).length).toBeGreaterThan(0))
  })
})

// Desktop vs. mobile is decided by matchMedia; jsdom has none, so tests stub it.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
const utcDay = (d: Date) => d.toISOString().slice(0, 10)

describe("views", () => {
  it("lists a multi-day event under each day it covers", async () => {
    const span = { id: "fest", summary: "Weekend Fest", start: { dateTime: soon(1).toISOString() }, end: { dateTime: soon(3).toISOString() } }
    setup({ fetcher: respond([span]) })
    expect(await screen.findAllByRole("button", { name: /Weekend Fest, view details/ })).toHaveLength(3)
  })

  it("lists a multi-day event once with its start and end when multiDayList is start", async () => {
    const span = { id: "fest", summary: "Weekend Fest", start: { dateTime: soon(1).toISOString() }, end: { dateTime: soon(3, 9).toISOString() } }
    setup({ fetcher: respond([span]), multiDayList: "start" })
    const card = await screen.findByRole("button", { name: /Weekend Fest, view details/ })
    expect(screen.getAllByRole("button", { name: /Weekend Fest, view details/ })).toHaveLength(1)
    expect(card.closest("article")?.textContent).toMatch(/7:00 PM – .*9:00 AM/)
  })

  it("labels grid chips with title, time and date", async () => {
    stubMatchMedia(true)
    setup({ defaultFilters: {} })
    const grid = await screen.findByRole("grid")
    const chip = within(grid).getByRole("button", { name: /^Waltz Night, 7:00 PM, / })
    expect(chip.getAttribute("aria-label")).toContain(utcDay(soon(2)).slice(0, 4))
  })

  it("moves focus between days with the arrow keys on the month grid", async () => {
    stubMatchMedia(true)
    const user = userEvent.setup()
    setup({ defaultFilters: {} })
    const grid = await screen.findByRole("grid")
    const today = grid.querySelector<HTMLElement>(`[data-day="${utcDay(new Date())}"]`)!
    expect(today.getAttribute("tabindex")).toBe("0")
    today.focus()
    await user.keyboard("{ArrowRight}")
    const tomorrow = grid.querySelector<HTMLElement>(`[data-day="${utcDay(new Date(Date.now() + 86_400_000))}"]`)!
    expect(document.activeElement).toBe(tomorrow)
    expect(tomorrow.getAttribute("tabindex")).toBe("0")
    expect(today.getAttribute("tabindex")).toBe("-1")
  })

  it("on small screens, tapping a day opens the list filtered to that day", async () => {
    stubMatchMedia(false)
    const user = userEvent.setup()
    setup({ defaultFilters: {} })
    await user.click(await screen.findByRole("tab", { name: "Month" }))
    const grid = await screen.findByRole("grid")
    await user.click(grid.querySelector<HTMLElement>(`[data-day="${utcDay(soon(2))}"]`)!)
    expect(await screen.findByRole("button", { name: /Waltz Night, view details/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Tango Workshop, view details/ })).toBeNull()
    expect(screen.queryByRole("grid")).toBeNull()
  })
})

describe("states and modal links", () => {
  it("shows a skeleton while the first load is pending", () => {
    setup({ fetcher: (() => new Promise<Response>(() => {})) as unknown as typeof fetch })
    expect(screen.getByRole("status")).toBeTruthy()
    expect(screen.getByText("Loading events…")).toBeTruthy()
  })

  it("offers Clear filters when filters leave the list empty", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("Waltz Night")
    await user.type(screen.getByLabelText("Search events"), "no such event")
    expect(await screen.findByText("No events match your filters.")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(await screen.findByText("Waltz Night")).toBeTruthy()
  })

  it("does not render a non-https htmlLink as a link", async () => {
    const user = userEvent.setup()
    setup({ fetcher: respond([item("x", "Unsafe Link", 1, { htmlLink: "javascript:alert(1)" })]) })
    await user.click(await screen.findByRole("button", { name: /Unsafe Link, view details/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByRole("link", { name: /Open in Google/ })).toBeNull()
  })

  it("renders an https htmlLink as Open in Google", async () => {
    const user = userEvent.setup()
    setup({ fetcher: respond([item("y", "Safe Link", 1, { htmlLink: "https://calendar.google.com/event?eid=y" })]) })
    await user.click(await screen.findByRole("button", { name: /Safe Link, view details/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("link", { name: /Open in Google/ }).getAttribute("href")).toBe(
      "https://calendar.google.com/event?eid=y",
    )
  })
})

describe("month grid layout", () => {
  // Nov 2026 starts on a Sunday and has 30 days: exactly five week rows.
  const events = [
    { id: "fest", summary: "Harvest Fest", start: { date: "2026-11-05" }, end: { date: "2026-11-10" } },
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      summary: `Class ${i}`,
      start: { dateTime: `2026-11-12T${String(8 + i).padStart(2, "0")}:00:00Z` },
      end: { dateTime: `2026-11-12T${String(9 + i).padStart(2, "0")}:00:00Z` },
    })),
  ]

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"))
    stubMatchMedia(true)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function setupGrid() {
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events) })
    return screen.findByRole("grid")
  }

  it("renders 7 weekday headers and a row of 7 cells per week", async () => {
    const grid = await setupGrid()
    expect(within(grid).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
    const weekRows = within(grid).getAllByRole("row").slice(1)
    expect(weekRows).toHaveLength(5)
    for (const row of weekRows) expect(within(row).getAllByRole("gridcell")).toHaveLength(7)
  })

  it("shows a week-number badge on each row", async () => {
    const grid = await setupGrid()
    const badges = within(grid).getAllByRole("rowheader").map((h) => h.textContent)
    expect(badges).toEqual(["W45", "W46", "W47", "W48", "W49"])
  })

  it("draws a multi-day all-day event as one bar per week row it touches", async () => {
    const grid = await setupGrid()
    const label = "Harvest Fest, All day, Thursday, November 5, 2026 to Monday, November 9, 2026"
    const bars = await within(grid).findAllByRole("button", { name: label })
    expect(bars).toHaveLength(2)
    const rows = within(grid).getAllByRole("row")
    expect(rows[1].contains(bars[0])).toBe(true)
    expect(rows[2].contains(bars[1])).toBe(true)
    // Each bar starts in the cell of its first day in that week.
    expect(bars[0].closest("[data-day]")?.getAttribute("data-day")).toBe("2026-11-05")
    expect(bars[1].closest("[data-day]")?.getAttribute("data-day")).toBe("2026-11-08")
  })

  it("draws a timed event that runs past midnight as a bar, not a one-line row", async () => {
    const retreat = {
      id: "retreat",
      summary: "Staff Retreat",
      start: { dateTime: "2026-11-02T19:00:00Z" },
      end: { dateTime: "2026-11-04T14:00:00Z" },
    }
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond([retreat]) })
    const grid = await screen.findByRole("grid")
    const label = "Staff Retreat, 7:00 PM to 2:00 PM, Monday, November 2, 2026 to Wednesday, November 4, 2026"
    const bar = await within(grid).findByRole("button", { name: label })
    expect(bar.closest("[data-day]")?.getAttribute("data-day")).toBe("2026-11-02")
    expect(bar.textContent).toBe("7pStaff Retreat")
    // One bar for the whole event: no per-day rows on Tue or Wed.
    expect(within(grid).getAllByRole("button", { name: /^Staff Retreat/ })).toHaveLength(1)
  })

  it("shows +N more when a day has more events than rows", async () => {
    const grid = await setupGrid()
    const cell = grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!
    await within(cell).findByText("+3 more")
    expect(within(cell).getAllByRole("button", { name: /^Class \d, / })).toHaveLength(2)
  })

  it("lists every event of the day in the +N more popover", async () => {
    const user = userEvent.setup()
    const grid = await setupGrid()
    const cell = grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!
    await user.click(await within(cell).findByText("+3 more"))
    const popover = await screen.findByRole("dialog")
    expect(within(popover).getAllByRole("button", { name: /view details/ })).toHaveLength(5)
  })

  it("uses the compact time on timed rows", async () => {
    const grid = await setupGrid()
    const cell = grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!
    await within(cell).findByText("+3 more")
    expect(within(cell).getByText("8a")).toBeTruthy()
  })

  it("has one toolbar that moves between months and switches views", async () => {
    const user = userEvent.setup()
    await setupGrid()
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Next month" }))
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy()
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Today" }))
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "List" }))
    expect(screen.queryByRole("grid")).toBeNull()
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "List" }).getAttribute("aria-selected")).toBe("true")
  })

  it("does nothing when a day is clicked and dayModal is off", async () => {
    const user = userEvent.setup()
    const grid = await setupGrid()
    await user.click(grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!)
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens the day's events in a modal when the day is clicked and dayModal is on", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events), dayModal: true })
    const grid = await screen.findByRole("grid")
    await user.click(grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!)
    const dialog = await screen.findByRole("dialog", { name: "Thursday, November 12, 2026" })
    expect(within(dialog).getByText("5 events")).toBeTruthy()
    expect(within(dialog).getAllByRole("button", { name: /view details/ })).toHaveLength(5)
  })

  it("lists a multi-day event in the modal for each day it covers", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events), dayModal: true })
    const grid = await screen.findByRole("grid")
    await user.click(grid.querySelector<HTMLElement>('[data-day="2026-11-07"]')!)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("button", { name: /Harvest Fest, view details/ })).toBeTruthy()
  })

  it("does not open the day modal when an event in the day is clicked", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events), dayModal: true })
    const grid = await screen.findByRole("grid")
    const cell = grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!
    await user.click(await within(cell).findByRole("button", { name: /^Class 0, / }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("heading", { name: "Class 0" })).toBeTruthy()
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
  })

  it("opens an event from the day modal", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events), dayModal: true })
    const grid = await screen.findByRole("grid")
    await user.click(grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!)
    await user.click(await screen.findByRole("button", { name: /Class 2, view details/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("heading", { name: "Class 2" })).toBeTruthy()
  })

  it("renders renderDay into the modal and turns the modal on", async () => {
    const user = userEvent.setup()
    setup({
      defaultFilters: {},
      defaultView: "month",
      fetcher: respond(events),
      renderDay: (day, dayEvents) => <p>Custom day: {dayEvents.length} events</p>,
    })
    const grid = await screen.findByRole("grid")
    await user.click(grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!)
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Custom day: 5 events")).toBeTruthy()
    expect(within(dialog).queryByRole("button", { name: /view details/ })).toBeNull()
  })

  it("opens the day modal with Enter on a focused day", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events), dayModal: true })
    const grid = await screen.findByRole("grid")
    grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!.focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("dialog", { name: "Thursday, November 12, 2026" })).toBeTruthy()
  })

  it("adds ?day= to the URL while the day modal is open and removes it on close", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events), dayModal: true, syncUrl: true })
    const grid = await screen.findByRole("grid")
    await user.click(grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!)
    await screen.findByRole("dialog")
    expect(new URLSearchParams(window.location.search).get("day")).toBe("2026-11-12")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("day")).toBeNull())
  })

  it("leaves the URL alone when syncUrl is off", async () => {
    const user = userEvent.setup()
    setup({ defaultFilters: {}, defaultView: "month", fetcher: respond(events), dayModal: true })
    const grid = await screen.findByRole("grid")
    await user.click(grid.querySelector<HTMLElement>('[data-day="2026-11-12"]')!)
    await screen.findByRole("dialog")
    expect(new URLSearchParams(window.location.search).get("day")).toBeNull()
  })
})
