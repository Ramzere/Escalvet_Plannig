import type { Poste } from '../types'
import { POSTE_SHORT_LABELS } from '../types'

const POSTE_ORDER: Poste[] = ['bleu', 'violet', 'vert', 'seul']

const POSTE_DOT: Record<Poste, string> = {
  bleu: 'bg-poste-bleu',
  violet: 'bg-poste-violet',
  vert: 'bg-poste-vert',
  seul: 'bg-poste-seul',
}

export default function PosteLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-xs text-brand-700/80">
      <span className="font-medium text-brand-700/50">Postes :</span>
      {POSTE_ORDER.map((p) => (
        <span key={p} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${POSTE_DOT[p]}`} />
          {POSTE_SHORT_LABELS[p]}
        </span>
      ))}
    </div>
  )
}
