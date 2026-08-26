import { addDays, addWeeks, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { parseISO } from 'date-fns'
import { weekStartOf } from '../lib/hours'

export default function WeekNavigator({
  weekStart,
  onChange,
}: {
  weekStart: string
  onChange: (weekStart: string) => void
}) {
  const start = parseISO(weekStart)
  const end = addDays(start, 5)
  const isCurrentWeek = weekStart === weekStartOf(new Date())

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold capitalize text-brand-900">
          Semaine du {format(start, 'd MMMM', { locale: fr })} au{' '}
          {format(end, 'd MMMM yyyy', { locale: fr })}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(format(addWeeks(start, -1), 'yyyy-MM-dd'))}
          className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm text-brand-800 hover:bg-sand-100"
        >
          ← Précédente
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => onChange(weekStartOf(new Date()))}
            className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            Aujourd&apos;hui
          </button>
        )}
        <button
          onClick={() => onChange(format(addWeeks(start, 1), 'yyyy-MM-dd'))}
          className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm text-brand-800 hover:bg-sand-100"
        >
          Suivante →
        </button>
      </div>
    </div>
  )
}
