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
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 shrink">
        <h1 className="text-lg font-semibold capitalize text-brand-900">
          Semaine du {format(start, 'd MMMM', { locale: fr })} au{' '}
          {format(end, 'd MMMM yyyy', { locale: fr })}
        </h1>
      </div>
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
        <input
          type="date"
          value={weekStart}
          title="Aller à une semaine"
          onChange={(e) => e.target.value && onChange(weekStartOf(parseISO(e.target.value)))}
          className="rounded-lg border border-sand-300 bg-white px-2 py-1.5 text-sm text-brand-800 outline-none focus:border-brand-400"
        />
        <button
          onClick={() => onChange(format(addWeeks(start, -1), 'yyyy-MM-dd'))}
          className="shrink-0 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm text-brand-800 hover:bg-sand-100"
        >
          ← Précédente
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => onChange(weekStartOf(new Date()))}
            className="shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            Aujourd&apos;hui
          </button>
        )}
        <button
          onClick={() => onChange(format(addWeeks(start, 1), 'yyyy-MM-dd'))}
          className="shrink-0 rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-sm text-brand-800 hover:bg-sand-100"
        >
          Suivante →
        </button>
      </div>
    </div>
  )
}
