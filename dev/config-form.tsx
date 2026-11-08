import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/** "api" uses the API key when one is set (falling back to iCal); "ical" ignores it. */
export type DevSource = "api" | "ical"

export interface DevConfig {
  calendarId: string
  apiKey: string
  source: DevSource
  timeZone: string
  defaultView: "list" | "calendar"
  baseUrl: string
}

const STORAGE_KEY = "calendar-events-dev-config"

const EMPTY_CONFIG: DevConfig = {
  calendarId: "",
  apiKey: "",
  source: "api",
  timeZone: "",
  defaultView: "list",
  baseUrl: "",
}

const SOURCE_OPTIONS: { id: DevSource; label: string }[] = [
  { id: "api", label: "API key" },
  { id: "ical", label: "iCal" },
]

/** The key to hand the registry component, or undefined when iCal is selected. */
export function apiKeyFor(config: DevConfig): string | undefined {
  if (config.source !== "api") return undefined
  return config.apiKey || undefined
}

export function loadDevConfig(): DevConfig {
  if (typeof window === "undefined") return EMPTY_CONFIG
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_CONFIG
    return { ...EMPTY_CONFIG, ...(JSON.parse(raw) as Partial<DevConfig>) }
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
        <Field label="Calendar ID *">
          <Input
            value={draft.calendarId}
            onChange={(e) => set("calendarId", e.target.value)}
            placeholder="xxxx@group.calendar.google.com"
          />
        </Field>
        <Field label="API Key">
          <Input
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
            <option value="calendar">calendar</option>
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
