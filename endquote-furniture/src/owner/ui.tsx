import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, ArrowUpRight, Check, CheckCircle2, Circle, CircleCheck, CircleDot, CircleX, Copy, Eye, EyeOff, Inbox, Info, Link2, LoaderCircle, RefreshCw, X, type LucideIcon } from 'lucide-react'
import { QuoteMark } from '../marketing/ui'
import { initials, publicUrl, statusLabels, type Business, type Status } from './data'

export function Brand() {
  return <a href="/" className="ow-brand" aria-label="EndQuote — главная"><QuoteMark />EndQuote</a>
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }
export function Button({ busy, variant = 'primary', className = '', disabled, children, type = 'button', ...props }: ButtonProps) {
  return <button type={type} disabled={disabled || busy} aria-busy={busy || undefined} className={`ow-btn ow-${variant} ${className}`} {...props}>
    {busy && <LoaderCircle size={16} className="ow-spin" aria-hidden="true" />}{children}
  </button>
}

export type Message = { kind: 'error' | 'success' | 'info'; text: string }
export function Notice({ kind, children }: { kind: Message['kind']; children: ReactNode }) {
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info
  return <div className={'ow-notice ow-' + kind} role={kind === 'error' ? 'alert' : 'status'}><Icon size={17} aria-hidden="true" /><div>{children}</div></div>
}
export function Feedback({ message }: { message: Message | null }) {
  return message && <Notice kind={message.kind}>{message.text}</Notice>
}
export function Loading({ label = 'Загрузка…' }: { label?: string }) {
  return <div className="ow-loading" role="status"><LoaderCircle className="ow-spin" size={19} />{label}</div>
}
export function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return <Notice kind="error">{error} <button type="button" className="ow-text-link" onClick={retry}>Попробовать ещё раз</button></Notice>
}
export function StatusIcon({ status }: { status: Status }) {
  const Icon = { new: Circle, accepted: CircleDot, completed: CircleCheck, cancelled: CircleX }[status]
  return <Icon aria-hidden="true" size={14} className={'ow-state-icon ow-state-' + status} />
}
export function StatusBadge({ status }: { status: Status }) {
  return <span className="ow-order-status"><StatusIcon status={status} />{statusLabels[status]}</span>
}
export function BusinessAvatar({ business }: { business: Business }) {
  return <span className="ow-business-avatar" aria-hidden="true">{business.logoId
    ? <img src={'/api/owner/logo?v=' + encodeURIComponent(business.logoId)} alt="" /> : initials(business.name)}</span>
}
export function Empty({ icon: Icon = Inbox, title, children, action }: { icon?: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="ow-empty"><span className="ow-empty-icon"><Icon size={23} strokeWidth={1.55} /></span><h3>{title}</h3><p>{children}</p>{action}</div>
}
export function PageHeading({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <header className="ow-heading"><div><h1>{title}</h1>{children && <p>{children}</p>}</div>{action}</header>
}
export function PreviewLink({ children = 'Предпросмотр' }: { children?: ReactNode }) {
  return <a className="ow-btn ow-secondary" href="/owner/preview" target="_blank" rel="noreferrer">{children}<ArrowUpRight size={15} /></a>
}
export function RefreshButton({ onClick }: { onClick: () => void }) {
  return <Button variant="secondary" onClick={onClick}><RefreshCw size={14} />Обновить</Button>
}
export function CopyLink({ slug, label = 'Скопировать ссылку' }: { slug: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const manual = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (state === 'manual') manual.current?.select()
    if (state !== 'copied') return
    const timer = window.setTimeout(() => setState('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [state])
  async function copy() {
    try { await navigator.clipboard.writeText(publicUrl(slug)); setState('copied') }
    catch { setState('manual') }
  }
  return <div className="ow-copy"><Button variant="secondary" onClick={copy}>
    {state === 'copied' ? <Check size={15} /> : <Copy size={15} />}<span aria-live="polite">{state === 'copied' ? 'Ссылка скопирована' : label}</span>
  </Button>{state === 'manual' && <label>Скопируйте адрес вручную<input ref={manual} readOnly value={publicUrl(slug)} onFocus={e => e.target.select()} /></label>}</div>
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; prefix?: string; unit?: string }
export function Field({ label, hint, error, prefix, unit, type = 'text', id, className = '', ...props }: InputProps) {
  const uid = useId()
  const inputId = id ?? uid
  const [visible, setVisible] = useState(false)
  const password = type === 'password'
  return <div className={'ow-field ' + className}>
    <label htmlFor={inputId}>{label}</label>
    <div className={'ow-input-wrap' + (error ? ' ow-invalid' : '')}>
      {prefix && <span className="ow-prefix"><Link2 size={15} aria-hidden="true" /><span title={prefix}>{prefix}</span></span>}
      <input id={inputId} type={password && visible ? 'text' : type} aria-invalid={!!error}
        aria-describedby={error || hint ? inputId + '-note' : undefined} {...props} />
      {unit && <span className="ow-unit" aria-hidden="true">{unit}</span>}
      {password && <button type="button" className="ow-eye" aria-label={visible ? 'Скрыть введённые символы' : 'Показать введённые символы'}
        aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
    </div>
    {(error || hint) && <small id={inputId + '-note'} role={error ? 'alert' : undefined} className={error ? 'ow-field-error' : ''}>{error || hint}</small>}
  </div>
}

export type FormErrors = Record<string, string | undefined>
export function firstError(form: HTMLFormElement, errors: FormErrors) {
  const field = Object.keys(errors).find(key => errors[key])
  if (!field) return false
  const control = form.elements.namedItem(field)
  if (control instanceof HTMLElement) control.focus()
  return true
}
export function validEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254 }

export function Modal({ title, children, onClose, drawer = false }: { title: string; children: ReactNode; onClose: () => void; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    const oldOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = oldOverflow
      const target = opener instanceof HTMLElement && opener.isConnected ? opener : document.getElementById('ow-content')
      target?.focus({ preventScroll: true })
    }
  }, [])
  return <dialog className={'ow-modal' + (drawer ? ' ow-drawer' : '')} ref={ref} aria-labelledby={titleId}
    onCancel={e => { e.preventDefault(); onClose() }} onClick={e => {
      if (e.target !== e.currentTarget) return
      const r = e.currentTarget.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose()
    }}>
    <div className="ow-modal-head"><h2 id={titleId}>{title}</h2><button type="button" className="ow-icon-btn" aria-label="Закрыть" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>
}
