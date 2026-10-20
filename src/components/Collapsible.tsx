import { useState, type ReactNode } from 'react'

/** Bloc repliable avec un en-tête cliquable (titre, sous-titre, badge à droite). */
export default function Collapsible({
  title,
  subtitle,
  aside,
  defaultOpen = true,
  level = 'section',
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  aside?: ReactNode
  defaultOpen?: boolean
  /** 'section' = grande carte blanche ; 'group' = sous-bloc discret (ex. un mois). */
  level?: 'section' | 'group'
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (level === 'group') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 bg-sand-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-brand-700/70 hover:bg-sand-100"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <Chevron open={open} />
            {title}
          </span>
          {aside && <span className="font-normal normal-case tracking-normal">{aside}</span>}
        </button>
        {open && children}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-sand-50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Chevron open={open} />
          <span>
            <span className="block text-sm font-semibold text-brand-900">{title}</span>
            {subtitle && <span className="block text-xs text-brand-700/60">{subtitle}</span>}
          </span>
        </span>
        {aside && <span className="shrink-0 text-xs text-brand-700/70">{aside}</span>}
      </button>
      {open && <div className="border-t border-sand-200">{children}</div>}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-block text-brand-700/50 transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden
    >
      ▸
    </span>
  )
}
