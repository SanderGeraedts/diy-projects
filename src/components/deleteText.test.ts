import { describe, expect, it } from 'vitest'
import { deleteEntryQuestion, deleteProjectQuestion } from './deleteText'

describe('delete confirmations (T-0010)', () => {
  it('names the notes and photos that go with a project', () => {
    expect(deleteProjectQuestion('Tuinbank', 3, 14)).toBe("Project 'Tuinbank' verwijderen, met 3 notities en 14 foto's?")
    expect(deleteProjectQuestion('Tuinbank', 1, 1)).toBe("Project 'Tuinbank' verwijderen, met 1 notitie en 1 foto?")
    expect(deleteProjectQuestion('Tuinbank', 2, 0)).toBe("Project 'Tuinbank' verwijderen, met 2 notities?")
    expect(deleteProjectQuestion('Tuinbank', 0, 0)).toBe("Project 'Tuinbank' verwijderen?")
  })

  it('names the photos that go with an entry', () => {
    expect(deleteEntryQuestion('4 okt 2026', 4)).toBe("Notitie van 4 okt 2026 verwijderen, met 4 foto's?")
    expect(deleteEntryQuestion('4 okt 2026', 1)).toBe('Notitie van 4 okt 2026 verwijderen, met 1 foto?')
    expect(deleteEntryQuestion('4 okt 2026', 0)).toBe('Notitie van 4 okt 2026 verwijderen?')
  })
})
