import * as React from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { isFiltered, type FilterState, type RelativeRange, type Timeframe } from "@/lib/calendar-events/filters"

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

interface RangeOption {
  value: string
  label: string
  range: RelativeRange
  /** Timeframes in which this quick select is offered. */
  timeframes: Timeframe[]
}

const RANGES: RangeOption[] = [
  { value: "all", label: "Any date", range: "all", timeframes: ["upcoming", "past", "all"] },
  { value: "today", label: "Today", range: "today", timeframes: ["upcoming", "past", "all"] },
  { value: "last-7-days", label: "Last 7 days", range: "last-7-days", timeframes: ["past", "all"] },
  // "All" already offers the full-month "This month" below, so this one is Past-only.
  { value: "month-to-date", label: "This month", range: "month-to-date", timeframes: ["past"] },
  { value: "last-month", label: "Last month", range: "last-month", timeframes: ["past", "all"] },
  { value: "past-30", label: "Last 30 days", range: { pastDays: 30 }, timeframes: ["past", "all"] },
  { value: "past-90", label: "Last 90 days", range: { pastDays: 90 }, timeframes: ["past", "all"] },
  { value: "week", label: "Next 7 days", range: "week", timeframes: ["upcoming", "all"] },
  { value: "month", label: "This month", range: "month", timeframes: ["upcoming", "all"] },
  { value: "next-month", label: "Next month", range: "next-month", timeframes: ["upcoming", "all"] },
  { value: "30", label: "Next 30 days", range: { withinDays: 30 }, timeframes: ["upcoming", "all"] },
  { value: "90", label: "Next 90 days", range: { withinDays: 90 }, timeframes: ["upcoming", "all"] },
]

function rangeValue(r: RelativeRange): string {
  if (typeof r === "string") return r
  return "pastDays" in r ? `past-${r.pastDays}` : String(r.withinDays)
}

function rangesFor(timeframe: Timeframe): RangeOption[] {
  return RANGES.filter((r) => r.timeframes.includes(timeframe))
}

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
              // Keep the current quick select only if it still applies (e.g. "Next 7 days" doesn't in Past).
              const keep = rangesFor(timeframe).some((r) => r.value === rangeValue(value.range))
              set({ timeframe, range: keep ? value.range : "all" })
            }}
          >
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All</option>
          </select>
          <select
            className={selectClass}
            aria-label="Date range"
            value={rangeValue(value.range)}
            onChange={(e) => set({ range: RANGES.find((r) => r.value === e.target.value)!.range })}
          >
            {rangesFor(value.timeframe).map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
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
