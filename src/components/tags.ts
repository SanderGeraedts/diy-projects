/**
 * T-0004: tags are free text, trimmed, lower-cased and de-duplicated, in the order given.
 * Commas separate tags, so "Hout, tuin" is two tags.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of tags.flatMap((t) => t.split(','))) {
    const tag = raw.trim().toLowerCase()
    if (tag !== '' && !out.includes(tag)) out.push(tag)
  }
  return out
}

/** Tags in use that aren't chosen yet and start with what's typed, alphabetically. */
export function suggestTags(inUse: readonly string[], chosen: readonly string[], typed: string, max = 8): string[] {
  const prefix = typed.trim().toLowerCase()
  return [...new Set(normalizeTags(inUse))]
    .filter((t) => !chosen.includes(t) && t.startsWith(prefix) && t !== prefix)
    .sort((a, b) => a.localeCompare(b, 'nl'))
    .slice(0, max)
}
