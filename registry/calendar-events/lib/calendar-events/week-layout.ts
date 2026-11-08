import { addDays, bucketByDay, dayKey, isMultiDay } from "./time"
import type { CalendarEvent } from "./types"

export interface WeekBar {
  event: CalendarEvent
  /** 0-based column of the first day the bar covers within the week. */
  startCol: number
  /** Number of day columns the bar covers within the week. */
  span: number
  /** 0-based row of the bar, counted from the top of the cell. */
  lane: number
  /** The event started before this week, so the left end is clipped. */
  continuesBefore: boolean
  /** The event runs past this week, so the right end is clipped. */
  continuesAfter: boolean
}

export interface WeekDayLayout {
  /** Timed events that fit under the bars; the rest are counted in `hidden`. */
  timed: CalendarEvent[]
  /** Rows reserved at the top of the cell for bars (including gaps under other lanes). */
  lanes: number
  /** Events of the day that are not shown, so the last row reads `+{hidden} more`. */
  hidden: number
}

export interface WeekLayout {
  /** Bar events (all-day or multi-day) that are shown, clipped to the week. */
  bars: WeekBar[]
  /** One entry per day of the week, in order. */
  days: WeekDayLayout[]
}

/**
 * Lay out one week row of a month grid. All-day events and timed events that cross midnight
 * become bars that span the day columns they cover; other timed events stay in their day. A cell shows at most `maxRows` rows (bar lanes
 * plus timed rows). When a day has more, its last row becomes `+N more`, where N counts every
 * event of the day that is not shown, bars included. Bars are only shown when their lane is
 * visible on every day they cover, so a bar never has a gap in the middle.
 */
export function layoutWeek(
  events: CalendarEvent[],
  weekDays: Date[],
  timeZone: string,
  maxRows: number,
): WeekLayout {
  const rows = Math.max(1, Math.floor(maxRows))
  const keys = weekDays.map((d) => dayKey(d, timeZone))
  if (weekDays.length === 0) return { bars: [], days: [] }
  const from = weekDays[0]
  const to = addDays(weekDays[weekDays.length - 1], 1, timeZone)
  const byDay = bucketByDay(events, from, to, timeZone)

  const allBars = assignLanes(collectBars(byDay, keys, timeZone))
  const timedByDay = keys.map((k) => (byDay.get(k) ?? []).filter((e) => !isBar(e, timeZone)))

  // Rows each day needs if everything were shown.
  const needed = keys.map((_, col) => {
    const covering = allBars.filter((b) => covers(b, col))
    const reserved = covering.length === 0 ? 0 : Math.max(...covering.map((b) => b.lane)) + 1
    return reserved + timedByDay[col].length
  })
  const overflow = needed.map((n) => n > rows)
  // A bar needs its lane to be a content row (not the "+N more" row) on every day it covers.
  const shown = (b: WeekBar) => {
    for (let col = b.startCol; col < b.startCol + b.span; col++) {
      if (b.lane >= (overflow[col] ? rows - 1 : rows)) return false
    }
    return true
  }
  const bars = allBars.filter(shown)

  const days = keys.map((_, col): WeekDayLayout => {
    const hiddenBars = allBars.filter((b) => covers(b, col) && !shown(b)).length
    const shownCovering = bars.filter((b) => covers(b, col))
    const lanes = shownCovering.length === 0 ? 0 : Math.max(...shownCovering.map((b) => b.lane)) + 1
    const capacity = (overflow[col] ? rows - 1 : rows) - lanes
    const timed = timedByDay[col].slice(0, Math.max(0, capacity))
    return { timed, lanes, hidden: hiddenBars + timedByDay[col].length - timed.length }
  })

  return { bars, days }
}

/** All-day events and timed events spanning several days are drawn as bars. */
function isBar(event: CalendarEvent, timeZone: string): boolean {
  return event.allDay || isMultiDay(event, timeZone)
}

function covers(bar: WeekBar, col: number): boolean {
  return col >= bar.startCol && col < bar.startCol + bar.span
}

/** One bar per bar event, from the days it appears under in the (already clipped) buckets. */
function collectBars(byDay: Map<string, CalendarEvent[]>, keys: string[], timeZone: string): Omit<WeekBar, "lane">[] {
  const bars = new Map<CalendarEvent, Omit<WeekBar, "lane">>()
  keys.forEach((key, col) => {
    for (const event of byDay.get(key) ?? []) {
      if (!isBar(event, timeZone)) continue
      const bar = bars.get(event)
      if (bar) {
        bar.span = col - bar.startCol + 1
        continue
      }
      const firstKey = dayKey(event.start, timeZone)
      const lastKey = dayKey(new Date(Math.max(event.start.getTime(), event.end.getTime() - 1)), timeZone)
      bars.set(event, {
        event,
        startCol: col,
        span: 1,
        continuesBefore: firstKey < keys[0],
        continuesAfter: lastKey > keys[keys.length - 1],
      })
    }
  })
  return [...bars.values()]
}

/** Greedy lanes: earliest start first, then longest, so overlapping bars stack. */
function assignLanes(bars: Omit<WeekBar, "lane">[]): WeekBar[] {
  const sorted = [...bars].sort(
    (a, b) =>
      a.startCol - b.startCol ||
      b.span - a.span ||
      a.event.start.getTime() - b.event.start.getTime() ||
      a.event.summary.localeCompare(b.event.summary),
  )
  const laneEnds: number[] = [] // last column occupied in each lane
  return sorted.map((bar) => {
    let lane = laneEnds.findIndex((end) => end < bar.startCol)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = bar.startCol + bar.span - 1
    return { ...bar, lane }
  })
}
