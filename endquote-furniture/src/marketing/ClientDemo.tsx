import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, BatteryFull, Box, Check, ClipboardList, Fingerprint, Play, Rotate3d, Settings2, Signal, Wifi } from 'lucide-react'
import { MARKETING } from './content'
import { SectionLabel } from './ui'

const stages = [
  { id: 'catalog', title: 'Выберите мебель', text: 'Каталог с моделями и ценами — без анкеты и звонка.', icon: Box },
  { id: 'model', title: 'Рассмотрите в 3D', text: 'Поверните модель, чтобы сверить форму и размер.', icon: Rotate3d },
  { id: 'price', title: 'Узнайте стоимость', text: 'Меняйте ткань, количество и услуги. Цена обновится сразу.', icon: Settings2 },
  { id: 'request', title: 'Соберите заявку', text: 'Предметы, контакты, адрес и дата — в одном заказе.', icon: ClipboardList },
] as const
type Stage = typeof stages[number]['id']

export default function ClientDemo() {
  const [stage, setStage] = useState<Stage | null>(null)
  const device = useRef<HTMLDivElement>(null)
  const [launch, setLaunch] = useState(0)
  useEffect(() => {
    if (launch && matchMedia('(max-width: 760px)').matches) {
      device.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }, [launch])
  function start(next: Stage) { setStage(next); setLaunch(n => n + 1) }
  return <section className="eq-demo-section eq-section" id="features" aria-labelledby="eq-demo-title">
    <div className="eq-container eq-demo-layout">
      <div className="eq-demo-copy">
        <SectionLabel index="02">Продукт в действии</SectionLabel>
        <h2 id="eq-demo-title">Посмотрите <br />глазами клиента.</h2>
        <p className="eq-section-intro">От «сколько стоит?» до готовой заявки. Пройдите весь путь на примере химчистки «ЧистоДом».</p>
        <div className="eq-stage-list" role="group" aria-label="Этапы интерактивного демо">{stages.map((item, i) =>
          <button type="button" key={item.id} aria-pressed={stage === item.id} onClick={() => start(item.id)}>
            <span className="eq-stage-icon"><item.icon size={19} strokeWidth={1.5} /></span>
            <span><strong>{item.title}</strong><small>{item.text}</small></span>
            <span className="eq-stage-num">{stage === item.id ? <Check size={14} /> : `0${i + 1}`}</span>
          </button>
        )}</div>
        {stage
          ? <a className="eq-button eq-primary" href={MARKETING.demo}>Продолжить в полном демо<ArrowUpRight size={16} /></a>
          : <button type="button" className="eq-button eq-primary" onClick={() => start('model')}>Попробовать 3D-расчёт<ArrowRight size={16} /></button>}
        <p className="eq-disclaimer"><Fingerprint size={15} />Демо-заявка останется только в вашем браузере.</p>
      </div>
      <div className={`eq-demo-board ${stage ? 'is-running' : ''}`} ref={device}>
        <div className="eq-board-header"><span>МОБИЛЬНАЯ ВИТРИНА</span><span><i className="eq-status-dot" />{stage ? 'LIVE' : 'ДЕМО'}</span></div>
        <div className={`eq-phone ${stage ? 'is-running' : ''}`}>
          <div className="eq-phone-system" aria-hidden="true"><span>9:41</span><i /><span><Signal size={11} /><Wifi size={10} /><BatteryFull size={13} /></span></div>
          <div className="eq-phone-screen">{stage
            ? <iframe key={launch} src={`${MARKETING.demo}?embed=marketing&stage=${stage}`} title={`Работающая витрина ЧистоДом — ${stages.find(item => item.id === stage)?.title}`} />
            : <img loading="lazy" src="/marketing/configurator.webp" width="780" height="1688" alt="Демо ЧистоДом: двухместный диван, выбор материала и предварительная стоимость чистки" />}</div>
          <div className="eq-phone-home" aria-hidden="true"><i /></div>
        </div>
        <div className="eq-board-footer">{stage
          ? <span><i className="eq-status-dot" />Можно вращать, выбирать и считать</span>
          : <button onClick={() => start('model')}><Play size={12} fill="currentColor" />Запустить демо</button>}
          <span className="eq-board-code">EQ — 01</span>
        </div>
      </div>
    </div>
  </section>
}
