import type { Shift } from '../types'
import { formatHours, shiftHours } from '../lib/hours'
import { POSTE_SHORT_LABELS } from '../types'

const POSTE_STYLES: Record<string, string> = {
  bleu: 'bg-poste-bleu-bg text-poste-bleu border-poste-bleu/30',
  violet: 'bg-poste-violet-bg text-poste-violet border-poste-violet/30',
  vert: 'bg-poste-vert-bg text-poste-vert border-poste-vert/30',
  seul: 'bg-poste-seul-bg text-poste-seul border-poste-seul/30',
}

export default function ShiftPill({
  shift,
  employeeName,
  onClick,
}: {
  shift: Shift
  employeeName: string
  onClick?: () => void
}) {
  const hours = shiftHours(shift)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`min-w-[70px] flex-1 rounded-lg border px-1.5 py-1.5 text-left text-xs leading-snug transition ${
        POSTE_STYLES[shift.poste]
      } ${onClick ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
      title={POSTE_SHORT_LABELS[shift.poste]}
    >
      <p className="font-semibold">{employeeName}</p>
      <p className="opacity-80">
        {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} ({formatHours(hours)})
      </p>
    </button>
  )
}
