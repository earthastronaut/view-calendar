import { CalendarDays, Rss } from "lucide-react"
import { Button } from "@/components/ui/button"
import { calendarViewUrl, icalUrl, subscribeUrl } from "@/lib/calendar-events/links"

export function LinksBar({ calendarId, timeZone }: { calendarId: string; timeZone: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={calendarViewUrl(calendarId, { timeZone })} target="_blank" rel="noopener noreferrer">
          <CalendarDays className="size-4" /> View calendar
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={subscribeUrl(calendarId)} target="_blank" rel="noopener noreferrer">
          <CalendarDays className="size-4" /> Add to Google Calendar
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={icalUrl(calendarId)} target="_blank" rel="noopener noreferrer">
          <Rss className="size-4" /> iCal
        </a>
      </Button>
    </div>
  )
}
