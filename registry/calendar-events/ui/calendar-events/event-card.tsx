import * as React from "react"
import { MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { createMapsUrl } from "@/lib/calendar-events/links"
import { formatEventTime, zonedParts } from "@/lib/calendar-events/time"
import type { CalendarEvent } from "@/lib/calendar-events/types"

export interface EventCardProps {
  event: CalendarEvent
  timeZone: string
  onSelect: (event: CalendarEvent) => void
  className?: string
}

export function EventCard({ event, timeZone, onSelect, className }: EventCardProps) {
  const p = zonedParts(event.start, timeZone)
  const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "short" }).format(event.start)
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(event.start)
  const maps = createMapsUrl(event.location)
  const open = () => onSelect(event)

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${event.summary}, view details`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
      className={cn(
        "flex cursor-pointer gap-4 rounded-lg border bg-card p-4 text-card-foreground transition-colors",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md bg-muted py-1 text-center">
        <span className="text-xs font-medium uppercase text-muted-foreground">{month}</span>
        <span className="text-2xl font-semibold leading-none">{p.day}</span>
        <span className="text-xs text-muted-foreground">{weekday}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">{event.summary}</h3>
        <p className="text-sm text-muted-foreground">
          {event.allDay ? "All day" : `${formatEventTime(event.start, timeZone)} – ${formatEventTime(event.end, timeZone)}`}
        </p>
        {event.location &&
          (maps ? (
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{event.location}</span>
            </a>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{event.location}</span>
            </p>
          ))}
      </div>
    </div>
  )
}
