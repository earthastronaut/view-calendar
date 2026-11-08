import * as React from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { isFiltered, type FilterState, type RelativeRange, type Timeframe } from "@/lib/calendar-events/filters"

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const RANGES: { value: string; label: string; range: RelativeRange }[] = [
  { value: "all", label: "Any date", range: "all" },
  { value: "today", label: "Today", range: "today" },
  { value: "week", label: "Next 7 days", range: "week" },
  { value: "month", label: "This month", range: "month" },
  { value: "next-month", label: "Next month", range: "next-month" },
  { value: "30", label: "Next 30 days", range: { withinDays: 30 } },
  { value: "90", label: "Next 90 days", range: { withinDays: 90 } },
]
const rangeValue = (r: RelativeRange) => (typeof r === "string" ? r : String(r.withinDays))

export interface FiltersBarProps {
  value: FilterState
  onChange: (next: FilterState) => void
  defaults: FilterState
  locations: { value: string; label: string }[]
  /** Hide timeframe/date-range controls (the month grid has its own navigation). */
  showTimeControls?: boolean
  className?: string
}

export function FiltersBar({ value, onChange, defaults, locations, showTimeControls = true, className }: FiltersBarProps) {
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
      {showTimeControls && (
        <>
          <select
            className={selectClass}
            aria-label="Past or upcoming"
            value={value.timeframe}
            onChange={(e) => {
              const timeframe = e.target.value as Timeframe
              // Relative "next …" ranges only make sense for the future.
              set({ timeframe, range: timeframe === "upcoming" ? value.range : "all" })
            }}
          >
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All</option>
          </select>
          {value.timeframe !== "past" && (
            <select
              className={selectClass}
              aria-label="Date range"
              value={rangeValue(value.range)}
              onChange={(e) => set({ range: RANGES.find((r) => r.value === e.target.value)!.range })}
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </>
      )}
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
