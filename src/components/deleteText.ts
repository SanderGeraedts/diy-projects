// T-0010 (D-0014): the confirmation names what goes with a delete, e.g.
// "Project 'Tuinbank' verwijderen, met 3 notities en 14 foto's?". Parts that are zero are left
// out, so an empty project asks "Project 'Tuinbank' verwijderen?".

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function withParts(subject: string, parts: string[]): string {
  if (parts.length === 0) return `${subject} verwijderen?`
  return `${subject} verwijderen, met ${parts.join(' en ')}?`
}

export function deleteProjectQuestion(title: string, entries: number, photos: number): string {
  const parts = [
    ...(entries > 0 ? [count(entries, 'notitie', 'notities')] : []),
    ...(photos > 0 ? [count(photos, 'foto', "foto's")] : []),
  ]
  return withParts(`Project '${title}'`, parts)
}

/** `day` is the formatted date, e.g. "4 okt 2026". */
export function deleteEntryQuestion(day: string, photos: number): string {
  return withParts(`Notitie van ${day}`, photos > 0 ? [count(photos, 'foto', "foto's")] : [])
}
