import { useEffect, useRef, useState } from 'react'
import { ChartNoAxesColumn, Check, ChevronRight, ChevronsUpDown, CreditCard, Ellipsis, Inbox, Layers2, LogOut, Menu, Settings2, Store, UserRound, X } from 'lucide-react'
import { accessInfo, useResource, type Business, type Provider, type Status, statuses } from './data'
import { Brand, BusinessAvatar, LoadError, Loading, Modal, Notice, PreviewLink } from './ui'
import Overview from './Overview'
import Orders, { OrderDrawer } from './Orders'
import Pricing from './Pricing'
import Storefront from './Storefront'
import { Account, Subscription } from './Settings'

const pages = {
  overview: { label: 'Обзор', icon: ChartNoAxesColumn }, orders: { label: 'Заявки', icon: Inbox },
  pricing: { label: 'Услуги и цены', icon: Layers2 }, storefront: { label: 'Витрина', icon: Store },
  subscription: { label: 'Подписка', icon: CreditCard }, account: { label: 'Аккаунт', icon: Settings2 },
}
type Page = keyof typeof pages
const mainPages: Page[] = ['overview', 'orders', 'pricing', 'storefront']
function readRoute() {
  const [name, filter] = location.hash.slice(1).split('/')
  return { page: (Object.hasOwn(pages, name) ? name : 'overview') as Page, status: statuses.includes(filter as Status) ? filter as Status : '' as const }
}
type Props = {
  providers: Provider[]; email: string; logout: () => void; signingOut: boolean; created?: Business
  dismissCreated: () => void; refreshSession: () => Promise<void>
}
export default function Workspace(props: Props) {
  const profile = useResource<Business>('owner/profile')
  const initial = profile.data ?? props.created
  if (!initial) return <main className="ow-boot"><Brand />{profile.error
    ? <LoadError error={profile.error} retry={profile.retry} /> : <Loading label="Загружаем данные компании…" />}</main>
  return <Dashboard {...props} initial={initial} />
}
function Dashboard({ initial, providers, email, logout, signingOut, created, dismissCreated, refreshSession }: Props & { initial: Business }) {
  const [business, setBusiness] = useState(initial)
  const [route, setRoute] = useState(readRoute)
  const [visited, setVisited] = useState<Set<Page>>(() => new Set([route.page]))
  const [menu, setMenu] = useState(false), [selected, setSelected] = useState<string>()
  const [orderVersion, setOrderVersion] = useState(0)
  const content = useRef<HTMLElement>(null)
  const { page } = route
  const access = accessInfo(business)
  const refreshOrders = () => setOrderVersion(n => n + 1)
  useEffect(() => {
    function navigate() {
      const next = readRoute()
      setRoute(next)
      setVisited(prev => prev.has(next.page) ? prev : new Set([...prev, next.page]))
      setMenu(false)
      setSelected(undefined)
      content.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  useEffect(() => { document.title = pages[page].label + ' · EndQuote' }, [page])
  function navLink(key: Page, short?: string) {
    const { label, icon: Icon } = pages[key]
    return <a key={key} className={'ow-nav-link' + (page === key ? ' is-current' : '')} href={'#' + key}
      aria-label={label} aria-current={key === page ? 'page' : undefined} onClick={() => setMenu(false)}>
      <Icon size={18} /><span>{short ?? label}</span></a>
  }
  const group = mainPages.includes(page) ? 'Рабочее пространство' : 'Настройки'
  const closeMenu = () => setMenu(false)
  const side = <>
    <WorkspaceMenu business={business} email={email} close={closeMenu} />
    <nav className="ow-side-nav" aria-label="Разделы кабинета">
      <p>Рабочее пространство</p>{mainPages.map(key => navLink(key))}
      <p>Настройки</p>{navLink('account')}{navLink('subscription')}
    </nav>
    <div className="ow-side-bottom">
      <Brand />
      <div className="ow-user-row"><a href="#account" onClick={closeMenu}><span className="ow-user-icon"><UserRound size={14} /></span><span>{email}</span></a>
        <button className="ow-icon-btn" disabled={signingOut} aria-label="Выйти" title="Выйти" onClick={logout}><LogOut size={15} /></button></div>
    </div>
  </>
  return <div className="ow-shell">
    <a href="#ow-content" className="ow-skip" onClick={e => { e.preventDefault(); content.current?.focus() }}>К содержимому</a>
    <aside className="ow-sidebar">{side}</aside>
    <div className="ow-work">
      <header className="ow-topbar">
        <button className="ow-mobile-trigger ow-icon-btn" aria-label="Открыть меню" aria-haspopup="dialog" onClick={() => setMenu(true)}><Menu size={17} /></button>
        <div className="ow-crumb"><BusinessAvatar business={business} /><strong title={business.name}>{business.name}</strong><ChevronRight size={12} /><span>{group}</span></div>
        <PreviewLink />
      </header>
      <main className="ow-content" id="ow-content" tabIndex={-1} ref={content}>
        {!access.active && page !== 'subscription' && <Notice kind="info">Срок доступа истёк. Данные доступны для просмотра. <a className="ow-text-link" href="#subscription">О подписке</a></Notice>}
        {created && !business.published && page === 'overview' && <div className="ow-created" role="status"><span className="ow-tile-icon"><Store size={20} /></span>
          <div><strong>Витрина создана</strong><p>Проверьте цены и опубликуйте витрину, чтобы принимать заявки.</p></div>
          <button className="ow-icon-btn" onClick={dismissCreated} aria-label="Скрыть сообщение"><X size={16} /></button></div>}
        {page === 'overview' && <Overview business={business} version={orderVersion} open={setSelected} selected={selected} refresh={refreshOrders} />}
        {page === 'orders' && <Orders filter={route.status} version={orderVersion} open={setSelected} selected={selected} refresh={refreshOrders} />}
        {visited.has('pricing') && <section hidden={page !== 'pricing'}><Pricing business={business} active={page === 'pricing'} onRevision={catalogRevision => setBusiness(prev => ({ ...prev, catalogRevision }))} /></section>}
        {visited.has('storefront') && <section hidden={page !== 'storefront'}><Storefront business={business} setBusiness={setBusiness} /></section>}
        {page === 'subscription' && <Subscription business={business} />}
        {page === 'account' && <Account providers={providers} refreshSession={refreshSession} />}
      </main>
    </div>
    <nav className="ow-bottom-nav" aria-label="Быстрая навигация">{navLink('overview')}{navLink('orders')}{navLink('pricing','Цены')}
      <button onClick={() => setMenu(true)} className={'ow-nav-link' + (!['overview','orders','pricing'].includes(page) ? ' is-current' : '')} aria-haspopup="dialog"><Ellipsis size={20} /><span>Ещё</span></button></nav>
    {menu && <Modal drawer title="Меню кабинета" onClose={() => setMenu(false)}><div className="ow-mobile-menu">{side}</div></Modal>}
    {selected && <OrderDrawer id={selected} editable={access.active} close={() => setSelected(undefined)} onChange={refreshOrders} />}
  </div>
}


function WorkspaceMenu({ business, email, close }: { business: Business; email: string; close: () => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  function navigate() { setOpen(false); close() }
  return <div className="ow-workspace-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
  }}>
    <button ref={trigger} className="ow-company" aria-expanded={open} onClick={() => setOpen(!open)}>
      <BusinessAvatar business={business} /><strong>{business.name}</strong><ChevronsUpDown size={13} />
    </button>
    {open && <div className="ow-workspace-pop">
      <small>{email}</small><div className="ow-workspace-identity"><BusinessAvatar business={business} />
        <div><strong>{business.name}</strong><small>{business.city}</small></div><Check size={14} /></div>
      <a href="#storefront" onClick={navigate}><Store size={15} />Настройки компании</a>
      <a href="#account" onClick={navigate}><UserRound size={15} />Мой аккаунт</a>
    </div>}
  </div>
}
