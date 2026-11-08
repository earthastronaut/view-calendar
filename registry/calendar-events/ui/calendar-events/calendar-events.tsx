import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCalendarEvents, type UseCalendarEventsOptions } from "@/hooks/use-calendar-events"
import { useMediaQuery } from "@/hooks/use-media-query"
import { defaultFilters, dayWindow, filterEvents, isFiltered, monthRange, uniqueLocations, type FilterState } from "@/lib/calendar-events/filters"
import { fetchGoogleEvent } from "@/lib/calendar-events/google-api"
import { DAY_PARAM, SHARE_PARAM, shareUrl as defaultShareUrl } from "@/lib/calendar-events/links"
import { dayKey, defaultTimeZone, fetchWindow, formatDayRange, startOfDay, type WeekStart } from "@/lib/calendar-events/time"
import type { CalendarEvent, MultiDayListMode } from "@/lib/calendar-events/types"
import { CalendarView } from "./calendar-view"
import { DayModal, type RenderDay } from "./day-modal"
import { EventModal } from "./event-modal"
import { FiltersBar } from "./filters-bar"
import { LinksBar } from "./links-bar"
import { ListView } from "./list-view"
import { CalendarToolbar, type CalendarEventsView } from "./toolbar"

export type { CalendarEventsView, RenderDay }

/** Tailwind's `md` breakpoint: the month grid is the default from here up, the list below. */
const DESKTOP_QUERY = "(min-width: 768px)"

export interface CalendarEventsProps extends UseCalendarEventsOptions {
  /** Controlled / uncontrolled view. */
  view?: CalendarEventsView
  /** Initial view. Default: the month grid at `md` and up, the list below. */
  defaultView?: CalendarEventsView
  onViewChange?: (view: CalendarEventsView) => void
  /** Controlled / uncontrolled filters. */
  filters?: FilterState
  defaultFilters?: Partial<FilterState>
  onFiltersChange?: (filters: FilterState) => void
  /** Build the share link for an event. Defaults to the current URL plus `?event=<id>`. */
  getShareUrl?: (event: CalendarEvent) => string
  /** Open the modal from `?event=<id>` and keep the param in sync. Default true. */
  syncUrl?: boolean
  showLinks?: boolean
  showFilters?: boolean
  /** First day of the week in the month grid, 0 = Sunday. Default 0. */
  weekStartsOn?: WeekStart
  /**
   * How the list shows multi-day events: `"each"` (default) repeats them under every day they
   * cover; `"start"` shows one entry under the start day with its start and end. The month
   * grid is unaffected.
   */
  multiDayList?: MultiDayListMode
  /**
   * Month view: open a modal listing the day's events when the day itself is clicked (not one
   * of its events). Defaults to true when `renderDay` is passed, otherwise false. On small
   * screens the modal replaces the tap-to-list behaviour.
   */
  dayModal?: boolean
  /**
   * Replace the day modal's default list of event cards. Receives the day, its events and
   * `{ select, close }`. Passing it turns `dayModal` on unless `dayModal={false}`.
   */
  renderDay?: RenderDay
  /** Replace the default list card. Call `select()` to open the modal. */
  renderEvent?: (event: CalendarEvent, select: () => void) => ReactNode
  /** Replace the plain-text description in the modal, e.g. with a markdown renderer. */
  renderDescription?: (event: CalendarEvent) => ReactNode
  emptyState?: ReactNode
  className?: string
}

export function CalendarEvents(props: CalendarEventsProps) {
  const {
    view: viewProp,
    defaultView,
    onViewChange,
    filters: filtersProp,
    defaultFilters: defaultFiltersProp,
    onFiltersChange,
    getShareUrl,
    syncUrl = true,
    showLinks = true,
    showFilters = true,
    weekStartsOn = 0,
    multiDayList = "each",
    dayModal,
    renderDay,
    renderEvent,
    renderDescription,
    emptyState,
    className,
    ...source
  } = props
  const timeZone = source.timeZone ?? defaultTimeZone()
  const { calendarId, apiKey, baseUrl, fetcher } = source
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  // Until the user picks a view, the default follows the screen size.
  const [viewState, setViewState] = useState<CalendarEventsView | null>(null)
  const view = viewProp ?? viewState ?? defaultView ?? (isDesktop ? "month" : "list")
  const setView = (v: CalendarEventsView) => {
    setViewState(v)
    onViewChange?.(v)
  }

  const baseFilters = useMemo<FilterState>(() => ({ ...defaultFilters, ...defaultFiltersProp }), [defaultFiltersProp])
  const [filtersState, setFiltersState] = useState<FilterState>(baseFilters)
  const filters = filtersProp ?? filtersState
  const setFilters = (f: FilterState) => {
    setFiltersState(f)
    onFiltersChange?.(f)
  }

  const data = useCalendarEvents(source)
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [openDay, setOpenDay] = useState<Date | null>(null)
  const dayModalEnabled = dayModal ?? renderDay !== undefined

  const changeFilters = (f: FilterState) => {
    setFilters(f)
    // A chosen range may reach outside the loaded window; load the grid plus the range.
    if (f.dateRange) {
      const win = fetchWindow(month, f.dateRange, weekStartsOn, timeZone)
      void data.ensureRange(win.from, win.to)
    }
  }
  const filtered = isFiltered(filters, baseFilters)
  const clearFilters = () => changeFilters(baseFilters)

  // List shows the visible month unless a date range is chosen.
  const listRange = useMemo(
    () => filters.dateRange ?? monthRange(month, timeZone),
    [filters.dateRange, month, timeZone],
  )
  const listDays = dayWindow(listRange, timeZone)
  const listEvents = useMemo(
    () => filterEvents(data.events, { ...filters, dateRange: listRange }, { timeZone }),
    [data.events, filters, listRange, timeZone],
  )
  // Calendar view keeps search + location; it does not hide days outside the range.
  const monthEvents = useMemo(
    () => filterEvents(data.events, { ...filters, dateRange: undefined }, { timeZone }),
    [data.events, filters, timeZone],
  )
  const locations = useMemo(() => uniqueLocations(data.events), [data.events])

  const changeMonth = (m: Date) => {
    setMonth(m)
    const win = fetchWindow(m, undefined, weekStartsOn, timeZone)
    void data.ensureRange(win.from, win.to)
  }

  // On mobile, tapping a day in the grid shows that day in the list.
  const jumpToDay = (day: Date) => {
    changeFilters({ ...filters, dateRange: { from: startOfDay(day, timeZone) } })
    setView("list")
  }

  // Selecting an event also mirrors it to the URL so the page can be shared.
  const setUrlParam = useCallback(
    (name: string, value: string | null) => {
      if (!syncUrl || typeof window === "undefined") return
      const u = new URL(window.location.href)
      if (value) u.searchParams.set(name, value)
      else u.searchParams.delete(name)
      window.history.replaceState(window.history.state, "", u)
    },
    [syncUrl],
  )
  const select = useCallback(
    (e: CalendarEvent | null) => {
      setSelected(e)
      setUrlParam(SHARE_PARAM, e ? e.id : null)
    },
    [setUrlParam],
  )

  // Opening a day mirrors it to the URL as `?day=YYYY-MM-DD`; closing removes it.
  const changeDay = (day: Date | null) => {
    setOpenDay(day)
    setUrlParam(DAY_PARAM, day ? dayKey(day, timeZone) : null)
  }

  // Deep link: open `?event=<id>` once, from loaded data or a direct lookup.
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (!syncUrl || deepLinkDone.current || data.status === "idle" || data.status === "loading") return
    deepLinkDone.current = true
    const id = new URLSearchParams(window.location.search).get(SHARE_PARAM)
    if (!id) return
    const found = data.events.find((e) => e.id === id)
    if (found) return setSelected(found)
    if (apiKey) {
      fetchGoogleEvent({ calendarId, apiKey, baseUrl, fetcher, timeZone, eventId: id })
        .then((e) => e && setSelected(e))
        .catch(() => {})
    }
  }, [syncUrl, data.status, data.events, apiKey, calendarId, baseUrl, fetcher, timeZone])

  const dayTapHandler = dayModalEnabled ? changeDay : isDesktop ? undefined : jumpToDay

  const shareUrl = getShareUrl ?? ((e: CalendarEvent) => defaultShareUrl(e))

  return (
    <div className={cn("space-y-4", className)} data-slot="calendar-events">
      <CalendarToolbar
        month={month}
        timeZone={timeZone}
        onMonthChange={changeMonth}
        view={view}
        onViewChange={setView}
        rangeLabel={filters.dateRange ? formatDayRange(filters.dateRange, timeZone) : undefined}
      />

      {showFilters && (
        <FiltersBar
          value={filters}
          onChange={changeFilters}
          defaults={baseFilters}
          locations={locations}
          month={month}
          onMonthChange={changeMonth}
          events={data.events}
          timeZone={timeZone}
        />
      )}

      {data.status === "error" && data.events.length === 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">
          <p className="font-medium">Couldn't load events.</p>
          <p className="text-muted-foreground">{data.error?.message}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={data.reload}>
            Try again
          </Button>
        </div>
      ) : data.status === "loading" && data.events.length === 0 ? (
        <LoadingSkeleton />
      ) : view === "list" ? (
        <ListView
          events={listEvents}
          days={listDays}
          timeZone={timeZone}
          multiDay={multiDayList}
          onSelect={select}
          renderEvent={renderEvent}
          emptyState={emptyState}
          filtered={filtered}
          onClearFilters={clearFilters}
        />
      ) : (
        <CalendarView
          events={monthEvents}
          month={month}
          timeZone={timeZone}
          weekStartsOn={weekStartsOn}
          onMonthChange={changeMonth}
          onSelect={select}
          onDayTap={dayTapHandler}
          dateRange={filters.dateRange}
          loading={data.status === "loading"}
        />
      )}

      {showLinks && <LinksBar calendarId={calendarId} timeZone={timeZone} />}

      {data.source === "ical" && !apiKey ? null : data.source === "cache" && (
        <p className="text-xs text-muted-foreground">Showing saved events; couldn't reach the calendar.</p>
      )}

      <DayModal
        day={openDay}
        events={monthEvents}
        timeZone={timeZone}
        onSelect={select}
        onClose={() => changeDay(null)}
        renderDay={renderDay}
      />

      <EventModal
        event={selected}
        timeZone={timeZone}
        shareUrl={shareUrl}
        onClose={() => select(null)}
        renderDescription={renderDescription}
      />
    </div>
  )
}

/** First-load placeholder shaped like list cards. Announced once via the status text. */
function LoadingSkeleton() {
  return (
    <div role="status" className="space-y-2">
      <span className="sr-only">Loading events…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="flex gap-4 rounded-lg border p-4">
          <div className="size-14 shrink-0 animate-pulse rounded-md bg-muted" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
