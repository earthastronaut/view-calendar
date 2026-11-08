import { useMemo, useState, type ReactNode } from "react"
import { CalendarPlus, Check, Download, ExternalLink, MapPin, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createMapsUrl, downloadIcs, googleAddToCalendarUrl, shareEvent } from "@/lib/calendar-events/links"
import { normalizeDescription } from "@/lib/calendar-events/description"
import { formatEventRange } from "@/lib/calendar-events/time"
import type { CalendarEvent } from "@/lib/calendar-events/types"

/** Only `http(s)` is matched, so the captured text is always safe to use as an `href`. */
const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g

function linkify(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

function DescriptionText({ text }: { text: string }) {
  return (
    <div className="calendar-event-description space-y-3 text-sm">
      {text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i} className="whitespace-pre-line">
          {linkify(paragraph)}
        </p>
      ))}
    </div>
  )
}

/** Only https links are rendered as "Open in Google"; anything else is dropped, never used as an `href`. */
function isHttpsUrl(url: string | undefined): url is string {
  return url?.startsWith("https://") ?? false
}

export interface EventModalProps {
  event: CalendarEvent | null
  timeZone: string
  shareUrl: (event: CalendarEvent) => string
  onClose: () => void
  /**
   * Replace the plain-text description body — the place to plug in a markdown or rich-text
   * renderer. `event.description` holds the raw Google payload (pseudo-HTML).
   */
  renderDescription?: (event: CalendarEvent) => ReactNode
}

export function EventModal({ event, timeZone, shareUrl, onClose, renderDescription }: EventModalProps) {
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {event && (
          <EventDetails
            key={event.id}
            event={event}
            timeZone={timeZone}
            shareUrl={shareUrl}
            renderDescription={renderDescription}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Keyed on the event id by the caller, so the share state starts fresh for each event. */
function EventDetails({
  event,
  timeZone,
  shareUrl,
  renderDescription,
}: {
  event: CalendarEvent
  timeZone: string
  shareUrl: (event: CalendarEvent) => string
  renderDescription?: (event: CalendarEvent) => ReactNode
}) {
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle")
  const description = useMemo(() => normalizeDescription(event.description), [event.description])
  const maps = createMapsUrl(event.location)

  return (
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

      {renderDescription ? renderDescription(event) : description && <DescriptionText text={description} />}

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
        {isHttpsUrl(event.htmlLink) && (
          <Button asChild variant="ghost" size="sm">
            <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" /> Open in Google
            </a>
          </Button>
        )}
      </div>
    </>
  )
}
