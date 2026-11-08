import { useMemo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { addDays, bucketByDay, bucketByStartDay, dayKey, formatEventDate, startOfDay } from "@/lib/calendar-events/time"
import type { CalendarEvent, MultiDayListMode } from "@/lib/calendar-events/types"
import { EventCard } from "./event-card"

export interface ListViewProps {
  events: CalendarEvent[]
  /** Half-open `[from, to)` instants of the days to list. */
  days: { from: Date; to: Date }
  timeZone: string
  /**
   * `"each"` (default) repeats a multi-day event under every day it covers. `"start"` lists it
   * once under its start day. Either way the card shows its start and end dates. In `"start"` mode an event
   * that began before `days.from` is not listed; it belongs to the period it started in.
   */
  multiDay?: MultiDayListMode
  onSelect: (event: CalendarEvent) => void
  renderEvent?: (event: CalendarEvent, select: () => void) => ReactNode
  emptyState?: ReactNode
  /** True when search, location or the date range narrows the list. Chooses the empty-state wording. */
  filtered?: boolean
  onClearFilters?: () => void
}

interface DayGroup {
  key: string
  date: Date
  items: CalendarEvent[]
}

/** Every day in `[from, to)` that has at least one event, in order. */
function dayGroups(
  events: CalendarEvent[],
  from: Date,
  to: Date,
  timeZone: string,
  multiDay: MultiDayListMode,
): DayGroup[] {
  const byDay = multiDay === "start" ? bucketByStartDay(events, from, to, timeZone) : bucketByDay(events, from, to, timeZone)
  const groups: DayGroup[] = []
  for (let cursor = startOfDay(from, timeZone); cursor < to; cursor = addDays(cursor, 1, timeZone)) {
    const key = dayKey(cursor, timeZone)
    const items = byDay.get(key)
    if (items) groups.push({ key, date: cursor, items })
  }
  return groups
}

export function ListView({
  events,
  days,
  timeZone,
  multiDay = "each",
  onSelect,
  renderEvent,
  emptyState,
  filtered = false,
  onClearFilters,
}: ListViewProps) {
  const fromMs = days.from.getTime()
  const toMs = days.to.getTime()
  const groups = useMemo(
    () => dayGroups(events, new Date(fromMs), new Date(toMs), timeZone, multiDay),
    [events, fromMs, toMs, timeZone, multiDay],
  )

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <ListEmptyState emptyState={emptyState} filtered={filtered} onClearFilters={onClearFilters} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <DayGroupSection
              key={g.key}
              date={g.date}
              items={g.items}
              timeZone={timeZone}
              onSelect={onSelect}
              renderEvent={renderEvent}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ListEmptyState({
  emptyState,
  filtered,
  onClearFilters,
}: {
  emptyState?: ReactNode
  filtered: boolean
  onClearFilters?: () => void
}) {
  if (emptyState) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyState}</div>
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      <p>{filtered ? "No events match your filters." : "No events in this period."}</p>
      {filtered && onClearFilters && (
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

function DayGroupSection({
  date,
  items,
  timeZone,
  onSelect,
  renderEvent,
}: {
  date: Date
  items: CalendarEvent[]
  timeZone: string
  onSelect: (event: CalendarEvent) => void
  renderEvent?: (event: CalendarEvent, select: () => void) => ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="sticky top-0 z-10 bg-background/95 py-1 text-sm font-medium text-muted-foreground backdrop-blur">
        {formatEventDate(date, timeZone)}
      </h3>
      <ul className="space-y-2">
        {items.map((e) => (
          <li key={e.id}>
            {renderEvent ? (
              renderEvent(e, () => onSelect(e))
            ) : (
              <EventCard event={e} timeZone={timeZone} showSpan onSelect={onSelect} />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
