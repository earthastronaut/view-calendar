import * as React from "react"
import { Button } from "@/components/ui/button"
import { dayKey, formatEventDate } from "@/lib/calendar-events/time"
import type { CalendarEvent } from "@/lib/calendar-events/types"
import { EventCard } from "./event-card"

export interface ListViewProps {
  events: CalendarEvent[]
  timeZone: string
  onSelect: (event: CalendarEvent) => void
  renderEvent?: (event: CalendarEvent, select: () => void) => React.ReactNode
  emptyState?: React.ReactNode
  /** Show a "load earlier events" button (used for the past timeframe). */
  onLoadMore?: () => void
  loadingMore?: boolean
}

export function ListView({ events, timeZone, onSelect, renderEvent, emptyState, onLoadMore, loadingMore }: ListViewProps) {
  if (!events.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyState ?? "No events match your filters."}
        {onLoadMore && (
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load earlier events"}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Group by day so the heading shows once for multiple events.
  const groups: { key: string; date: Date; items: CalendarEvent[] }[] = []
  for (const e of events) {
    const key = dayKey(e.start, timeZone)
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(e)
    else groups.push({ key, date: e.start, items: [e] })
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key} aria-label={formatEventDate(g.date, timeZone)} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{formatEventDate(g.date, timeZone)}</h2>
          <ul className="space-y-2">
            {g.items.map((e) => (
              <li key={e.id}>
                {renderEvent ? (
                  renderEvent(e, () => onSelect(e))
                ) : (
                  <EventCard event={e} timeZone={timeZone} onSelect={onSelect} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {onLoadMore && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load earlier events"}
          </Button>
        </div>
      )}
    </div>
  )
}
