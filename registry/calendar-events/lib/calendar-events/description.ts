const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (!body.startsWith("#")) return ENTITIES[body.toLowerCase()] ?? match
    const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1))
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return match
    return String.fromCodePoint(code)
  })
}

/**
 * Google stores descriptions as pseudo-HTML (`<br>`, `<p>`, `<html-blob>`). Flatten it to plain
 * text: blank lines separate paragraphs, single newlines are line breaks. Entities are decoded
 * last so markup can never survive the tag strip.
 */
export function normalizeDescription(raw: string): string {
  const stripped = raw
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
  return decodeEntities(stripped)
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Single-line excerpt for cards and meta descriptions. */
export function descriptionExcerpt(raw: string, max = 160): string {
  const text = normalizeDescription(raw).replace(/\s+/g, " ").trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text
}
