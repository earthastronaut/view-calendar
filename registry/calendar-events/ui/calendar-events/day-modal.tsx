import { useMemo, type ReactNode } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { addDays, bucketByDay, dayKey, formatEventDate } from "@/lib/calendar-events/time"
import type { CalendarEvent } from "@/lib/calendar-events/types"
import { EventCard } from "./event-card"

/** What `renderDay` receives, so a custom day view can still open events or close the modal. */
export interface DayModalHelpers {
  /** Close the day modal and open the event's details. */
  select: (event: CalendarEvent) => void
  close: () => void
}

export type RenderDay = (day: Date, events: CalendarEvent[], helpers: DayModalHelpers) => ReactNode

export interface DayModalProps {
  /** The day to show, or null when closed. */
  day: Date | null
  events: CalendarEvent[]
  timeZone: string
  onSelect: (event: CalendarEvent) => void
  onClose: () => void
  /** Replace the default list of event cards. */
  renderDay?: RenderDay
}

export function DayModal({ day, events, timeZone, onSelect, onClose, renderDay }: DayModalProps) {
  return (
    <Dialog open={!!day} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {day && (
          <DayDetails
            day={day}
            events={events}
            timeZone={timeZone}
            onSelect={onSelect}
            onClose={onClose}
            renderDay={renderDay}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DayDetails({
  day,
  events,
  timeZone,
  onSelect,
  onClose,
  renderDay,
}: Omit<DayModalProps, "day"> & { day: Date }) {
  const dayEvents = useMemo(() => {
    const next = addDays(day, 1, timeZone)
    return bucketByDay(events, day, next, timeZone).get(dayKey(day, timeZone)) ?? []
  }, [events, day, timeZone])

  const select = (event: CalendarEvent) => {
    onClose()
    onSelect(event)
  }
  const count = dayEvents.length

  return (
    <>
      <DialogHeader>
        <DialogTitle>{formatEventDate(day, timeZone)}</DialogTitle>
        <DialogDescription>{count === 0 ? "No events" : count === 1 ? "1 event" : `${count} events`}</DialogDescription>
      </DialogHeader>
      {renderDay ? (
        renderDay(day, dayEvents, { select, close: onClose })
      ) : count > 0 ? (
        <ul className="space-y-2">
          {dayEvents.map((e) => (
            <li key={e.id}>
              <EventCard event={e} timeZone={timeZone} onSelect={select} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
