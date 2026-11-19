import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Box, Link2, Rotate3d } from 'lucide-react'
import { DEMO_PRICING, formatMoney } from '../booking/pricing'
import { MARKETING } from './content'
import { Modal } from './ui'

const studies = [
  { id: 'sofa-2-seater', name: 'Двухместный диван', color: 'фисташкового цвета' },
  { id: 'armchair', name: 'Кресло', color: 'терракотового цвета' },
  { id: 'sofa-l-shaped', name: 'Угловой диван', color: 'серо-голубого цвета' },
] as const

function Axes() {
  return <svg className="eq-axes" viewBox="0 0 40 34" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M20 19V5m0 14L7 26m13-7 13 7" /></g>
    <circle cx="20" cy="5" r="2" fill="var(--acid)" /><circle cx="7" cy="26" r="1.7" fill="currentColor" /><circle cx="33" cy="26" r="1.7" fill="currentColor" />
  </svg>
}

export default function StudioPreview() {
  const [index, setIndex] = useState(0)
  const [inspect, setInspect] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const item = studies[index]
  const previous = () => setIndex((n) => (n + studies.length - 1) % studies.length)
  const next = () => setIndex((n) => (n + 1) % studies.length)
  return <div className="eq-studio" role="region" aria-label="Примеры моделей в витрине «ЧистоДом»">
    <figure className="eq-studio-frame">
      <div className="eq-browser-bar">
        <span className="eq-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <a className="eq-address" href={MARKETING.demo} aria-label="Открыть витрину endquote.kz/chistodom">
          <Link2 size={13} /><span>endquote.kz<span>/chistodom</span></span>
        </a>
        <a className="eq-browser-open" href={MARKETING.demo} aria-label="Открыть полную витрину"><ArrowUpRight size={15} /></a>
      </div>
      <div className="eq-studio-plate"
        onTouchStart={(event) => { const touch = event.touches[0]; start.current = { x: touch.clientX, y: touch.clientY } }}
        onTouchCancel={() => { start.current = null }}
        onTouchEnd={(event) => {
          if (!start.current) return
          const dx = event.changedTouches[0].clientX - start.current.x
          const dy = event.changedTouches[0].clientY - start.current.y
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) next(); else previous() }
          start.current = null
        }}>
        <img key={item.id} src={`/marketing/study-${item.id}.webp`} width="1440" height="792"
          alt={`${item.name} ${item.color} на разметке студийного подиума`} fetchPriority={index === 0 ? 'high' : 'auto'} draggable="false" />
        <div className="eq-plate-head"><span><Box size={13} strokeWidth={1.65} />3D-ПРЕВЬЮ</span><span className="eq-live"><i />ДЕМО</span></div>
        <button className="eq-orbit-button" onClick={() => setInspect(true)} aria-label={`Вращать в 3D: ${item.name}`} title="Открыть интерактивную модель">
          <Rotate3d size={16} strokeWidth={1.6} /><span>360°</span>
        </button>
        <Axes />
      </div>
      <figcaption className="eq-study-info" aria-live="polite" aria-atomic="true">
        <div><small>ХИМЧИСТКА МЕБЕЛИ</small><strong>{item.name}</strong></div>
        <div className="eq-study-price"><small>СТОИМОСТЬ ОТ</small><strong>{formatMoney(DEMO_PRICING.basePrices[item.id])}</strong></div>
      </figcaption>
    </figure>
    <div className="eq-study-controls" role="group" aria-label="Выбор модели"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); next() }
        if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
      }}>
      <div className="eq-study-pagination">{studies.map((study, i) =>
        <button key={study.id} type="button" onClick={() => setIndex(i)} aria-pressed={i === index} aria-label={`Показать модель: ${study.name}`}><span /></button>
      )}</div>
      <span className="eq-study-count">МОДЕЛЬ <b>0{index + 1}</b><span>/</span>03</span>
      <button className="eq-study-arrow" onClick={previous} aria-label="Предыдущая модель"><ArrowLeft size={16} /></button>
      <button className="eq-study-arrow" onClick={next} aria-label="Следующая модель"><ArrowRight size={16} /></button>
    </div>
    {inspect && <Modal titleId="eq-inspect-title" onClose={() => setInspect(false)} className="eq-inspect-modal">
      <div className="eq-inspect-title" id="eq-inspect-title"><i className="eq-status-dot" />Демо «ЧистоДом»</div>
      <iframe title={`Интерактивный расчёт — ${item.name}`} src={`${MARKETING.demo}?embed=marketing&stage=model&model=${item.id}`}
        onLoad={(event) => {
          // Escape must also work when keyboard focus is inside the embedded app.
          event.currentTarget.contentDocument?.addEventListener('keydown', (key) => {
            if (key.key !== 'Escape') return
            key.preventDefault()
            key.stopPropagation()
            setInspect(false)
          }, true)
        }} />
    </Modal>}
  </div>
}
