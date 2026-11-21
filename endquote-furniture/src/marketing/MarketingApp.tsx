import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, Globe2, Link2, Menu, X } from 'lucide-react'
import { MARKETING, SUBSCRIPTION_PLANS, whatsappLink } from './content'
import Workflow from './Workflow'
import { Logo, Modal, QuoteMark, SectionLabel } from './ui'
import { api } from '../owner/api'
import './marketing.css'

const HeroSofa = lazy(() => import('./HeroSofa'))

class HeroArtwork extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return null
    return <div className="eq-hero-art" aria-hidden="true">
      <Suspense fallback={null}><HeroSofa /></Suspense>
    </div>
  }
}

const navigation = [
  { href: '#how-it-works', label: 'Как это работает' },
  { href: '#pricing', label: 'Тарифы' },
]
const external = { target: '_blank', rel: 'noopener noreferrer' } as const
type OwnerAction = { label: string; href: string }
function Header({ action, authenticated }: { action: OwnerAction; authenticated: boolean }) {
  const [open, setOpen] = useState(false)
  const [overDark, setOverDark] = useState(false)
  const header = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus() } }
    const size = matchMedia('(min-width: 881px)')
    const resize = () => { if (size.matches) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    size.addEventListener('change', resize)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      size.removeEventListener('change', resize)
    }
  }, [open])
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const hero = document.querySelector<HTMLElement>('.eq-hero')
        const headerHeight = header.current?.offsetHeight ?? 72
        setOverDark(!hero || hero.getBoundingClientRect().bottom <= headerHeight)
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return <header className={`eq-header${overDark ? ' eq-header--dark' : ''}`} ref={header}>
    <div className="eq-container eq-header-row">
      <Logo />
      <nav className="eq-desktop-nav" aria-label="Навигация по странице">{navigation.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <div className="eq-header-actions">
        <a className="eq-header-cta eq-header-demo" href={MARKETING.demo} aria-label="Попробовать демо"><span className="eq-cta-label">Попробовать демо</span><span className="eq-cta-short">Демо</span><ArrowUpRight size={15} /></a>
        {!authenticated && <a className="eq-header-cta" href="/owner/login">Войти</a>}
        <a className="eq-header-cta" href={action.href}>{action.label}</a>
        <button ref={toggle} type="button" className="eq-menu-toggle" aria-label={open ? 'Закрыть меню' : 'Открыть меню'} aria-controls="eq-mobile-nav" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </div>
    {open && <nav className="eq-mobile-nav" id="eq-mobile-nav" aria-label="Мобильная навигация">
      {navigation.map(link => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}<ArrowUpRight size={15} /></a>)}
      {!authenticated && <a href="/owner/login">Войти<ArrowUpRight size={15} /></a>}
      <a href={action.href}>{action.label}<ArrowUpRight size={15} /></a>
      <a href={MARKETING.demo}>Попробовать демо<ArrowUpRight size={15} /></a>
      <a href={whatsappLink()} {...external} onClick={() => setOpen(false)}>Связаться с командой<ArrowUpRight size={15} /></a>
    </nav>}
  </header>
}

function Channels() {
  return <aside className="eq-channel-rail" aria-label="Где можно разместить ссылку">
    <div className="eq-container eq-channel-row">
      <span className="eq-channel-caption"><Link2 size={16} /><span>Одна ссылка для</span></span>
      <div className="eq-channel"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.9" /><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.9" /><circle cx="17.6" cy="6.8" r="1.2" fill="currentColor" /></svg><span>Instagram</span></div>
      <div className="eq-channel"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M19.6 14.1c-.4-.2-2.1-1-2.4-1.2-.4-.1-.6-.2-.9.2l-1 1.2c-.2.2-.4.2-.8.1-1.7-.8-3.2-2-4.2-3.6-.3-.4.3-.7.9-1.6.2-.3.1-.5.1-.7L10.1 6c-.2-.6-.5-.6-.8-.6h-.7C8.3 5.4 7 6.6 7 8.5s1.4 3.6 1.7 4c.2.3 2.7 4.2 6.7 5.7 2 .9 3.8.8 4.6-.5.4-.6.5-1.4.4-1.6-.1-.3-.4-.4-.8-.6z" transform="translate(-.4 .3) scale(.89)" /><path d="M3.6 18.1a9.7 9.7 0 1 1 3.1 3l-5.3 1.5 1.5-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg><span>WhatsApp</span></div>
      <div className="eq-channel"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.4 2h-4v13.4a2.9 2.9 0 1 1-2.5-2.8v-4a6.9 6.9 0 1 0 6.5 6.9V8.4a9.7 9.7 0 0 0 5.5 1.7v-4a5.6 5.6 0 0 1-5.5-4.1Z" /></svg><span>TikTok</span></div>
      <div className="eq-channel eq-channel-web"><Globe2 strokeWidth={1.65} /><span>Вашего сайта</span></div>
    </div>
  </aside>
}

const subscriptionFeatures = [
  'Витрина по вашей ссылке',
  '3D-расчёт стоимости услуг',
  'Свои услуги и настройка цен',
  'Заявки в личном кабинете',
] as const

const formatPrice = (value: number) => new Intl.NumberFormat('ru-RU').format(value)

function Pricing() {
  const monthlyBase = SUBSCRIPTION_PLANS[0].total
  return <section id="pricing" className="eq-pricing-section eq-section" aria-labelledby="eq-pricing-title">
    <div className="eq-container eq-pricing">
      <div className="eq-pricing-copy">
        <SectionLabel index="02">Подписка EndQuote</SectionLabel>
        <h2 id="eq-pricing-title">Один продукт.<br /><em>Три тарифа.</em></h2>
        <p>Все возможности EndQuote доступны на любом тарифе. Выберите срок — чем он дольше, тем выгоднее.</p>
      </div>
      <div className="eq-plan-grid">
        {SUBSCRIPTION_PLANS.map((plan, index) => {
          const saved = monthlyBase * plan.months - plan.total
          const discount = Math.round(saved / (monthlyBase * plan.months) * 100)
          return <article className={`eq-plan-card${plan.recommended ? ' eq-plan-card--recommended' : ''}`} key={plan.key}>
            <div className="eq-plan-topline">
              <span className="eq-plan-index">0{index + 1} / Подписка</span>
              {plan.recommended && <span className="eq-plan-badge">Популярный</span>}
            </div>
            <h3>{plan.title}</h3>
            <div className="eq-plan-rate"><strong>{formatPrice(Math.round(plan.total / plan.months))} ₸</strong><span>/ мес.</span></div>
            <p className="eq-plan-rate-caption">{plan.months === 1 ? 'Оплата помесячно' : 'В пересчёте на месяц'}</p>
            <div className="eq-plan-total">
              <span>К оплате за {plan.term}</span>
              <strong>{formatPrice(plan.total)} ₸</strong>
            </div>
            <div className="eq-plan-saving">
              {saved > 0 ? <><span>Экономия {formatPrice(saved)} ₸</span><span className="eq-plan-discount">−{discount}%</span></> : <span>Без долгосрочных обязательств</span>}
            </div>
            <ul className="eq-plan-features">
              {subscriptionFeatures.map(feature => <li key={feature}><Check size={17} strokeWidth={1.9} aria-hidden="true" /><span>{feature}</span></li>)}
            </ul>
            <a className="eq-plan-action" href={whatsappLink(`Здравствуйте! Хочу подключить EndQuote на ${plan.term} за ${formatPrice(plan.total)} ₸. Подскажите, как оформить подписку.`)} {...external} aria-label={`Запросить подключение EndQuote: ${plan.title}`}>
              Запросить подключение <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </article>
        })}
      </div>
      <div className="eq-pricing-foot">
        <p><Check size={15} aria-hidden="true" /> Все функции включены в каждый тариф.</p>
        <p>Подключение и оплата согласовываются вручную. Автоматических списаний нет.</p>
      </div>
    </div>
  </section>
}

type Legal = 'privacy' | 'terms'
function Footer() {
  const [legal, setLegal] = useState<Legal | null>(null)
  return <footer className="eq-footer">
    <div className="eq-container">
      <div className="eq-footer-main">
        <div><Logo /><p>Ваши услуги. Ваши цены.<br />Одна ссылка в профиле.</p></div>
        <div className="eq-footer-column"><strong>Продукт</strong><a href="#how-it-works">Как это работает</a><a href={MARKETING.demo}>Клиентское демо</a><a href="#pricing">Тарифы</a></div>
        <div className="eq-footer-column"><strong>Связаться</strong><a href={`mailto:${MARKETING.email}`}>{MARKETING.email}<ArrowUpRight size={12} /></a><a href={whatsappLink()} {...external}>+7 (708) 805-65-48<ArrowUpRight size={12} /></a></div>
        <a className="eq-up" href="#top" aria-label="В начало страницы"><ArrowUp size={18} /></a>
      </div>
      <div className="eq-footer-base"><span>© {new Date().getFullYear()} EndQuote</span><div><button onClick={() => setLegal('privacy')}>Конфиденциальность</button><button onClick={() => setLegal('terms')}>Условия использования</button></div></div>
    </div>
    {legal && <Modal titleId="eq-legal-title" onClose={() => setLegal(null)} className="eq-legal">
      <span className="eq-section-label"><i />Перед запуском</span>
      <h2 id="eq-legal-title">{legal === 'privacy' ? 'Политика конфиденциальности' : 'Условия использования'}</h2>
      <p>Документ готовится к публикации. Подключение подписки согласовывается с командой; автоматической оплаты на сайте нет.</p>
      <p>В клиентском демо заявки сохраняются только в браузере. Они не отправляются компании или команде EndQuote.</p>
      <a href={`mailto:${MARKETING.email}`} className="eq-text-link">Задать вопрос о продукте<ArrowUpRight size={15} /></a>
    </Modal>}
  </footer>
}

export default function MarketingApp() {
  const [authenticated, setAuthenticated] = useState(false)
  useEffect(() => {
    let active = true
    const refresh = () => api<{ owner: unknown }>('auth/session')
      .then(session => { if (active) setAuthenticated(Boolean(session.owner)) })
      .catch(() => { if (active) setAuthenticated(false) })
    const restored = (event: PageTransitionEvent) => { if (event.persisted) void refresh() }
    void refresh()
    window.addEventListener('pageshow', restored)
    return () => { active = false; window.removeEventListener('pageshow', restored) }
  }, [])
  const action = authenticated ? { label: 'Личный кабинет', href: '/owner' } : { label: 'Начать бесплатно', href: '/owner/register' }
  return <div className="eq-page" id="top">
    <a className="eq-skip" href="#main">Перейти к содержанию</a>
    <Header action={action} authenticated={authenticated} />
    <main id="main">
      <section className="eq-hero" aria-labelledby="eq-hero-title">
        <h1 id="eq-hero-title"><span>Ваши услуги.</span>{' '}<span>Ваши цены.</span>{' '}<em>Одна ссылка.</em></h1>
        <HeroArtwork />
        <div className="eq-container eq-hero-bottom">
          <p className="eq-hero-intro">Каталог услуг, расчёт стоимости и&nbsp;заявки по&nbsp;одной ссылке.</p>
          <a className="eq-hero-learn" href="#how-it-works">Как это работает<ArrowDown size={16} strokeWidth={1.6} /></a>
        </div>
      </section>
      <Channels />
      <Workflow />
      <Pricing />
      <section className="eq-close-section">
        <div className="eq-container eq-close-card">
          <div><span className="eq-section-label"><i />Попробуйте EndQuote</span>
            <h2>Ваша витрина начинается<br />с одной ссылки.</h2>
            <div className="eq-close-links"><a className="eq-button eq-ink-button" href={MARKETING.demo}>Посмотреть демо<ArrowRight size={17} /></a><a className="eq-text-link" href={action.href}>{action.label}<ArrowUpRight size={15} /></a></div>
          </div>
          <div className="eq-close-art" aria-hidden="true"><QuoteMark /></div>
        </div>
      </section>
    </main>
    <Footer />
  </div>
}
