import { useState } from 'react'
import { ArrowUpRight, Rotate3d } from 'lucide-react'
import { DEMO_PRICING, formatMoney } from '../booking/pricing'
import { MARKETING } from './content'
import { Modal } from './ui'

export default function StudioPreview() {
  const [inspect, setInspect] = useState(false)

  return <div className="eq-studio" role="region" aria-label="Пример 3D-витрины химчистки мебели">
    {/*
      Keep the existing rendered sofa asset. Its original dark studio backdrop is
      removed with a chroma-based SVG filter, so the furniture can sit directly
      on the light hero without loading a heavy 3D model on first paint.
    */}
    <svg className="eq-sofa-filter" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id="eq-sofa-cutout" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -4.55 7 -1.4 0 -0.42" />
        </filter>
      </defs>
    </svg>

    <div className="eq-sofa-stage">
      <img
        src="/marketing/study-sofa-2-seater.webp"
        width="1440"
        height="792"
        alt="Фисташковый двухместный диван — пример мебели в клиентской витрине"
        fetchPriority="high"
        draggable={false}
      />
    </div>
    <div className="eq-sofa-details">
      <div className="eq-sofa-description">
        <span>ПРИМЕР ИЗ ВИТРИНЫ</span>
        <strong>Двухместный диван <i>·</i> от {formatMoney(DEMO_PRICING.basePrices['sofa-2-seater'])}</strong>
      </div>
      <button type="button" className="eq-sofa-inspect" onClick={() => setInspect(true)}>
        <Rotate3d size={18} strokeWidth={1.7} />
        <span>Посмотреть в 3D</span>
        <ArrowUpRight size={16} strokeWidth={1.7} />
      </button>
    </div>

    {inspect && <Modal titleId="eq-inspect-title" onClose={() => setInspect(false)} className="eq-inspect-modal">
      <div className="eq-inspect-title" id="eq-inspect-title"><i className="eq-status-dot" />Демо «ЧистоДом»</div>
      <iframe title="Интерактивный 3D-расчёт — двухместный диван"
        src={`${MARKETING.demo}?embed=marketing&stage=model&model=sofa-2-seater`}
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
