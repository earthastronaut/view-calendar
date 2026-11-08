import * as React from "react"
import { CalendarPlus, Check, Download, ExternalLink, MapPin, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createMapsUrl, downloadIcs, googleAddToCalendarUrl, shareEvent } from "@/lib/calendar-events/links"
import { renderEventDescription } from "@/lib/calendar-events/markdown"
import { formatEventRange } from "@/lib/calendar-events/time"
import type { CalendarEvent } from "@/lib/calendar-events/types"

export interface EventModalProps {
  event: CalendarEvent | null
  timeZone: string
  shareUrl: (event: CalendarEvent) => string
  onClose: () => void
}

export function EventModal({ event, timeZone, shareUrl, onClose }: EventModalProps) {
  const [shareState, setShareState] = React.useState<"idle" | "copied" | "failed">("idle")
  const html = React.useMemo(() => (event ? renderEventDescription(event.description) : ""), [event])

  React.useEffect(() => setShareState("idle"), [event])

  const maps = event ? createMapsUrl(event.location) : null

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle>{event.summary}</DialogTitle>
              <DialogDescription>{formatEventRange(event, timeZone)}</DialogDescription>
            </DialogHeader>

            {event.location && (
              <p className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {maps ? (
                  <a href={maps} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    {event.location}
                  </a>
                ) : (
                  <span>{event.location}</span>
                )}
              </p>
            )}

            {html && (
              <div
                className="calendar-event-description space-y-3 text-sm [&_a]:underline [&_a]:underline-offset-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline" size="sm">
                <a href={googleAddToCalendarUrl(event, timeZone)} target="_blank" rel="noopener noreferrer">
                  <CalendarPlus className="size-4" /> Add to Google Calendar
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadIcs(event, timeZone)}>
                <Download className="size-4" /> .ics
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const r = await shareEvent(event, shareUrl(event))
                  setShareState(r === "copied" ? "copied" : r === "failed" ? "failed" : "idle")
                }}
              >
                {shareState === "copied" ? <Check className="size-4" /> : <Share2 className="size-4" />}
                {shareState === "copied" ? "Link copied" : shareState === "failed" ? "Copy failed" : "Share"}
              </Button>
              {event.htmlLink && (
                <Button asChild variant="ghost" size="sm">
                  <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" /> Open in Google
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
