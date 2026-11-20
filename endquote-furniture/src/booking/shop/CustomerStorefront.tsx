import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, Check, Copy, LoaderCircle, MapPin, MessageCircle, Phone, ShoppingBag, X } from 'lucide-react'
import type { BookingFlow } from '../BookingApp'
import {useStore} from '../live/LiveStore'
import { formatMoney } from '../pricing'
import FurnitureCatalog, { StoreFooter } from './FurnitureCatalog'
import CleaningStudio from './CleaningStudio'
import Checkout from './Checkout'
import Confirmation from './Confirmation'
import { useStoreNavigation } from './useStoreNavigation'
import './shop.css'
import './studio.css'
import './checkout.css'

function ContactSheet({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState('')
  const {company:b,live}=useStore()
  useEffect(() => {
    const el = dialog.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el?.showModal()
    return () => { el?.close(); document.body.style.overflow = overflow }
  }, [])
  return <dialog ref={dialog} className="sf-contacts" aria-labelledby="sf-contacts-title" onCancel={e => { e.preventDefault(); close() }}
    onClick={e => {
      if (e.currentTarget !== e.target) return
      const r = e.currentTarget.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close()
    }}>
    <div className="sf-contact-top"><span className="sf-kicker"><i />Контакты студии</span><button className="sf-icon" aria-label="Закрыть контакты" onClick={close}><X size={18} /></button></div>
    <h2 id="sf-contacts-title">Связаться с «{b.name}»</h2><p>{b.description}</p>
    <p className="sf-area"><MapPin size={15} />{b.city} · {b.area}</p>
    <a className="sf-contact-row" href={b.phoneHref}><Phone size={18} /><span>Позвонить<b>{b.phone}</b></span><ArrowUpRight size={16} /></a>
    <a className="sf-contact-row" href={b.messengerHref} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /><span>Открыть мессенджер<b>Ватсап</b></span><ArrowUpRight size={16} /></a>
    <button className="sf-text-button" onClick={async () => {
      try { await navigator.clipboard.writeText(b.phone); setCopied('Номер скопирован') } catch { setCopied('Выделите и скопируйте номер выше') }
    }}><Copy size={14} /><span aria-live="polite">{copied || 'Скопировать номер'}</span></button>
    {!live&&<small>Это демо-профиль: номер показан как пример, а социальные ссылки ведут на главные страницы сервисов.</small>}
  </dialog>
}

export default function CustomerStorefront({ flow: booking }: { flow: BookingFlow }) {
  const [contact, setContact] = useState(false)
  const [sort, setSort] = useState('catalog')
  const {company,live,preview,logo}=useStore()
  const navigate = useStoreNavigation(booking)
  const flow = { ...booking, go: navigate }
  const { quantity, step, selected, itemsLabel } = flow
  const cart = () => flow.go('cart')
  return <div className={`sf-shop ${flow.stickyVisible ? 'sf-has-dock' : ''}`}>
    <div inert={Boolean(selected) || contact}>
    <a className="sf-skip" href="#sf-main">К содержанию</a>
    <header className="sf-nav"><div className="sf-container sf-nav-inner">
      <a className="sf-brand" href={location.pathname} aria-label={company.name + ' — к услугам'} onClick={e => { e.preventDefault(); flow.go('catalog') }}>
        {logo ? <img className="sf-brand-logo" src={logo} width="36" height="36" alt="" /> :
          <span className="sf-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M5 16c7.5-1 9-3 11-12 1.7 8.8 3.5 11 11 12-7.5 1.5-9.6 4.5-11 12-1.5-7.5-3.5-10.5-11-12Z" stroke="currentColor" strokeWidth="1.65"/><path d="m9 20 8-10" stroke="currentColor" strokeWidth="1.1"/></svg></span>}
        <span className="sf-identity"><strong>{company.name}</strong><span className="sf-nav-place"><MapPin size={12} />{company.city}</span></span>
      </a>
      {preview && <span className="sf-preview-label">Предпросмотр</span>}
      <button className="sf-nav-contact" onClick={() => setContact(true)} aria-label={'Связаться с ' + company.name}><MessageCircle size={18} /><span>Контакты</span></button>
      <button className="sf-bag" onClick={cart} aria-label={quantity ? 'Открыть корзину, ' + itemsLabel(quantity) : 'Открыть корзину'}>
        <ShoppingBag size={17} /><span>Корзина</span>{quantity > 0 && <b>{quantity}</b>}
      </button>
    </div></header>
    <main className="sf-container sf-main" id="sf-main" tabIndex={-1}>
      {step === 'catalog' ? <FurnitureCatalog flow={flow} sort={sort} setSort={setSort} />
        : step === 'success' ? <Confirmation flow={flow} /> : <Checkout flow={flow} />}
    </main>
    <div className="sf-container"><StoreFooter contact={() => setContact(true)} />
      <div className="sf-socials">{company.socialLinks.map(s => <a key={s.kind} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={live?s.label:`${s.label} — пример социальной ссылки`}>{s.label}<ArrowUpRight size={12} /></a>)}</div>
    </div>
    {flow.stickyVisible && <aside className="sf-dock" aria-label="Итог заказа"><div className="sf-dock-inner">
      <div className="sf-dock-thumbs" aria-hidden="true">{[...new Set(flow.cart.map(i => i.configuration.modelId))].slice(0, 3).map(id => {
        const a = flow.assets.find(asset => asset.id === id)
        return a && <img key={id} src={a.preview} width="38" height="38" alt="" />
      })}</div>
      <div className="sf-dock-amount"><span>{itemsLabel(quantity)} · расчёт</span><strong>{formatMoney(flow.total)}</strong></div>
      {step === 'contact'
        ? <button key="submit" className="sf-action sf-primary" type="submit" form="booking-contact" disabled={preview || flow.submitting || flow.preparingPhotos || !quantity}>{flow.submitting ? 'Сохраняем…' : live?'Отправить заявку':'Отправить демо-заявку'}{flow.submitting ? <LoaderCircle size={16} /> : <ArrowRight size={16} />}</button>
        : <button key="next" className="sf-action sf-primary" type="button" onClick={() => flow.go(step === 'catalog' ? 'cart' : 'contact')}>{step === 'catalog' ? 'Перейти к заказу' : 'Перейти к контактам'}<ArrowRight size={16} /></button>}
    </div></aside>}
    {flow.toast && <div className="sf-toast" role="status"><Check size={15} />{flow.toast}</div>}
    </div>
    {contact && <ContactSheet close={() => setContact(false)} />}
    {selected && <CleaningStudio key={selected.item?.id || selected.asset.id} asset={selected.asset} initial={selected.item?.configuration ?? null} onSave={flow.save} onClose={flow.closeConfig} />}
  </div>
}
