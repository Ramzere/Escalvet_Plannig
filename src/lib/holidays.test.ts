import { describe, expect, it } from 'vitest'
import { isPublicHoliday, publicHolidayName, publicHolidaysOf } from './holidays'

describe('jours fériés', () => {
  it('calcule les fériés mobiles de 2026', () => {
    const h = publicHolidaysOf(2026)
    expect(h.get('2026-04-06')).toBe('Lundi de Pâques')
    expect(h.get('2026-05-14')).toBe('Ascension')
    expect(h.get('2026-05-25')).toBe('Lundi de Pentecôte')
    expect(h.size).toBe(11)
  })

  it('calcule les fériés mobiles de 2027', () => {
    const h = publicHolidaysOf(2027)
    expect(h.get('2027-03-29')).toBe('Lundi de Pâques')
    expect(h.get('2027-05-06')).toBe('Ascension')
    expect(h.get('2027-05-17')).toBe('Lundi de Pentecôte')
  })

  it('reconnaît les fériés fixes', () => {
    expect(isPublicHoliday('2026-11-11')).toBe(true)
    expect(publicHolidayName('2026-12-25')).toBe('Noël')
    expect(isPublicHoliday('2026-11-12')).toBe(false)
  })
})
