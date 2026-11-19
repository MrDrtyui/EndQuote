import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

// A pair of closing quotes, cut from the same slanted slab.
export function QuoteMark({ className }: { className?: string }) {
  return <svg className={className} aria-hidden="true" viewBox="0 0 42 32" fill="currentColor">
    <path d="M5.5 2h14.7l-3.6 15.2L5.8 30H.4l7-13.6H2.1L5.5 2Zm20.4 0h14.7L37 17.2 26.2 30h-5.4l7-13.6h-5.3L25.9 2Z" />
  </svg>
}

export function Logo() {
  return <a className="eq-logo" href="/" aria-label="EndQuote — главная"><QuoteMark />EndQuote</a>
}

export function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return <span className="eq-section-label"><i aria-hidden="true" /><span>{index}</span><b aria-hidden="true">/</b>{children}</span>
}

export function Modal({ titleId, onClose, className = '', children }: {
  titleId: string; onClose: () => void; className?: string; children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} className={`eq-dialog ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
    }}>
    <button type="button" className="eq-icon-button eq-dialog-close" aria-label="Закрыть окно" onClick={onClose}><X size={18} /></button>
    {children}
  </dialog>
}
