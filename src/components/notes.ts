// T-0005: helpers for entry notes. Notes are plain text; line breaks are kept as typed.

/** Today's date on this device, as YYYY-MM-DD (local time, not UTC). */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Adds a note to a day's existing note (one entry per project per day, D-0003): the new
 * text goes under the old, separated by a blank line. Trailing whitespace is dropped.
 */
export function appendNote(existing: string, added: string): string {
  const before = existing.trimEnd()
  const after = added.trimEnd()
  if (before === '') return after
  if (after.trim() === '') return before
  return `${before}\n\n${after}`
}
