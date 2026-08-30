export type RequestStatus = 'pending' | 'approved' | 'rejected'

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'En attente',
  approved: 'Validée',
  rejected: 'Refusée',
}

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-brand-100 text-brand-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
