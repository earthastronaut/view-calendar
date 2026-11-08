import type { CalendarEvent, DateRange } from "./types"
import { addDays, defaultTimeZone, startOfDay, startOfMonth } from "./time"

export interface FilterState {
  search: string
  /** Exact location match; "" = any. Use NO_LOCATION for events without one. */
  location: string
  /** Absolute, inclusive range of calendar days; undefined = no date restriction. */
  dateRange?: DateRange
}

export const NO_LOCATION = "__none__"

export const defaultFilters: FilterState = { search: "", location: "" }

/** Same calendar days, compared on the instants given. A missing `to` means the single day `from`. */
export function sameDateRange(a: DateRange | undefined, b: DateRange | undefined): boolean {
  if (!a || !b) return a === b
  return a.from.getTime() === b.from.getTime() && (a.to ?? a.from).getTime() === (b.to ?? b.from).getTime()
}

export function isFiltered(f: FilterState, base: FilterState = defaultFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.location !== "" ||
    !sameDateRange(f.dateRange, base.dateRange)
  )
}

/** Inclusive range covering the whole calendar month that contains `month`. */
export function monthRange(month: Date, timeZone: string): DateRange {
  return {
    from: startOfMonth(month, timeZone),
    to: addDays(startOfMonth(month, timeZone, 1), -1, timeZone),
  }
}

export function matchesSearch(e: CalendarEvent, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [e.summary, e.location, e.description].some((f) => f.toLowerCase().includes(q))
}

export function matchesLocation(e: CalendarEvent, location: string): boolean {
  if (!location) return true
  if (location === NO_LOCATION) return !e.location
  return e.location === location
}

/** Half-open `[from, to)` instants covering the days of `range` in `timeZone`. */
export function dayWindow(range: DateRange, timeZone: string): { from: Date; to: Date } {
  return {
    from: startOfDay(range.from, timeZone),
    to: addDays(startOfDay(range.to ?? range.from, timeZone), 1, timeZone),
  }
}

function overlaps(e: CalendarEvent, win: { from: Date; to: Date }): boolean {
  // Zero-length events count when they start inside the window.
  return e.start < win.to && (e.end > win.from || e.start >= win.from)
}

export interface FilterContext {
  timeZone?: string
}

export function filterEvents(events: CalendarEvent[], f: FilterState, ctx: FilterContext = {}): CalendarEvent[] {
  const tz = ctx.timeZone ?? defaultTimeZone()
  const win = f.dateRange ? dayWindow(f.dateRange, tz) : null
  return events
    .filter(
      (e) =>
        matchesSearch(e, f.search) &&
        matchesLocation(e, f.location) &&
        (!win || overlaps(e, win)),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function uniqueLocations(events: CalendarEvent[]): { value: string; label: string }[] {
  const set = new Set(events.map((e) => e.location).filter(Boolean))
  const list = [...set].sort((a, b) => a.localeCompare(b)).map((l) => ({ value: l, label: l }))
  if (events.some((e) => !e.location)) list.push({ value: NO_LOCATION, label: "No location" })
  return list
}
