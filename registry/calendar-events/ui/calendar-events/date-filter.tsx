import { useMemo, useState } from "react"
import { CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { sameDateRange } from "@/lib/calendar-events/filters"
import { addDays, bucketByDay, formatDayRange, startOfDay, startOfMonth, zonedDate, zonedParts } from "@/lib/calendar-events/time"
import type { CalendarEvent, DateRange } from "@/lib/calendar-events/types"

interface Preset {
  label: string
  range: DateRange
}

/** Dot marking days with events, drawn on the day cell. */
const EVENT_DAY_CLASS =
  "relative after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary"

export interface DateFilterProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  /** Visible month, shared with the grid and the list. */
  month: Date
  onMonthChange: (month: Date) => void
  events: CalendarEvent[]
  timeZone: string
  className?: string
}

export function DateFilter({ value, onChange, month, onMonthChange, events, timeZone, className }: DateFilterProps) {
  const [open, setOpen] = useState(false)
  const presets = presetRanges(new Date(), timeZone)
  const eventDays = useMemo(() => eventDaySet(events, month, timeZone), [events, month, timeZone])

  const selected = value
    ? { from: toPickerDay(value.from, timeZone), to: value.to ? toPickerDay(value.to, timeZone) : undefined }
    : undefined

  const handleSelect = (r: { from?: Date; to?: Date } | undefined) => {
    if (!r?.from) return onChange(undefined)
    const from = fromPickerDay(r.from, timeZone)
    const to = r.to ? fromPickerDay(r.to, timeZone) : undefined
    onChange(to && to.getTime() !== from.getTime() ? { from, to } : { from })
  }

  const applyPreset = (range: DateRange) => {
    onChange(range)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Date range" className={cn("h-9 justify-start font-normal", className)}>
          <CalendarDays className="size-4" />
          {rangeLabel(value, timeZone)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <DatePresets presets={presets} active={value} onApply={applyPreset} />
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            month={toPickerDay(month, timeZone)}
            onMonthChange={(m) => onMonthChange(fromPickerDay(m, timeZone))}
            modifiers={{ hasEvents: (d: Date) => eventDays.has(localDayKey(d)) }}
            modifiersClassNames={{ hasEvents: EVENT_DAY_CLASS }}
          />
        </div>
        <div className="flex justify-end border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DatePresets({
  presets,
  active,
  onApply,
}: {
  presets: Preset[]
  active: DateRange | undefined
  onApply: (range: DateRange) => void
}) {
  return (
    <ul aria-label="Quick ranges" className="flex flex-wrap gap-1 border-b p-2 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r">
      {presets.map((p) => (
        <li key={p.label}>
          <Button
            variant={sameDateRange(p.range, active) ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start"
            onClick={() => onApply(p.range)}
          >
            {p.label}
          </Button>
        </li>
      ))}
    </ul>
  )
}

function presetRanges(now: Date, timeZone: string): Preset[] {
  const today = startOfDay(now, timeZone)
  const thisMonth = startOfMonth(now, timeZone)
  const nextMonth = startOfMonth(now, timeZone, 1)
  const lastMonth = startOfMonth(now, timeZone, -1)
  return [
    { label: "Today", range: { from: today } },
    { label: "Next 7 days", range: { from: today, to: addDays(today, 6, timeZone) } },
    { label: "Last 7 days", range: { from: addDays(today, -6, timeZone), to: today } },
    { label: "This month", range: { from: thisMonth, to: addDays(nextMonth, -1, timeZone) } },
    { label: "Last month", range: { from: lastMonth, to: addDays(thisMonth, -1, timeZone) } },
  ]
}

function rangeLabel(range: DateRange | undefined, timeZone: string): string {
  return range ? formatDayRange(range, timeZone) : "Any date"
}

/** `YYYY-MM-DD` keys of days with events across the three months around `month`. */
function eventDaySet(events: CalendarEvent[], month: Date, timeZone: string): Set<string> {
  const from = startOfMonth(month, timeZone, -1)
  const to = startOfMonth(month, timeZone, 2)
  return new Set(bucketByDay(events, from, to, timeZone).keys())
}

/** react-day-picker works in browser-local days; these convert to and from zone days. */
function toPickerDay(instant: Date, timeZone: string): Date {
  const p = zonedParts(instant, timeZone)
  return new Date(p.year, p.month - 1, p.day)
}

function fromPickerDay(day: Date, timeZone: string): Date {
  return zonedDate(day.getFullYear(), day.getMonth() + 1, day.getDate(), timeZone)
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
