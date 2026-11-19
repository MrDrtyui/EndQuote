import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Box, CalendarDays, Check, CheckCheck, ChevronRight, Home, Info, Leaf, LoaderCircle, Plus, Search, ShieldCheck, ShoppingBag, Sparkles, X } from 'lucide-react'
import type { FurnitureAsset } from '../types'
import { isFurnitureAsset } from '../types'
import type { CartItem, CustomerDetails, DemoOrder, ItemConfiguration } from './domain'
import { calculateCartTotal, defaultConfiguration, DEMO_PRICING, formatMoney } from './pricing'
import { getDemoOrder, readDemoOrders, submitDemoOrder } from './orders'
import { DEMO_COMPANY } from './company'
import Configurator from './Configurator'
import ContactForm from './ContactForm'
import OrderItems from './OrderItems'
import BusinessProfile from './BusinessProfile'
import { readBasket, saveBasket } from './basket'
import {StoreContext,type LiveData} from './live/LiveStore'
import './booking.css'
import './storefront.css'

const CustomerStorefront = lazy(() => import('./shop/CustomerStorefront'))

type Step = 'catalog' | 'cart' | 'contact' | 'success'
const categories = [
  { id: 'all', name: 'Всё', types: [] as string[] }, { id: 'sofas', name: 'Диваны', types: ['sofa'] },
  { id: 'armchairs', name: 'Кресла', types: ['armchair'] }, { id: 'chairs', name: 'Стулья', types: ['chair'] },
  { id: 'mattresses', name: 'Матрасы', types: ['mattress'] }, { id: 'other', name: 'Другая мебель', types: ['ottoman', 'headboard'] },
]
const emptyCustomer = (): CustomerDetails => ({ name: '', phone: '', address: '', preferredDate: '', comment: '', photos: [] })
const countItems = (items: CartItem[]) => items.reduce((sum, item) => sum + item.configuration.quantity, 0)
function itemsLabel(count: number) {
  const last = count % 10, hundred = count % 100
  return `${count} ${hundred >= 11 && hundred <= 14 ? 'предметов' : last === 1 ? 'предмет' : last >= 2 && last <= 4 ? 'предмета' : 'предметов'}`
}
function initialOrder() {
  const id = new URLSearchParams(location.search).get('order')
  return id ? getDemoOrder(id) : null
}
const dateLabel = (value: string) => new Intl.DateTimeFormat('ru-KZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00'))

function useBookingFlow(live?:LiveData) {
  const [embedded] = useState(() => {
    const params = new URLSearchParams(location.search)
    return { enabled: !live && params.get('embed') === 'marketing', stage: params.get('stage') ?? 'catalog', model: params.get('model') ?? 'sofa-2-seater' }
  })
  const [assets, setAssets] = useState<FurnitureAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [order, setOrder] = useState<DemoOrder | null>(()=>live||embedded.enabled?null:initialOrder())
  const [receipt,setReceipt]=useState<{reference:string;total:number}|null>(null)
  const [consented,setConsented]=useState(false)
  const [quoted,setQuoted]=useState<number|null>(null)
  const [step, setStep] = useState<Step>(() => order ? 'success' : embedded.enabled && embedded.stage === 'request' ? 'contact' : 'catalog')
  const [cart, setCart] = useState<CartItem[]>(() => embedded.enabled
    ? embedded.stage === 'request' ? [{ id: 'marketing-preview', configuration: defaultConfiguration('sofa-2-seater') }] : []
    : live?[]:readBasket())
  const [selected, setSelected] = useState<{ asset: FurnitureAsset; item: CartItem | null } | null>(null)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [customer, setCustomer] = useState<CustomerDetails>(emptyCustomer)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [preparingPhotos, setPreparingPhotos] = useState(false)
  const [toast, setToast] = useState('')
  const opener = useRef<HTMLElement | null>(null)
  const submitLock = useRef(false)
  const embeddedOpened = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const recent = useMemo(() => live||embedded.enabled ? undefined : readDemoOrders().at(-1), [order, embedded.enabled,live])
  const groups=live?[{id:'all',name:'Всё',types:[]},...live.categories.map(v=>({...v,types:[v.id]}))]:categories
  const availableCart=live?cart.filter(v=>Object.hasOwn(live.pricing.basePrices,v.configuration.modelId)):cart
  const total = quoted??calculateCartTotal(availableCart,live?.pricing), quantity = countItems(availableCart)
  useEffect(()=>{
    let current=true;setQuoted(null)
    if(live&&!live.preview&&step==='cart'&&availableCart.length){
      live.quote(availableCart).then(amount=>{if(current)setQuoted(amount)}).catch(e=>{if(current){setConsented(false);setToast(e instanceof Error?e.message:'Не удалось проверить стоимость.')}})
    }
    return()=>{current=false}
  },[cart,step,live?.pricing.version])
  const filtered = useMemo(() => {
    const filter = groups.find((value) => value.id === category)??groups[0]
    const search = query.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim()
    return assets.filter((asset) => (!filter.types.length || filter.types.includes(asset.category)) && asset.name.toLocaleLowerCase('ru').replaceAll('ё', 'е').includes(search))
  }, [assets, category, query,live])

  useEffect(() => {
    document.title = (live?.company.name??'ЧистоДом')+' — услуги и цены | EndQuote'
    if (location.pathname === '/' || location.pathname === '/clean/chistodom') history.replaceState(null, '', '/chistodom' + location.search + location.hash)
    const abort = new AbortController()
    setLoading(true); setLoadError('')
    fetch('/manifest.json', { signal: abort.signal }).then((response) => {
      if (!response.ok) throw new Error('Коллекция временно недоступна.')
      return response.json() as Promise<unknown>
    }).then((value) => {
      if (!Array.isArray(value) || !value.length || !value.every(isFurnitureAsset)) throw new Error('Не удалось прочитать каталог мебели.')
      if (!live&&value.some((asset) => !Object.hasOwn(DEMO_PRICING.basePrices, asset.id))) throw new Error('Для части коллекции пока не настроены цены.')
      setAssets(live?value.flatMap(a=>{const m=live.models.find(m=>m.id===a.id);return m?[{...a,name:m.name,category:m.category}]:[]}):value)
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить мебель.')
    }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [attempt,live?.pricing.version])
  useEffect(() => { if (!live&&!embedded.enabled) saveBasket(cart) }, [cart, embedded.enabled,live])
  useEffect(() => {
    if (!embedded.enabled || embeddedOpened.current || !['model', 'price'].includes(embedded.stage)) return
    const asset = assets.find((value) => value.id === embedded.model) ?? assets.find((value) => value.id === 'sofa-2-seater')
    if (!asset) return
    embeddedOpened.current = true
    setSelected({ asset, item: null })
  }, [assets, embedded])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(timer)
  }, [toast])
  const go = useCallback((next: Step) => {
    if (next === 'catalog') submitLock.current = false
    if (next === 'catalog' && new URLSearchParams(location.search).has('order')) {
      const params = new URLSearchParams(location.search)
      params.delete('order')
      history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''))
    }
    setStep(next); setToast(''); window.scrollTo({ top: 0, behavior: 'instant' })
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
  }, [])
  function configure(asset: FurnitureAsset, item: CartItem | null = null) {
    opener.current = document.activeElement as HTMLElement | null
    setSelected({ asset, item })
  }
  function closeConfig() {
    setSelected(null)
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
  }
  function save(configuration: ItemConfiguration) {
    const editing = selected?.item
    setCart((items) => editing ? items.map((item) => item.id === editing.id ? { ...item, configuration } : item) : [...items, { id: crypto.randomUUID(), configuration }])
    setToast(editing ? 'Изменения сохранены' : 'Мебель добавлена в заказ')
    closeConfig()
  }
  async function submit() {
    if (submitLock.current || preparingPhotos || embedded.enabled || live?.preview) return
    if(live&&!consented){setSubmitError('Подтвердите согласие на обработку заявки.');return}
    submitLock.current = true; setSubmitting(true); setSubmitError('')
    try {
      if(live){
        const result=await live.submit(availableCart,customer)
        setReceipt(result);setCart([]);setCustomer(emptyCustomer());go('success');return
      }
      const created = submitDemoOrder({ ...customer, name: customer.name.trim(), address: customer.address.trim(), comment: customer.comment.trim() }, cart)
      setOrder(created); setCart([])
      const params = new URLSearchParams(embedded.enabled ? 'embed=marketing' : '')
      params.set('order', created.id)
      history.replaceState(null, '', `${location.pathname}?${params}`)
      go('success')
    } catch (error) { submitLock.current = false;setConsented(false); setSubmitError(error instanceof Error ? error.message : 'Не удалось сохранить заявку. Попробуйте ещё раз.') }
    finally { setSubmitting(false) }
  }
  function returnToServices() {
    if(live){live.restart();return}
    submitLock.current = false
    setOrder(null); setCustomer(emptyCustomer()); setSubmitError('')
    history.replaceState(null, '', location.pathname + (embedded.enabled ? '?embed=marketing' : '')); go('catalog')
  }
  const stickyVisible = cart.length > 0 && ['catalog', 'cart', 'contact'].includes(step)
  return {
    categories:groups, live:!!live,preview:live?.preview??false,receipt,consented,setConsented,itemsLabel, embedded, assets, loading, loadError, setAttempt, order, setOrder, step, go, cart:availableCart, setCart,
    selected, configure, closeConfig, save, category, setCategory, query, setQuery, filtered,
    customer, setCustomer, submit, submitError, setSubmitError, submitting, preparingPhotos,
    setPreparingPhotos, toast, setToast, heading, recent, total, quantity, returnToServices, stickyVisible,
  }
}

export type BookingFlow = ReturnType<typeof useBookingFlow>

export default function BookingApp({live}:{live?:LiveData}={}) {
  const flow = useBookingFlow(live)
  // The approved homepage embeds the original compact interface. Only the
  // standalone company storefront uses the new shopping experience.
  if (flow.embedded.enabled) return <EmbeddedBooking flow={flow} />
  return <StoreContext.Provider value={live??{company:DEMO_COMPANY,pricing:DEMO_PRICING,preview:false,live:false}}><Suspense fallback={<p role="status" style={{ padding: 24 }}>Открываем витрину…</p>}><CustomerStorefront flow={flow} /></Suspense></StoreContext.Provider>
}

function EmbeddedBooking({ flow }: { flow: BookingFlow }) {
  const {
    embedded, assets, loading, loadError, setAttempt, order, setOrder, step, go, cart, setCart,
    selected, configure, closeConfig, save, category, setCategory, query, setQuery, filtered,
    customer, setCustomer, submit, submitError, setSubmitError, submitting, preparingPhotos,
    setPreparingPhotos, toast, setToast, heading, recent, total, quantity, returnToServices, stickyVisible,
  } = flow
  return <div className={`booking-app ${stickyVisible ? 'has-sticky' : ''}`}>
    <div inert={selected !== null}>
      <header className="booking-header storefront-header"><div className="booking-wide booking-header-inner"><a href="/chistodom" className="storefront-platform" onClick={(event) => { event.preventDefault(); go('catalog') }} aria-label="EndQuote — к услугам ЧистоДом">EndQuote<span>услуги рядом</span></a><div className="storefront-header-actions"><span className="booking-demo-pill"><span />Демо-витрина</span><button className="storefront-basket-button" aria-label="Открыть корзину" onClick={() => go('cart')}><ShoppingBag size={18} />{quantity > 0 && <span>{quantity}</span>}</button></div></div></header>
      <main className={`booking-main ${step === 'catalog' ? 'is-catalog' : ''}`}>
        {step !== 'catalog' && step !== 'success' && <div className="booking-top-navigation"><button className="booking-back" onClick={() => go(step === 'contact' ? 'cart' : 'catalog')}><ArrowLeft size={17} />{step === 'contact' ? 'К заказу' : 'К услугам'}</button><span className="storefront-checkout-label">Услуги<ChevronRight size={12} />{step === 'contact' ? 'Контакты' : 'Ваш заказ'}</span></div>}
        {step === 'catalog' && <BusinessProfile business={DEMO_COMPANY} />}

        {step === 'catalog' && <section className="booking-catalog">
          <div className="booking-page-heading"><h2 ref={heading} tabIndex={-1}>Услуги и цены<span className="booking-title-count">{assets.length || '—'}</span></h2><p>Выберите мебель и настройте чистку под себя.</p></div>
          <div className="booking-catalog-toolbar"><div className="booking-categories" role="group" aria-label="Категории мебели">{categories.map((filter) => <button key={filter.id} aria-pressed={category === filter.id} className={category === filter.id ? 'active' : ''} onClick={() => setCategory(filter.id)}>{filter.name}</button>)}</div><label className="booking-search"><Search size={17} /><input type="search" aria-label="Найти мебель" placeholder="Например, диван" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15} /></button>}</label></div>
          {loading ? <div className="booking-catalog-grid" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div className="booking-catalog-skeleton animate-pulse" key={index} />)}</div> : loadError ? <div className="booking-empty" role="alert"><Info size={27} /><h2>Не удалось открыть каталог</h2><p>{loadError}</p><button className="booking-secondary" onClick={() => setAttempt((value) => value + 1)}>Попробовать снова</button></div> : filtered.length ? <div className="booking-catalog-grid">{filtered.map((asset) => {
            const inCart = cart.filter((item) => item.configuration.modelId === asset.id).reduce((sum, item) => sum + item.configuration.quantity, 0)
            return <button className="booking-furniture-card" key={asset.id} data-testid={`booking-card-${asset.id}`} onClick={() => configure(asset)} aria-label={`Настроить ${asset.name}`}><div className="booking-card-picture"><img src={asset.preview} alt={asset.name} width="512" height="512" loading="lazy" decoding="async" draggable="false" /><span className="booking-card-3d"><Box size={11} />3D</span>{inCart > 0 && <span className="booking-card-count"><Check size={11} />{inCart} в заказе</span>}</div><div className="booking-card-details"><h2>{asset.name}</h2><div><span>от <strong>{formatMoney(DEMO_PRICING.basePrices[asset.id])}</strong></span><span className="booking-card-add"><Plus size={19} /></span></div></div></button>
          })}</div> : <div className="booking-empty"><Search size={27} /><h2>Такой мебели пока не нашлось</h2><p>Попробуйте другое название или категорию.</p><button className="booking-secondary" onClick={() => { setCategory('all'); setQuery('') }}>Показать всю мебель</button></div>}
          <p className="booking-catalog-note"><ShieldCheck size={15} />Можно просто посмотреть цены — оформлять заказ необязательно.</p>
          {recent && <button className="booking-recent storefront-recent-order" onClick={() => { setOrder(recent); history.replaceState(null, '', `${location.pathname}?order=${recent.id}`); go('success') }}><CheckCheck size={17} /><span>Ваша демо-заявка {recent.number}<small>{formatMoney(recent.total)} · Сохранена в этом браузере</small></span><ChevronRight size={17} /></button>}
        </section>}

        {step === 'cart' && <section className="booking-checkout-section"><div className="booking-page-heading"><span className="booking-eyebrow">Всё в одном месте</span><h1 ref={heading} tabIndex={-1}>Ваш заказ<span className="booking-title-count">{quantity}</span></h1><p>Проверьте детали — ничего не забыли?</p></div>{cart.length ? <><OrderItems items={cart} assets={assets} onEdit={configure} onRemove={(item) => { setCart((items) => items.filter((value) => value.id !== item.id)); setToast('Предмет удалён из заказа') }} /><button className="booking-add-more" onClick={() => go('catalog')}><Plus size={18} />Добавить ещё мебель</button><div className="booking-total-card"><div><span>Предварительная стоимость</span><strong data-testid="cart-total">{formatMoney(total)}</strong></div><p>Точная цена зависит от состояния и материала мебели. Её нужно согласовать с исполнителем до начала работ.</p></div></> : <div className="booking-empty"><ShoppingBag size={32} /><h2>Здесь пока пусто</h2><p>Добавьте мебель, которую хотите почистить.</p><button className="booking-primary" onClick={() => go('catalog')}>Выбрать мебель<ArrowRight size={17} /></button></div>}</section>}

        {step === 'contact' && <section className="booking-checkout-section"><div className="booking-page-heading"><span className="booking-eyebrow">Последний шаг</span><h1 ref={heading} tabIndex={-1}>Куда приедем?</h1><p>Оставьте контакты и удобную дату.<br />Сейчас это демо: данные останутся в вашем браузере.</p></div><ContactForm customer={customer} onChange={(value) => { setCustomer(value); setSubmitError('') }} onSubmit={submit} submitError={submitError} onPreparing={setPreparingPhotos} /><p className="booking-contact-summary"><ShoppingBag size={15} />{itemsLabel(quantity)} на {formatMoney(total)}<button onClick={() => go('cart')}>Изменить</button></p></section>}

        {step === 'success' && order && <section className="booking-success"><div className="booking-success-mark"><Check size={35} strokeWidth={1.8} /><span><Sparkles size={14} /></span></div><span className="booking-eyebrow">Всё получилось</span><h1 ref={heading} tabIndex={-1}>Заявка сохранена</h1><p className="booking-success-intro">Спасибо, {order.customer.name}! Ваши пожелания<br />собраны в одной демо-заявке.</p><span className="booking-order-number">{order.number}</span><div className="booking-demo-notice"><Info size={18} /><span>Это демонстрация. Заявка сохранена только в этом браузере и не отправлена в «ЧистоДом».</span></div><div className="booking-success-details"><h2>Детали заявки</h2><div><Home size={17} /><span>{order.customer.address}</span></div><div><CalendarDays size={17} /><span>{dateLabel(order.customer.preferredDate)}<small>Желаемая дата</small></span></div><div><CheckCheck size={17} /><span>{order.customer.name} · {order.customer.phone}</span></div>{order.customer.comment && <p>{order.customer.comment}</p>}{order.customer.photos.length > 0 && <div className="booking-success-photos">{order.customer.photos.map((photo) => <img key={photo.id} src={photo.dataUrl} alt={photo.name} />)}</div>}</div><OrderItems items={order.items} assets={assets} /><div className="booking-success-total"><span>Предварительная стоимость</span><strong>{formatMoney(order.total)}</strong></div><p className="booking-saved-note"><ShieldCheck size={15} />Заявка доступна после обновления страницы в этом браузере.</p><button className="booking-primary" onClick={returnToServices}>Вернуться к услугам<ArrowRight size={18} /></button></section>}
      </main>
      <footer className="booking-site-footer"><span>С заботой о вашем доме <Leaf size={12} /></span><span>Работает на <strong>EndQuote</strong></span></footer>
      {stickyVisible && <div className="booking-sticky"><div><span>{quantity ? itemsLabel(quantity) : 'Выберите мебель'}</span><strong>{formatMoney(total)}</strong><small>Предварительно</small></div>{step === 'contact' ? <button key="submit-request" className="booking-primary" type="submit" form="booking-contact" disabled={submitting || preparingPhotos || !cart.length}>{submitting ? 'Сохраняем…' : 'Отправить демо-заявку'}{submitting ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowRight size={17} />}</button> : <button key="navigate-checkout" type="button" className="booking-primary" disabled={!cart.length} onClick={(event) => { event.preventDefault(); go(step === 'catalog' ? 'cart' : 'contact') }}>{step === 'catalog' ? 'Перейти к заказу' : 'Перейти к контактам'}<ArrowRight size={17} /></button>}</div>}
      {toast && <div className="booking-toast" role="status"><Check size={16} />{toast}</div>}
    </div>
    {selected && <Configurator key={selected.item?.id ?? selected.asset.id} asset={selected.asset} initial={selected.item?.configuration ?? null} startAtOptions={embedded.enabled && embedded.stage === 'price'} onSave={save} onClose={closeConfig} />}
  </div>
}
