import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'


export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' | 'purple' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
}) {
  return (
    <button className={cn('button', `button--${variant}`, `button--${size}`, className)} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  )
}

export function StatCard({ label, value, helper, icon, accent = 'blue' }: { label: string; value: string; helper?: string; icon: ReactNode; accent?: 'blue' | 'green' | 'purple' | 'orange' }) {
  return (
    <article className="stat-card">
      <div className={`stat-card__icon stat-card__icon--${accent}`}>{icon}</div>
      <div>
        <div className="stat-card__label">{label}</div>
        <div className="stat-card__value">{value}</div>
        {helper && <div className="stat-card__helper">{helper}</div>}
      </div>
    </article>
  )
}

export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="section-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="section-header__actions">{actions}</div>}
    </header>
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100))
  return <div className="progress"><span style={{ width: `${percent}%` }} /></div>
}

export function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}
