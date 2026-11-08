import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { isFiltered, type FilterState } from "@/lib/calendar-events/filters"
import type { CalendarEvent } from "@/lib/calendar-events/types"
import { DateFilter } from "./date-filter"

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export interface FiltersBarProps {
  value: FilterState
  onChange: (next: FilterState) => void
  defaults: FilterState
  locations: { value: string; label: string }[]
  /** Visible month, shared with the views. */
  month: Date
  onMonthChange: (month: Date) => void
  events: CalendarEvent[]
  timeZone: string
  className?: string
}

export function FiltersBar({
  value,
  onChange,
  defaults,
  locations,
  month,
  onMonthChange,
  events,
  timeZone,
  className,
}: FiltersBarProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch })
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} role="search">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          type="search"
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search events…"
          aria-label="Search events"
          className="pl-8"
        />
      </div>
      <DateFilter
        value={value.dateRange}
        onChange={(dateRange) => set({ dateRange })}
        month={month}
        onMonthChange={onMonthChange}
        events={events}
        timeZone={timeZone}
      />
      {locations.length > 0 && (
        <select className={selectClass} aria-label="Location" value={value.location} onChange={(e) => set({ location: e.target.value })}>
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      )}
      {isFiltered(value, defaults) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(defaults)}>
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  )
}
