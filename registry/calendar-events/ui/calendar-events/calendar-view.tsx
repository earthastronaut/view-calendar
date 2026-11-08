import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { addDays, dayKey, startOfMonth, zonedParts } from "@/lib/calendar-events/time"
import type { CalendarEvent } from "@/lib/calendar-events/types"
import { EventCard } from "./event-card"

export interface CalendarViewProps {
  events: CalendarEvent[]
  /** Any instant within the month to show. */
  month: Date
  timeZone: string
  onMonthChange: (month: Date) => void
  onSelect: (event: CalendarEvent) => void
  loading?: boolean
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function CalendarView({ events, month, timeZone, onMonthChange, onSelect, loading }: CalendarViewProps) {
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null)
  const first = startOfMonth(month, timeZone)
  const next = startOfMonth(month, timeZone, 1)
  const lead = zonedParts(first, timeZone).weekday
  const gridStart = addDays(first, -lead, timeZone)
  const todayKey = dayKey(new Date(), timeZone)
  const monthKey = dayKey(first, timeZone).slice(0, 7)

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      // Multi-day events appear on each day they cover (end is exclusive for all-day).
      const last = new Date(Math.max(e.start.getTime(), e.end.getTime() - 1))
      let d = e.start
      for (let i = 0; i < 42; i++) {
        const k = dayKey(d, timeZone)
        if (!map.has(k)) map.set(k, [])
        map.get(k)!.push(e)
        if (k >= dayKey(last, timeZone)) break
        d = addDays(d, 1, timeZone)
      }
    }
    return map
  }, [events, timeZone])

  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i, timeZone)
    if (i >= 35 && d >= next) break
    cells.push(d)
  }

  const title = new Intl.DateTimeFormat("en-US", { timeZone, month: "long", year: "numeric" }).format(first)
  const selectedEvents = selectedDay ? byDay.get(selectedDay) ?? [] : []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" aria-live="polite">
          {title}
        </h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => onMonthChange(startOfMonth(first, timeZone, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onMonthChange(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => onMonthChange(next)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className={cn("grid grid-cols-7 overflow-hidden rounded-lg border text-sm", loading && "opacity-60")} role="grid" aria-label={title}>
        {WEEKDAYS.map((w) => (
          <div key={w} role="columnheader" className="border-b bg-muted/50 px-2 py-1 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((d) => {
          const key = dayKey(d, timeZone)
          const items = byDay.get(key) ?? []
          const inMonth = key.startsWith(monthKey)
          return (
            <div
              key={key}
              role="gridcell"
              aria-selected={selectedDay === key}
              onClick={() => items.length && setSelectedDay(selectedDay === key ? null : key)}
              className={cn(
                "min-h-20 border-b border-r p-1 last:border-r-0 sm:min-h-24",
                !inMonth && "bg-muted/30 text-muted-foreground",
                items.length > 0 && "cursor-pointer",
                selectedDay === key && "ring-2 ring-inset ring-ring",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-xs",
                  key === todayKey && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {zonedParts(d, timeZone).day}
              </span>
              {/* Chips on larger screens; count dot on mobile. */}
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {items.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onSelect(e)
                    }}
                    className="block w-full truncate rounded bg-primary/10 px-1 py-0.5 text-left text-xs hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {e.summary}
                  </button>
                ))}
                {items.length > 3 && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setSelectedDay(key)
                    }}
                    className="px-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    +{items.length - 3} more
                  </button>
                )}
              </div>
              {items.length > 0 && (
                <span className="mt-1 block text-center text-xs font-medium text-primary sm:hidden">{items.length}</span>
              )}
            </div>
          )
        })}
      </div>

      {selectedDay && selectedEvents.length > 0 && (
        <div className="space-y-2" aria-label="Events on selected day">
          {selectedEvents.map((e) => (
            <EventCard key={e.id} event={e} timeZone={timeZone} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
