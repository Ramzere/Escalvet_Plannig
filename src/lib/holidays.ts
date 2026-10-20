import { addDays, format } from 'date-fns'

/** Dimanche de Pâques (algorithme de Meeus / Jones / Butcher). */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

const cache = new Map<number, Map<string, string>>()

/** Jours fériés français d'une année : date ISO → libellé. Le cabinet est fermé ces jours-là. */
export function publicHolidaysOf(year: number): Map<string, string> {
  const cached = cache.get(year)
  if (cached) return cached
  const easter = easterSunday(year)
  const iso = (d: Date) => format(d, 'yyyy-MM-dd')
  const map = new Map<string, string>([
    [`${year}-01-01`, 'Jour de l’an'],
    [iso(addDays(easter, 1)), 'Lundi de Pâques'],
    [`${year}-05-01`, 'Fête du Travail'],
    [`${year}-05-08`, 'Victoire 1945'],
    [iso(addDays(easter, 39)), 'Ascension'],
    [iso(addDays(easter, 50)), 'Lundi de Pentecôte'],
    [`${year}-07-14`, 'Fête nationale'],
    [`${year}-08-15`, 'Assomption'],
    [`${year}-11-01`, 'Toussaint'],
    [`${year}-11-11`, 'Armistice 1918'],
    [`${year}-12-25`, 'Noël'],
  ])
  cache.set(year, map)
  return map
}

/** Libellé du férié tombant à cette date ISO, ou null. */
export function publicHolidayName(isoDate: string): string | null {
  return publicHolidaysOf(Number(isoDate.slice(0, 4))).get(isoDate) ?? null
}

export function isPublicHoliday(isoDate: string): boolean {
  return publicHolidayName(isoDate) !== null
}
