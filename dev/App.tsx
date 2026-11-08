import * as React from "react"
import { Button } from "@/components/ui/button"
import { CalendarEvents } from "@/ui/calendar-events"
import { useCalendarEvents } from "@/hooks/use-calendar-events"
import { clearEventCache } from "@/lib/calendar-events/source"
import { filterEvents, defaultFilters } from "@/lib/calendar-events/filters"
import { addDays, defaultTimeZone } from "@/lib/calendar-events/time"
import { ConfigForm, isConfigured, loadDevConfig, sourceProps, type DevConfig } from "./config-form"

type Example = "component" | "list-view" | "calendar-view" | "headless"

const EXAMPLES: { id: Example; label: string }[] = [
  { id: "component", label: "<CalendarEvents />" },
  { id: "list-view", label: "List view only" },
  { id: "calendar-view", label: "Calendar view only" },
  { id: "headless", label: "Headless hook" },
]

function Placeholder() {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground/60">
      Enter a public Google Calendar ID above, or pick the example events source, then click Apply.
    </div>
  )
}

function ComponentExample({ config }: { config: DevConfig }) {
  if (!isConfigured(config)) return <Placeholder />
  return (
    <CalendarEvents
      {...sourceProps(config)}
      timeZone={config.timeZone || undefined}
      defaultView={config.defaultView}
      multiDayList={config.multiDayList}
      dayModal={config.dayModal}
      baseUrl={config.baseUrl || undefined}
      showLinks={config.source !== "example"}
    />
  )
}

function ListViewExample({ config }: { config: DevConfig }) {
  if (!isConfigured(config)) return <Placeholder />
  return (
    <CalendarEvents
      {...sourceProps(config)}
      timeZone={config.timeZone || undefined}
      baseUrl={config.baseUrl || undefined}
      defaultView="list"
      multiDayList={config.multiDayList}
      showFilters={false}
      showLinks={false}
    />
  )
}

function CalendarViewExample({ config }: { config: DevConfig }) {
  if (!isConfigured(config)) return <Placeholder />
  return (
    <CalendarEvents
      {...sourceProps(config)}
      timeZone={config.timeZone || undefined}
      baseUrl={config.baseUrl || undefined}
      defaultView="month"
      dayModal={config.dayModal}
      showLinks={config.source !== "example"}
    />
  )
}

function HeadlessExample({ config }: { config: DevConfig }) {
  const { events, status, error, source } = useCalendarEvents({
    ...sourceProps(config),
    timeZone: config.timeZone || undefined,
    baseUrl: config.baseUrl || undefined,
    enabled: isConfigured(config),
  })

  if (!isConfigured(config)) return <Placeholder />

  const timeZone = config.timeZone || defaultTimeZone()
  const now = new Date()
  const upcoming = filterEvents(
    events,
    { ...defaultFilters, dateRange: { from: now, to: addDays(now, 6, timeZone) } },
    { timeZone },
  )

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap gap-4 text-foreground/70">
        <span>status: {status}</span>
        <span>source: {source ?? "—"}</span>
        <span>events loaded: {events.length}</span>
        <span>upcoming (this week): {upcoming.length}</span>
      </div>
      {error && <div className="text-red-600">{error.message}</div>}
      <ul className="flex flex-col gap-1">
        {upcoming.map((e) => (
          <li key={e.id} className="rounded-md border border-border p-2">
            <div className="font-medium">{e.summary}</div>
            <div className="text-foreground/60">
              {e.start.toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const EXAMPLE_COMPONENTS: Record<
  Example,
  React.ComponentType<{ config: DevConfig }>
> = {
  component: ComponentExample,
  "list-view": ListViewExample,
  "calendar-view": CalendarViewExample,
  headless: HeadlessExample,
}

function ClearCacheButton() {
  const [cleared, setCleared] = React.useState<number | null>(null)
  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={() => setCleared(clearEventCache())}>
        Clear event cache
      </Button>
      {cleared !== null && (
        <span role="status" className="text-xs text-foreground/60">
          Cleared {cleared} cached {cleared === 1 ? "entry" : "entries"}.
        </span>
      )}
    </div>
  )
}

export function App() {
  const [config, setConfig] = React.useState<DevConfig>(() => loadDevConfig())
  const [example, setExample] = React.useState<Example>("component")

  const ExampleComponent = EXAMPLE_COMPONENTS[example]

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">calendar-events — dev</h1>
        <p className="text-sm text-foreground/60">
          Local playground for the registry components. Not shipped.
        </p>
      </header>

      <ConfigForm config={config} onChange={setConfig} />

      <ClearCacheButton />

      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {EXAMPLES.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setExample(e.id)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
              (example === e.id
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-accent")
            }
          >
            {e.label}
          </button>
        ))}
      </nav>

      <main>
        <ExampleComponent config={config} />
      </main>
    </div>
  )
}
