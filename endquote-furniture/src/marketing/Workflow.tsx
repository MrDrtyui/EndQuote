import { ArrowUpRight, BadgeCheck, Link2, MapPin, MousePointer2 } from 'lucide-react'
import { DEMO_PRICING, formatMoney } from '../booking/pricing'
import { SectionLabel } from './ui'

function ProfileSample() {
  return <div className="eq-sample eq-profile-sample" aria-hidden="true">
    <div className="eq-profile-card">
      <div><span className="eq-company-avatar">ЧД</span><span><strong>ЧистоДом <BadgeCheck size={13} /></strong><small>Химчистка мебели</small></span></div>
      <div className="eq-profile-locale"><MapPin size={11} />Алматы и область</div>
    </div>
  </div>
}

function PriceSample() {
  const base = DEMO_PRICING.basePrices['sofa-2-seater']
  const extra = DEMO_PRICING.extras['pet-hair']
  return <div className="eq-sample eq-calc-sample" aria-hidden="true">
    <div className="eq-receipt">
      <div><span>Чистка дивана</span><span>{formatMoney(base)}</span></div>
      <div><span>Удаление шерсти</span><span>{formatMoney(extra)}</span></div>
      <div className="eq-receipt-total"><strong>Итого</strong><strong>{formatMoney(base + extra)}</strong></div>
    </div>
  </div>
}

function LinkSample() {
  return <div className="eq-sample eq-link-sample" aria-hidden="true">
    <div className="eq-link-token"><span><Link2 size={17} /></span>endquote.kz/<b>ваше-имя</b><ArrowUpRight size={13} /></div>
    <div className="eq-client-pointer"><MousePointer2 size={19} fill="currentColor" /><span>Ваш клиент</span></div>
  </div>
}

const steps = [
  { visual: ProfileSample, title: 'Создайте страницу', text: 'Название, контакты и зона работы — всё, что нужно, чтобы узнать ваш бизнес.' },
  { visual: PriceSample, title: 'Добавьте услуги и цены', text: 'Задайте базовую стоимость и доплаты. Клиент сам настроит услугу под свою задачу.' },
  { visual: LinkSample, title: 'Поделитесь ссылкой', text: 'Разместите витрину в профиле или отправьте в чат. Она откроется прямо в браузере.' },
]

export default function Workflow() {
  return <section className="eq-container eq-section eq-workflow" id="how-it-works" aria-labelledby="eq-workflow-title">
    <SectionLabel index="01">Как это работает</SectionLabel>
    <div className="eq-section-heading">
      <h2 id="eq-workflow-title">От профиля до заявки.</h2>
      <p>Три шага, чтобы за ссылкой в профиле<br className="eq-wide-only" /> появился ваш каталог услуг.</p>
    </div>
    <div className="eq-step-grid">{steps.map((step, i) =>
      <article className="eq-step" key={step.title}>
        <span className="eq-step-tag">ШАГ <b>0{i + 1}</b></span>
        <step.visual />
        <div className="eq-step-body"><h3>{step.title}</h3><p>{step.text}</p></div>
      </article>
    )}</div>
    <p className="eq-roadmap"><i className="eq-hollow-dot" />Клиентское демо уже работает. Создание своих витрин готовим к запуску.</p>
  </section>
}
