import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Copy, MapPin, MessageCircle, Music2, Phone, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { BusinessProfile as Business } from './company'

export default function BusinessProfile({ business }: { business: Business }) {
  const [contactsOpen, setContactsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!contactsOpen) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    return () => { document.body.style.overflow = before; requestAnimationFrame(() => opener.current?.focus({ preventScroll: true })) }
  }, [contactsOpen])
  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') setContactsOpen(false)
    if (event.key !== 'Tab') return
    const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href],button') ?? [])
    if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus() }
    if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus() }
  }
  return <>
    <section className="storefront-profile" aria-labelledby="business-name">
      <div className="storefront-profile-heading"><div className="storefront-avatar" aria-hidden="true"><Sparkles size={27} strokeWidth={1.5} /><span>{business.initials}</span></div><div><span className="storefront-profile-kicker">Чистка мебели · {business.city}</span><h1 id="business-name">{business.name}</h1><p>{business.tagline}</p></div></div>
      <p className="storefront-description">{business.description}</p>
      <div className="storefront-service-area"><MapPin size={14} /><span>{business.city}<span> · {business.area}</span></span></div>
      <div className="storefront-profile-actions"><button className="storefront-contact-button" ref={opener} onClick={() => setContactsOpen(true)}><MessageCircle size={17} strokeWidth={1.7} />Связаться<span>Есть вопрос?</span><ArrowUpRight size={16} /></button><div className="storefront-socials" aria-label="Социальные сети">{business.socialLinks.map((social) => <a key={social.kind} href={social.href} target="_blank" rel="noopener noreferrer" aria-label={`${social.label} — пример социальной ссылки`} title={`${social.label} · демо-ссылка`}>{social.kind === 'instagram' ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" /></svg> : <Music2 size={19} strokeWidth={1.6} />}</a>)}</div></div>
      <div className="storefront-profile-note"><ShieldCheck size={13} /><span>Выбирайте услуги и смотрите цены без звонка</span></div>
    </section>
    {contactsOpen && <div className="storefront-contact-backdrop" onClick={(event) => { if (event.currentTarget === event.target) setContactsOpen(false) }}><div ref={dialog} className="storefront-contact-sheet" role="dialog" aria-modal="true" aria-labelledby="contacts-title" onKeyDown={keyDown}><header><span className="storefront-contact-avatar"><MessageCircle size={22} /></span><button ref={closeButton} className="booking-icon-button" aria-label="Закрыть контакты" onClick={() => setContactsOpen(false)}><X size={20} /></button></header><h2 id="contacts-title">Связаться с «{business.name}»</h2><p>Уточните детали перед оформлением заказа.</p><a href={business.phoneHref} className="storefront-contact-row"><Phone size={18} /><span>Позвонить<strong>{business.phone}</strong></span><ArrowUpRight size={17} /></a><a href={business.messengerHref} target="_blank" rel="noopener noreferrer" className="storefront-contact-row"><MessageCircle size={18} /><span>Открыть мессенджер<strong>Ватсап</strong></span><ArrowUpRight size={17} /></a><button className="storefront-copy" onClick={async () => { try { await navigator.clipboard.writeText(business.phone); setCopied(true) } catch { setCopied(false) } }}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Номер скопирован' : 'Скопировать номер'}</button>{business.demo && <div className="storefront-contacts-demo">Это демо-профиль: номер показан как пример, а социальные ссылки ведут на главные страницы сервисов.</div>}</div></div>}
  </>
}
