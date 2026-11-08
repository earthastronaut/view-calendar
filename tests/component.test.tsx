import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CalendarEvents } from "@/ui/calendar-events"

afterEach(() => {
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

const fetcher = (async () =>
  new Response(
    JSON.stringify({
      items: [
        item("a", "Waltz Night", 2, { location: "Studio A, Eugene OR", description: "## Bring shoes\n**Free** entry" }),
        item("b", "Tango Workshop", 5, { location: "Studio B" }),
        item("c", "Old Social", -3),
      ],
    }),
    { status: 200 },
  )) as unknown as typeof fetch

const setup = (props = {}) =>
  render(<CalendarEvents calendarId="cal@group.calendar.google.com" apiKey="k" timeZone="UTC" fetcher={fetcher} syncUrl={false} {...props} />)

describe("<CalendarEvents />", () => {
  it("lists upcoming events and hides past ones by default", async () => {
    setup()
    expect(await screen.findByText("Waltz Night")).toBeTruthy()
    expect(screen.getByText("Tango Workshop")).toBeTruthy()
    expect(screen.queryByText("Old Social")).toBeNull()
  })

  it("filters by name and by past/upcoming", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("Waltz Night")
    await user.type(screen.getByLabelText("Search events"), "tango")
    expect(screen.queryByText("Waltz Night")).toBeNull()
    await user.click(screen.getByRole("button", { name: /clear/i }))
    await user.selectOptions(screen.getByLabelText("Past or upcoming"), "past")
    expect(await screen.findByText("Old Social")).toBeTruthy()
    expect(screen.queryByText("Waltz Night")).toBeNull()
  })

  it("filters by location", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("Waltz Night")
    await user.selectOptions(screen.getByLabelText("Location"), "Studio B")
    expect(screen.queryByText("Waltz Night")).toBeNull()
    expect(screen.getByText("Tango Workshop")).toBeTruthy()
  })

  it("opens a modal with rendered markdown, maps, add-to-calendar and share", async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole("button", { name: /Waltz Night, view details/ }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Bring shoes").tagName).toBe("H2")
    expect(within(dialog).getByText("Free").tagName).toBe("STRONG")
    expect(within(dialog).getByRole("link", { name: "Studio A, Eugene OR" }).getAttribute("href")).toContain("google.com/maps")
    expect(within(dialog).getByRole("link", { name: /Add to Google Calendar/ }).getAttribute("href")).toContain("action=TEMPLATE")
    expect(within(dialog).getByRole("button", { name: /Share/ })).toBeTruthy()
  })

  it("shows external links and switches to the month calendar", async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText("Waltz Night")
    expect(screen.getByRole("link", { name: /View calendar/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /iCal/ }).getAttribute("href")).toContain("basic.ics")
    await user.click(screen.getByRole("tab", { name: /Calendar/ }))
    expect(screen.getByRole("grid")).toBeTruthy()
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Waltz Night|Tango Workshop/ }).length).toBeGreaterThan(0))
  })
})
