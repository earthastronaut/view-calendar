import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  addDays,
  bucketByDay,
  dayKey,
  formatCompactTime,
  formatEventDate,
  formatEventTime,
  formatMonthTitle,
  monthGridWindow,
  startOfDay,
  startOfMonth,
  weekNumber,
  zonedDate,
  zonedParts,
  type WeekStart,
} from "@/lib/calendar-events/time"
import type { CalendarEvent, DateRange } from "@/lib/calendar-events/types"
import { layoutWeek, type WeekBar, type WeekDayLayout } from "@/lib/calendar-events/week-layout"
import { EventCard } from "./event-card"

export interface CalendarViewProps {
  events: CalendarEvent[]
  /** Any instant within the month to show. */
  month: Date
  timeZone: string
  /** Called when keyboard navigation moves focus into another month. */
  onMonthChange: (month: Date) => void
  onSelect: (event: CalendarEvent) => void
  /**
   * Called when a day is tapped, or activated with Enter / Space. Omit it to make activation
   * focus the day's first event instead.
   */
  onDayTap?: (day: Date) => void
  /** Days inside this range are highlighted; events on other days are dimmed. Nothing is hidden. */
  dateRange?: DateRange
  loading?: boolean
  /** First day of the week, 0 = Sunday. Default 0. */
  weekStartsOn?: WeekStart
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
/** Rows a day cell shows: bar lanes plus timed rows, with the last one becoming `+N more`. */
const MAX_ROWS = 3
/** Height of one event row (`h-5`) and of the day-number row (`h-7`), in rem. */
const ROW_REM = 1.25
const DAY_NUMBER_REM = 1.75
/** Week-number column on `md` and up; below it the grid is plain 7 columns. */
const WEEK_ROW_CLASS = "grid grid-cols-7 md:grid-cols-[2rem_repeat(7,minmax(0,1fr))]"

export function CalendarView({
  events,
  month,
  timeZone,
  onMonthChange,
  onSelect,
  onDayTap,
  dateRange,
  loading,
  weekStartsOn = 0,
}: CalendarViewProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  // Set when keyboard navigation moves focus; applied after the target cell has rendered.
  const pendingFocus = useRef<string | null>(null)
  // The roving tab stop. Null means "use the default" (today, or the 1st of the month).
  const [focusKey, setFocusKey] = useState<string | null>(null)

  const grid = monthGridWindow(month, weekStartsOn, timeZone)
  const gridFromMs = grid.from.getTime()
  const gridToMs = grid.to.getTime()
  const byDay = useMemo(
    () => bucketByDay(events, new Date(gridFromMs), new Date(gridToMs), timeZone),
    [events, gridFromMs, gridToMs, timeZone],
  )

  const gridDays = grid.days
  // Stable week arrays, so each row's layout is only recomputed when events or the month change.
  const weeks = useMemo(() => {
    const first = new Date(gridFromMs)
    const cells = Array.from({ length: gridDays }, (_, i) => addDays(first, i, timeZone))
    return Array.from({ length: gridDays / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
  }, [gridFromMs, gridDays, timeZone])
  const cellKeys = weeks.flat().map((d) => dayKey(d, timeZone))
  const todayKey = dayKey(new Date(), timeZone)
  const monthKey = dayKey(startOfMonth(month, timeZone), timeZone).slice(0, 7)
  const defaultKey = cellKeys.includes(todayKey) ? todayKey : `${monthKey}-01`
  const activeKey = focusKey && cellKeys.includes(focusKey) ? focusKey : defaultKey

  const rangeFrom = dateRange ? dayKey(dateRange.from, timeZone) : null
  const rangeTo = dateRange ? dayKey(dateRange.to ?? dateRange.from, timeZone) : null
  const inRange = (key: string) => rangeFrom !== null && rangeTo !== null && key >= rangeFrom && key <= rangeTo

  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(weekStartsOn + i) % 7])
  const title = formatMonthTitle(month, timeZone)

  // Runs after every render: moves focus once keyboard navigation has rendered the target cell.
  useEffect(() => {
    const key = pendingFocus.current
    if (!key) return
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-day="${key}"]`)
    if (!el) return
    pendingFocus.current = null
    el.focus()
  })

  const focusDay = (target: Date) => {
    const key = dayKey(target, timeZone)
    pendingFocus.current = key
    setFocusKey(key)
    if (!cellKeys.includes(key)) onMonthChange(startOfMonth(target, timeZone))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, day: Date) => {
    // Keys pressed on chips or inside the "+N more" popover are not grid navigation.
    if (e.target !== e.currentTarget) return
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      if (onDayTap) onDayTap(startOfDay(day, timeZone))
      else e.currentTarget.querySelector<HTMLButtonElement>("[data-chip]")?.focus()
      return
    }
    const target = shiftedDay(day, e.key, timeZone, weekStartsOn)
    if (!target) return
    e.preventDefault()
    focusDay(target)
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={title}
      className={cn("overflow-hidden rounded-lg border text-sm", loading && "opacity-60")}
    >
      <div role="row" className={cn(WEEK_ROW_CLASS, "border-b")}>
        <div aria-hidden="true" className="hidden md:block" />
        {weekdays.map((w) => (
          <div
            key={w}
            role="columnheader"
            className="px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week, w) => (
        <WeekRow
          key={dayKey(week[0], timeZone)}
          week={week}
          events={events}
          byDay={byDay}
          monthKey={monthKey}
          todayKey={todayKey}
          activeKey={activeKey}
          lastWeek={w === weeks.length - 1}
          weekStartsOn={weekStartsOn}
          timeZone={timeZone}
          inRange={inRange}
          rangeActive={dateRange !== undefined}
          interactive={onDayTap !== undefined}
          onDayTap={onDayTap}
          onSelect={onSelect}
          onFocusKey={setFocusKey}
          onKeyDown={handleKeyDown}
        />
      ))}
    </div>
  )
}

interface WeekRowProps {
  week: Date[]
  events: CalendarEvent[]
  byDay: Map<string, CalendarEvent[]>
  monthKey: string
  todayKey: string
  activeKey: string
  lastWeek: boolean
  weekStartsOn: WeekStart
  timeZone: string
  inRange: (key: string) => boolean
  rangeActive: boolean
  interactive: boolean
  onDayTap?: (day: Date) => void
  onSelect: (event: CalendarEvent) => void
  onFocusKey: (key: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, day: Date) => void
}

function WeekRow({
  week,
  events,
  byDay,
  monthKey,
  todayKey,
  activeKey,
  lastWeek,
  weekStartsOn,
  timeZone,
  inRange,
  rangeActive,
  interactive,
  onDayTap,
  onSelect,
  onFocusKey,
  onKeyDown,
}: WeekRowProps) {
  const layout = useMemo(() => layoutWeek(events, week, timeZone, MAX_ROWS), [events, week, timeZone])
  const keys = week.map((d) => dayKey(d, timeZone))
  const number = weekNumber(week[0], weekStartsOn, timeZone)
  return (
    <div role="row" className={WEEK_ROW_CLASS}>
      <div
        role="rowheader"
        aria-label={`Week ${number}`}
        className={cn("hidden items-start justify-center border-r pt-2 md:flex", !lastWeek && "border-b")}
      >
        <span className="rounded bg-muted px-1 text-[10px] font-medium leading-4 text-muted-foreground">W{number}</span>
      </div>
      {week.map((d, col) => {
        const key = keys[col]
        return (
          <DayCell
            key={key}
            day={d}
            cellKey={key}
            timeZone={timeZone}
            items={byDay.get(key) ?? []}
            layout={layout.days[col]}
            bars={layout.bars.filter((b) => b.startCol === col)}
            barDimmed={(bar) => rangeActive && !keys.slice(bar.startCol, bar.startCol + bar.span).some(inRange)}
            inMonth={key.startsWith(monthKey)}
            isToday={key === todayKey}
            inRange={inRange(key)}
            dimmed={rangeActive && !inRange(key)}
            tabStop={key === activeKey}
            interactive={interactive}
            lastCol={col === week.length - 1}
            lastWeek={lastWeek}
            onDayTap={onDayTap}
            onSelect={onSelect}
            onFocusCell={() => onFocusKey(key)}
            onKeyDown={(e) => onKeyDown(e, d)}
          />
        )
      })}
    </div>
  )
}

interface DayCellProps {
  day: Date
  cellKey: string
  timeZone: string
  /** Every event on this day, for the mobile count and the "+N more" popover. */
  items: CalendarEvent[]
  layout: WeekDayLayout
  /** Bars that start in this cell; they extend over the following cells. */
  bars: WeekBar[]
  barDimmed: (bar: WeekBar) => boolean
  inMonth: boolean
  isToday: boolean
  inRange: boolean
  dimmed: boolean
  tabStop: boolean
  interactive: boolean
  lastCol: boolean
  lastWeek: boolean
  onDayTap?: (day: Date) => void
  onSelect: (event: CalendarEvent) => void
  onFocusCell: () => void
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
}

function DayCell({
  day,
  cellKey,
  timeZone,
  items,
  layout,
  bars,
  barDimmed,
  inMonth,
  isToday,
  inRange,
  dimmed,
  tabStop,
  interactive,
  lastCol,
  lastWeek,
  onDayTap,
  onSelect,
  onFocusCell,
  onKeyDown,
}: DayCellProps) {
  return (
    <div
      role="gridcell"
      data-day={cellKey}
      tabIndex={tabStop ? 0 : -1}
      aria-label={formatEventDate(day, timeZone)}
      aria-selected={inRange || undefined}
      onClick={() => onDayTap?.(startOfDay(day, timeZone))}
      onFocus={onFocusCell}
      onKeyDown={onKeyDown}
      className={cn(
        "relative min-h-16 min-w-0 transition-colors hover:bg-muted/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:h-24",
        !lastCol && "border-r",
        !lastWeek && "border-b",
        inRange && "bg-primary/5",
        interactive && "cursor-pointer",
      )}
    >
      <div className="flex h-7 items-center px-1">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs",
            !inMonth && "text-muted-foreground",
            isToday && "bg-primary font-semibold text-primary-foreground",
          )}
        >
          {zonedParts(day, timeZone).day}
        </span>
      </div>

      {/* Bars and rows on larger screens; a count on mobile, where tapping the day opens the list. */}
      <div className="hidden md:block">
        {bars.map((bar) => (
          <EventBar key={bar.event.id} bar={bar} timeZone={timeZone} dimmed={barDimmed(bar)} onSelect={onSelect} />
        ))}
        <div aria-hidden="true" style={{ height: `${layout.lanes * ROW_REM}rem` }} />
        {layout.timed.map((e) => (
          <TimedRow key={e.id} event={e} day={day} timeZone={timeZone} dimmed={dimmed} onSelect={onSelect} />
        ))}
        {layout.hidden > 0 && (
          <DayMore day={day} items={items} hidden={layout.hidden} timeZone={timeZone} onSelect={onSelect} />
        )}
      </div>
      {items.length > 0 && <span className="block text-center text-xs font-medium text-primary md:hidden">{items.length}</span>}
    </div>
  )
}

/** An all-day or multi-day event, drawn across the day columns it covers within this week. */
function EventBar({
  bar,
  timeZone,
  dimmed,
  onSelect,
}: {
  bar: WeekBar
  timeZone: string
  dimmed: boolean
  onSelect: (event: CalendarEvent) => void
}) {
  const { event, span, lane, continuesBefore, continuesAfter } = bar
  const last = new Date(Math.max(event.start.getTime(), event.end.getTime() - 1))
  const firstLabel = formatEventDate(event.start, timeZone)
  const lastLabel = formatEventDate(last, timeZone)
  const dates = firstLabel === lastLabel ? firstLabel : `${firstLabel} to ${lastLabel}`
  // Timed events show their start time on the first segment, e.g. "7p Retreat".
  const startTime = event.allDay ? null : formatCompactTime(event.start, timeZone)
  const label = event.allDay
    ? `${event.summary}, All day, ${dates}`
    : `${event.summary}, ${formatEventTime(event.start, timeZone)} to ${formatEventTime(event.end, timeZone)}, ${dates}`
  // A clipped side runs to the edge of the row; the other side is inset from the cell border.
  const insetRem = (continuesBefore ? 0 : 0.25) + (continuesAfter ? 0 : 0.25)
  const style: CSSProperties = {
    top: `calc(${DAY_NUMBER_REM + lane * ROW_REM}rem + 1px)`,
    left: continuesBefore ? 0 : "0.25rem",
    width: `calc(${span * 100}% + ${span}px - ${insetRem}rem)`,
  }
  return (
    <button
      type="button"
      data-chip=""
      aria-label={label}
      onClick={(ev) => {
        ev.stopPropagation()
        onSelect(event)
      }}
      style={style}
      className={cn(
        "absolute z-10 h-[1.125rem] truncate bg-primary px-1.5 text-left text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        !continuesBefore && "rounded-l-md",
        !continuesAfter && "rounded-r-md",
        dimmed && "opacity-40",
      )}
    >
      {startTime && !continuesBefore && <span className="mr-1 tabular-nums opacity-80">{startTime}</span>}
      {event.summary}
    </button>
  )
}

/** A timed event as one line: dot, compact start time, bold title. */
function TimedRow({
  event,
  day,
  timeZone,
  dimmed,
  onSelect,
}: {
  event: CalendarEvent
  day: Date
  timeZone: string
  dimmed: boolean
  onSelect: (event: CalendarEvent) => void
}) {
  // A row on a day after the first marks that the event started earlier.
  const continued = dayKey(event.start, timeZone) !== dayKey(day, timeZone)
  const label = `${event.summary}, ${formatEventTime(event.start, timeZone)}, ${formatEventDate(day, timeZone)}${continued ? ", continues" : ""}`
  return (
    <button
      type="button"
      data-chip=""
      aria-label={label}
      onClick={(ev) => {
        ev.stopPropagation()
        onSelect(event)
      }}
      className={cn(
        "flex h-5 w-full items-center gap-1 rounded px-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dimmed && "opacity-40",
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span aria-hidden="true" className="shrink-0 tabular-nums text-muted-foreground">
        {continued ? "↳" : formatCompactTime(event.start, timeZone)}
      </span>
      <span className="truncate font-semibold">{event.summary}</span>
    </button>
  )
}

function DayMore({
  day,
  items,
  hidden,
  timeZone,
  onSelect,
}: {
  day: Date
  items: CalendarEvent[]
  hidden: number
  timeZone: string
  onSelect: (event: CalendarEvent) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex h-5 w-full items-center px-1.5 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          +{hidden} more
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium">{formatEventDate(day, timeZone)}</h3>
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {items.map((e) => (
            <li key={e.id}>
              <EventCard
                event={e}
                timeZone={timeZone}
                onSelect={(picked) => {
                  setOpen(false)
                  onSelect(picked)
                }}
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/** Day reached from `day` by an arrow, Home/End, or PageUp/PageDown key; null for other keys. */
function shiftedDay(day: Date, key: string, timeZone: string, weekStartsOn: WeekStart): Date | null {
  const weekOffset = (zonedParts(day, timeZone).weekday - weekStartsOn + 7) % 7
  switch (key) {
    case "ArrowLeft":
      return addDays(day, -1, timeZone)
    case "ArrowRight":
      return addDays(day, 1, timeZone)
    case "ArrowUp":
      return addDays(day, -7, timeZone)
    case "ArrowDown":
      return addDays(day, 7, timeZone)
    case "Home":
      return addDays(day, -weekOffset, timeZone)
    case "End":
      return addDays(day, 6 - weekOffset, timeZone)
    case "PageUp":
      return shiftMonth(day, -1, timeZone)
    case "PageDown":
      return shiftMonth(day, 1, timeZone)
    default:
      return null
  }
}

/** Same day-of-month in another month, clamped to that month's length. */
function shiftMonth(day: Date, months: number, timeZone: string): Date {
  const p = zonedParts(day, timeZone)
  const target = new Date(Date.UTC(p.year, p.month - 1 + months, 1))
  const year = target.getUTCFullYear()
  const month = target.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return zonedDate(year, month, Math.min(p.day, lastDay), timeZone)
}
