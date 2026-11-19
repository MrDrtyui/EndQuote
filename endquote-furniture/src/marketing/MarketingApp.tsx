import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, Clock3, Globe2, Link2, ListChecks, Mail, Menu, MessageSquareText, Plus, Smartphone, X } from 'lucide-react'
import { FAQ, MARKETING, whatsappLink } from './content'
import StudioPreview from './StudioPreview'
import Workflow from './Workflow'
import ClientDemo from './ClientDemo'
import { Logo, Modal, QuoteMark, SectionLabel } from './ui'
import { api } from '../owner/api'
import './marketing.css'

const navigation = [
  { href: '#features', label: 'Возможности' },
  { href: '#how-it-works', label: 'Как это работает' },
  { href: '#pricing', label: 'Тарифы' },
  { href: '#faq', label: 'FAQ' },
]
const external = { target: '_blank', rel: 'noopener noreferrer' } as const
const benefits = [
  { icon: MessageSquareText, title: 'Цены без переписки', text: 'Клиент заранее видит стоимость и состав услуги. Разговор начинается с конкретики.' },
  { icon: ListChecks, title: 'Все детали в заявке', text: 'Какая мебель, сколько предметов, куда приехать — не нужно собирать по сообщениям.' },
  { icon: Smartphone, title: 'Удобно с телефона', text: 'Каталог, расчёт и заявка открываются в браузере. Без установки приложения.' },
]

type OwnerAction = { label: string; href: string }
function Header({ action, authenticated }: { action: OwnerAction; authenticated: boolean }) {
  const [open, setOpen] = useState(false)
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
  return <header className="eq-header" ref={header}>
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

function Pricing({ action }: { action: OwnerAction }) {
  return <section id="pricing" className="eq-pricing-section eq-section">
    <div className="eq-container eq-pricing">
      <div className="eq-pricing-copy">
        <SectionLabel index="04">Ранний доступ</SectionLabel>
        <h2>Начнём с вашего<br /><em>бизнеса.</em></h2>
        <p>Сейчас фокусируемся на химчистке мебели. Хотим понять задачи мастеров и небольших компаний, прежде чем открывать подписки.</p>
        <a className="eq-text-link" href={whatsappLink('Здравствуйте! Хочу обсудить ранний доступ к EndQuote для моего бизнеса.')} {...external}>Расскажите о своей работе<ArrowUpRight size={15} /></a>
      </div>
      <article className="eq-access-card">
        <div className="eq-access-kicker"><span><i className="eq-status-dot" />ГОТОВИМ ЗАПУСК</span><QuoteMark /></div>
        <h3>{MARKETING.earlyAccess.priceLabel}</h3>
        <p>Стоимость и условия объявим перед запуском. Сейчас можно попробовать клиентскую часть.</p>
        <ul className="eq-access-list">
          <li><Check size={17} /><div>Клиентская витрина и 3D-расчёт<small>Уже в демо</small></div></li>
          <li><Clock3 size={16} /><div>Своя страница и настройка цен<small>В разработке</small></div></li>
          <li><Clock3 size={16} /><div>Кабинет и приём реальных заявок<small>Следующий этап</small></div></li>
        </ul>
        <a className="eq-button eq-primary" href={action.href}>{action.label}<ArrowUpRight size={17} /></a>
        <a className="eq-access-email" href={`mailto:${MARKETING.email}?subject=${encodeURIComponent('Ранний доступ к EndQuote')}`}><Mail size={13} />Или написать на почту</a>
      </article>
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
        <div className="eq-footer-column"><strong>Продукт</strong><a href="#features">Возможности</a><a href={MARKETING.demo}>Клиентское демо</a><a href="#pricing">Ранний доступ</a></div>
        <div className="eq-footer-column"><strong>Связаться</strong><a href={`mailto:${MARKETING.email}`}>{MARKETING.email}<ArrowUpRight size={12} /></a><a href={whatsappLink()} {...external}>+7 (708) 805-65-48<ArrowUpRight size={12} /></a></div>
        <a className="eq-up" href="#top" aria-label="В начало страницы"><ArrowUp size={18} /></a>
      </div>
      <div className="eq-footer-base"><span>© {new Date().getFullYear()} EndQuote</span><div><button onClick={() => setLegal('privacy')}>Конфиденциальность</button><button onClick={() => setLegal('terms')}>Условия использования</button></div></div>
    </div>
    {legal && <Modal titleId="eq-legal-title" onClose={() => setLegal(null)} className="eq-legal">
      <span className="eq-section-label"><i />Перед запуском</span>
      <h2 id="eq-legal-title">{legal === 'privacy' ? 'Политика конфиденциальности' : 'Условия использования'}</h2>
      <p>Документ готовится и будет опубликован к открытию регистрации. Подписки, оплата и личный кабинет пока недоступны.</p>
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
        <div className="eq-container eq-hero-layout">
          <div className="eq-hero-copy">
            <p className="eq-release"><i className="eq-status-dot" />Витрина для сервисного бизнеса</p>
            <h1 id="eq-hero-title"><span>Ваши услуги.</span><span>Ваши цены.</span><em>Одна ссылка.</em></h1>
            <p className="eq-hero-intro">Превратите ссылку в&nbsp;профиле в&nbsp;каталог услуг с&nbsp;3D‑превью, расчётом стоимости и&nbsp;заявками.</p>
            <div className="eq-hero-actions"><a className="eq-button eq-primary" href={MARKETING.demo}>Посмотреть демо<ArrowUpRight size={17} /></a><a className="eq-button eq-secondary" href="#how-it-works">Как это работает<ArrowDown size={15} /></a></div>
          </div>
          <StudioPreview />
        </div>
      </section>
      <Channels />
      <Workflow />
      <ClientDemo />
      <section className="eq-section eq-container eq-benefits">
        <SectionLabel index="03">Для бизнеса</SectionLabel>
        <h2>Меньше переписки.<br />Больше ясности.</h2>
        <div className="eq-benefits-grid">{benefits.map(item => <article key={item.title}><item.icon size={25} strokeWidth={1.4} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
      </section>
      <Pricing action={action} />
      <section id="faq" className="eq-container eq-section eq-faq" aria-labelledby="eq-faq-title">
        <div>
          <SectionLabel index="05">FAQ</SectionLabel>
          <h2 id="eq-faq-title">Есть вопрос?</h2>
          <p>Не нашли ответ? <a href={whatsappLink()} {...external}>Напишите нам<ArrowUpRight size={14} /></a></p>
        </div>
        <div className="eq-faq-list">{FAQ.map((item, i) => <details key={item.question}>
          <summary><small>0{i + 1}</small><span>{item.question}</span><Plus size={16} /></summary><p>{item.answer}</p>
        </details>)}</div>
      </section>
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
