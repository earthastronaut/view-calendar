import * as React from "react";
import { loadEvents } from "@/lib/calendar-events/source";
import { defaultTimeZone, startOfMonth } from "@/lib/calendar-events/time";
import type {
  CalendarEvent,
  EventSource,
  LoadOptions,
} from "@/lib/calendar-events/types";

export interface UseCalendarEventsOptions extends Pick<
  LoadOptions,
  "calendarId" | "apiKey" | "baseUrl" | "fetcher" | "icalProxies" | "timeoutMs"
> {
  timeZone?: string;
  /** Months of history loaded initially. Default 1. */
  monthsBack?: number;
  /** Months ahead loaded initially. Default 6. */
  monthsAhead?: number;
  enabled?: boolean;
}

export interface UseCalendarEvents {
  events: CalendarEvent[];
  status: "idle" | "loading" | "ready" | "error";
  error: Error | null;
  /** Where the most recent successful load came from. */
  source: EventSource | null;
  /** The window currently loaded. */
  range: { from: Date; to: Date };
  /** Fetch more history, `months` back from the current window start. Resolves true if anything new was found. */
  loadMorePast: (months?: number) => Promise<boolean>;
  /** Make sure `[from, to]` is loaded (used by month navigation). */
  ensureRange: (from: Date, to: Date) => Promise<void>;
  reload: () => void;
}

function merge(a: CalendarEvent[], b: CalendarEvent[]): CalendarEvent[] {
  const map = new Map<string, CalendarEvent>();
  for (const e of [...a, ...b]) map.set(e.id, e);
  return [...map.values()].sort(
    (x, y) => x.start.getTime() - y.start.getTime(),
  );
}

export function useCalendarEvents(
  opts: UseCalendarEventsOptions,
): UseCalendarEvents {
  const {
    calendarId,
    apiKey,
    baseUrl,
    fetcher,
    icalProxies,
    timeoutMs,
    enabled = true,
  } = opts;
  const timeZone = opts.timeZone ?? defaultTimeZone();
  const monthsBack = opts.monthsBack ?? 1;
  const monthsAhead = opts.monthsAhead ?? 6;

  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [status, setStatus] =
    React.useState<UseCalendarEvents["status"]>("idle");
  const [error, setError] = React.useState<Error | null>(null);
  const [source, setSource] = React.useState<EventSource | null>(null);
  const [range, setRange] = React.useState(() => {
    const now = new Date();
    return {
      from: startOfMonth(now, timeZone, -monthsBack),
      to: startOfMonth(now, timeZone, monthsAhead),
    };
  });
  const rangeRef = React.useRef(range);
  const [nonce, setNonce] = React.useState(0);

  const fetchWindow = React.useCallback(
    (from: Date, to: Date) =>
      loadEvents({
        calendarId,
        apiKey,
        baseUrl,
        fetcher,
        icalProxies,
        timeoutMs,
        timeZone,
        timeMin: from,
        timeMax: to,
      }),
    [calendarId, apiKey, baseUrl, fetcher, icalProxies, timeoutMs, timeZone],
  );

  // Initial / reload fetch.
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const now = new Date();
    const r = {
      from: startOfMonth(now, timeZone, -monthsBack),
      to: startOfMonth(now, timeZone, monthsAhead),
    };
    rangeRef.current = r;
    setRange(r);
    setStatus("loading");
    setError(null);
    fetchWindow(r.from, r.to)
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events);
        setSource(res.source);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, fetchWindow, monthsBack, monthsAhead, timeZone, nonce]);

  const extend = React.useCallback(
    async (from: Date, to: Date): Promise<boolean> => {
      const cur = rangeRef.current;
      const jobs: Promise<CalendarEvent[]>[] = [];
      if (from < cur.from)
        jobs.push(fetchWindow(from, cur.from).then((r) => r.events));
      if (to > cur.to) jobs.push(fetchWindow(cur.to, to).then((r) => r.events));
      if (!jobs.length) return false;
      const next = {
        from: from < cur.from ? from : cur.from,
        to: to > cur.to ? to : cur.to,
      };
      rangeRef.current = next;
      try {
        const added = (await Promise.all(jobs)).flat();
        setRange(next);
        setEvents((prev) => merge(prev, added));
        return added.length > 0;
      } catch (e) {
        rangeRef.current = cur; // allow retry
        setError(e instanceof Error ? e : new Error(String(e)));
        return false;
      }
    },
    [fetchWindow],
  );

  const loadMorePast = React.useCallback(
    (months = 6) =>
      extend(
        startOfMonth(rangeRef.current.from, timeZone, -months),
        rangeRef.current.to,
      ),
    [extend, timeZone],
  );
  const ensureRange = React.useCallback(
    async (from: Date, to: Date) => {
      await extend(from, to);
    },
    [extend],
  );
  const reload = React.useCallback(() => setNonce((n) => n + 1), []);

  return {
    events,
    status,
    error,
    source,
    range,
    loadMorePast,
    ensureRange,
    reload,
  };
}
