/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly GOOGLE_CALENDAR_ID?: string
  readonly PUBLIC_GOOGLE_CALENDAR_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
