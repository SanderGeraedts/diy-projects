import { describe, expect, it } from 'vitest'
import { appendNote, todayIso } from './notes'

describe('todayIso', () => {
  it('uses the local date, zero-padded', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(todayIso(new Date(2026, 10, 17, 0, 1))).toBe('2026-11-17')
  })
})

describe('appendNote', () => {
  it('puts the new note under the old one, after a blank line', () => {
    expect(appendNote('Gezaagd.', 'Geschuurd.\nNog een keer.')).toBe('Gezaagd.\n\nGeschuurd.\nNog een keer.')
  })

  it('keeps line breaks inside notes and drops trailing whitespace', () => {
    expect(appendNote('Eén\ntwee\n\n', 'drie  \n')).toBe('Eén\ntwee\n\ndrie')
  })

  it('handles an empty side', () => {
    expect(appendNote('', 'Nieuw.')).toBe('Nieuw.')
    expect(appendNote('Oud.', '   ')).toBe('Oud.')
  })
})
