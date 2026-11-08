import type { CalendarEvent } from "./types"
import { addDays, defaultTimeZone, startOfDay, startOfMonth } from "./time"

export type Timeframe = "upcoming" | "past" | "all"
export type RelativeRange =
  | "all"
  | "today"
  | "week" // today through the next 7 days
  | "month" // today to end of this month
  | "next-month"
  | { withinDays: number }

export interface FilterState {
  search: string
  /** Exact location match; "" = any. Use NO_LOCATION for events without one. */
  location: string
  timeframe: Timeframe
  range: RelativeRange
}

export const NO_LOCATION = "__none__"

export const defaultFilters: FilterState = { search: "", location: "", timeframe: "upcoming", range: "all" }

export function isFiltered(f: FilterState, base: FilterState = defaultFilters): boolean {
  return (
    f.search.trim() !== "" ||
    f.location !== "" ||
    f.timeframe !== base.timeframe ||
    JSON.stringify(f.range) !== JSON.stringify(base.range)
  )
}

/** [from, to) window for a relative range in `timeZone`, or null for "all". */
export function rangeWindow(
  range: RelativeRange,
  now: Date,
  timeZone: string,
): { from: Date; to: Date } | null {
  if (range === "all") return null
  const today = startOfDay(now, timeZone)
  if (range === "today") return { from: today, to: addDays(today, 1, timeZone) }
  if (range === "week") return { from: today, to: addDays(today, 7, timeZone) }
  if (range === "month") return { from: today, to: startOfMonth(now, timeZone, 1) }
  if (range === "next-month") return { from: startOfMonth(now, timeZone, 1), to: startOfMonth(now, timeZone, 2) }
  return { from: today, to: addDays(today, Math.max(1, range.withinDays), timeZone) }
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

/** An event is "past" once it has ended; "upcoming" while it is ongoing or later. */
export function matchesTimeframe(e: CalendarEvent, tf: Timeframe, now: Date): boolean {
  if (tf === "all") return true
  const ended = (e.end > e.start ? e.end : e.start).getTime() <= now.getTime()
  return tf === "past" ? ended : !ended
}

export interface FilterContext {
  now?: Date
  timeZone?: string
}

export function filterEvents(events: CalendarEvent[], f: FilterState, ctx: FilterContext = {}): CalendarEvent[] {
  const now = ctx.now ?? new Date()
  const tz = ctx.timeZone ?? defaultTimeZone()
  const win = rangeWindow(f.range, now, tz)
  const out = events.filter(
    (e) =>
      matchesTimeframe(e, f.timeframe, now) &&
      matchesSearch(e, f.search) &&
      matchesLocation(e, f.location) &&
      (!win || (e.start < win.to && e.end > win.from) || (e.start >= win.from && e.start < win.to)),
  )
  const dir = f.timeframe === "past" ? -1 : 1
  return out.sort((a, b) => dir * (a.start.getTime() - b.start.getTime()))
}

export function uniqueLocations(events: CalendarEvent[]): { value: string; label: string }[] {
  const set = new Set(events.map((e) => e.location).filter(Boolean))
  const list = [...set].sort((a, b) => a.localeCompare(b)).map((l) => ({ value: l, label: l }))
  if (events.some((e) => !e.location)) list.push({ value: NO_LOCATION, label: "No location" })
  return list
}
