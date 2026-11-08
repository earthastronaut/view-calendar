import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatMonthTitle, startOfMonth } from "@/lib/calendar-events/time"

export type CalendarEventsView = "list" | "month"

const VIEWS: { id: CalendarEventsView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "list", label: "List" },
]

export interface CalendarToolbarProps {
  /** Any instant within the visible month. */
  month: Date
  timeZone: string
  onMonthChange: (month: Date) => void
  view: CalendarEventsView
  onViewChange: (view: CalendarEventsView) => void
  /**
   * Replaces the month title and hides the month controls, for a list that shows a chosen
   * date range instead of a month.
   */
  rangeLabel?: string
}

/** One row shared by both views: Today, previous / next, the title, and the Month | List switch. */
export function CalendarToolbar({ month, timeZone, onMonthChange, view, onViewChange, rangeLabel }: CalendarToolbarProps) {
  const showNav = !(view === "list" && rangeLabel)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {showNav && (
          <>
            <Button variant="outline" size="sm" onClick={() => onMonthChange(new Date())}>
              Today
            </Button>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => onMonthChange(startOfMonth(month, timeZone, -1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="Next month" onClick={() => onMonthChange(startOfMonth(month, timeZone, 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        )}
        <h2 className="text-lg font-semibold" aria-live="polite">
          {view === "list" && rangeLabel ? rangeLabel : formatMonthTitle(month, timeZone)}
        </h2>
      </div>
      <div role="tablist" aria-label="View" className="inline-flex rounded-md border p-0.5">
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            variant={view === v.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onViewChange(v.id)}
          >
            {v.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
