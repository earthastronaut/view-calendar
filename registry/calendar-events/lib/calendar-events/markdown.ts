import { marked } from "marked"
import DOMPurify from "dompurify"

/** Google stores descriptions as pseudo-HTML (<br>, <p>, <html-blob>); turn that into markdown-friendly text. */
export function normalizeForMarkdown(raw: string): string {
  return raw
    .replace(/<\/?html-blob>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>\s*/gi, "\n\n")
    .replace(/<(p|div)(\s[^>]*)?>/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n")
    .trim()
}

let hooked = false
function ensureHook() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank")
      node.setAttribute("rel", "noopener noreferrer")
    }
  })
}

/** Render a Google Calendar description to sanitized HTML. */
export function renderEventDescription(raw: string): string {
  if (!raw.trim()) return ""
  ensureHook()
  const html = marked.parse(normalizeForMarkdown(raw), { gfm: true, breaks: true, async: false }) as string
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

/** Plain-text excerpt for cards and meta descriptions. */
export function descriptionExcerpt(raw: string, max = 160): string {
  const el = document.createElement("div")
  el.innerHTML = renderEventDescription(raw)
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}
