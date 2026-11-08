import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MultiDayListMode } from "@/lib/calendar-events/types"
import { EXAMPLE_CALENDAR_ID, exampleFetcher } from "./example-source"

/**
 * "api" uses the API key when one is set (falling back to iCal); "ical" ignores it;
 * "example" serves `example-events.json` and needs neither a calendar ID nor a key.
 */
export type DevSource = "api" | "ical" | "example"

export interface DevConfig {
  calendarId: string
  apiKey: string
  source: DevSource
  timeZone: string
  defaultView: "list" | "month"
  multiDayList: MultiDayListMode
  dayModal: boolean
  baseUrl: string
}

const STORAGE_KEY = "calendar-events-dev-config"

// Read from `.env` (see `.env.example`); empty when the file or a variable is absent.
const ENV = {
  CALENDAR_ID: import.meta.env.GOOGLE_CALENDAR_ID ?? "",
  API_KEY: import.meta.env.PUBLIC_GOOGLE_CALENDAR_API_KEY ?? "",
}

const EMPTY_CONFIG: DevConfig = {
  calendarId: ENV.CALENDAR_ID,
  apiKey: ENV.API_KEY,
  source: "api",
  timeZone: "",
  defaultView: "list",
  multiDayList: "each",
  dayModal: false,
  baseUrl: "",
}

const SOURCE_OPTIONS: { id: DevSource; label: string }[] = [
  { id: "api", label: "API key" },
  { id: "ical", label: "iCal" },
  { id: "example", label: "Example events" },
]

/** True when the config has something to load: example events, or a calendar ID. */
export function isConfigured(config: DevConfig): boolean {
  return config.source === "example" || Boolean(config.calendarId)
}

interface SourceProps {
  calendarId: string
  apiKey?: string
  fetcher?: typeof fetch
  cacheKey?: null
}

/** The source props to hand the registry component or hook for the selected source. */
export function sourceProps(config: DevConfig): SourceProps {
  if (config.source === "example") {
    // Relative dates, so skip the session cache; the fetcher stands in for Google's API.
    return {
      calendarId: EXAMPLE_CALENDAR_ID,
      apiKey: "example",
      fetcher: exampleFetcher(config.timeZone),
      cacheKey: null,
    }
  }
  return {
    calendarId: config.calendarId,
    apiKey: config.source === "api" ? config.apiKey || undefined : undefined,
  }
}

export function loadDevConfig(): DevConfig {
  if (typeof window === "undefined") return EMPTY_CONFIG
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_CONFIG
    const saved = JSON.parse(raw) as Partial<Omit<DevConfig, "defaultView">> & { defaultView?: string }
    // Older saves used "calendar" for what is now the "month" view.
    const defaultView = saved.defaultView === "calendar" ? "month" : saved.defaultView
    return {
      ...EMPTY_CONFIG,
      ...saved,
      // A saved blank must not hide the value from `.env`.
      calendarId: saved.calendarId || EMPTY_CONFIG.calendarId,
      apiKey: saved.apiKey || EMPTY_CONFIG.apiKey,
      defaultView: defaultView === "list" || defaultView === "month" ? defaultView : "list",
      multiDayList: saved.multiDayList === "start" ? "start" : "each",
      dayModal: saved.dayModal === true,
      source: saved.source === "ical" || saved.source === "example" ? saved.source : "api",
    }
  } catch {
    return EMPTY_CONFIG
  }
}

function saveDevConfig(config: DevConfig) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground/80">{label}</span>
      {children}
    </label>
  )
}

function SourceToggle({
  value,
  hasApiKey,
  onChange,
}: {
  value: DevSource
  hasApiKey: boolean
  onChange: (source: DevSource) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-foreground/80">Source</span>
      <div
        role="radiogroup"
        aria-label="Event source"
        className="inline-flex h-9 w-fit rounded-md border border-input p-0.5"
      >
        {SOURCE_OPTIONS.map((o) => (
          <Button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            variant={value === o.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {value === "api" && !hasApiKey && (
        <span className="text-xs text-foreground/60">No key set, so iCal will be used.</span>
      )}
      {value === "example" && (
        <span className="text-xs text-foreground/60">
          Using dev/example-events.json; calendar ID and API key are ignored.
        </span>
      )}
    </div>
  )
}

export function ConfigForm({
  config,
  onChange,
}: {
  config: DevConfig
  onChange: (config: DevConfig) => void
}) {
  const [draft, setDraft] = React.useState(config)

  const usesExample = draft.source === "example"

  function set<K extends keyof DevConfig>(key: K, value: DevConfig[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    saveDevConfig(draft)
    onChange(draft)
  }

  function handleClear() {
    window.localStorage.removeItem(STORAGE_KEY)
    setDraft(EMPTY_CONFIG)
    onChange(EMPTY_CONFIG)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-secondary/40 p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={usesExample ? "Calendar ID" : "Calendar ID *"}>
          <Input
            disabled={usesExample}
            value={draft.calendarId}
            onChange={(e) => set("calendarId", e.target.value)}
            placeholder="xxxx@group.calendar.google.com"
          />
        </Field>
        <Field label="API Key">
          <Input
            disabled={usesExample}
            value={draft.apiKey}
            onChange={(e) => set("apiKey", e.target.value)}
            placeholder="optional, falls back to iCal"
          />
        </Field>
        <SourceToggle
          value={draft.source}
          hasApiKey={Boolean(draft.apiKey)}
          onChange={(source) => set("source", source)}
        />
        <Field label="Time zone">
          <Input
            value={draft.timeZone}
            onChange={(e) => set("timeZone", e.target.value)}
            placeholder="America/Los_Angeles (default: browser)"
          />
        </Field>
        <Field label="Default view">
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={draft.defaultView}
            onChange={(e) =>
              set("defaultView", e.target.value as DevConfig["defaultView"])
            }
          >
            <option value="list">list</option>
            <option value="month">month</option>
          </select>
        </Field>
        <Field label="Multi-day events in list">
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={draft.multiDayList}
            onChange={(e) => set("multiDayList", e.target.value as MultiDayListMode)}
          >
            <option value="each">each day</option>
            <option value="start">start day only</option>
          </select>
        </Field>
        <Field label="Day click (month view)">
          <select
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={draft.dayModal ? "modal" : "none"}
            onChange={(e) => set("dayModal", e.target.value === "modal")}
          >
            <option value="none">nothing</option>
            <option value="modal">open day modal</option>
          </select>
        </Field>
        <Field label="Base URL (proxy)">
          <Input
            value={draft.baseUrl}
            onChange={(e) => set("baseUrl", e.target.value)}
            placeholder="optional, proxy the Google API"
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit">Apply</Button>
        <Button type="button" variant="outline" onClick={handleClear}>
          Clear
        </Button>
      </div>
    </form>
  )
}
