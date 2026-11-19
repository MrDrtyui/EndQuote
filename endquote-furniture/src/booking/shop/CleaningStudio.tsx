import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Box, Check, ChevronDown, Hand, Image as Picture, Minus, Plus, ReceiptText, RotateCcw, Ruler, X } from 'lucide-react'
import type { FurnitureAsset } from '../../types'
import type { ItemConfiguration } from '../domain'
import { calculateItemPrice, CONTAMINATION_OPTIONS, defaultConfiguration, EXTRA_OPTIONS, formatMoney, UPHOLSTERY_OPTIONS } from '../pricing'
import { dimensions } from './FurnitureCatalog'
import {useStore} from '../live/LiveStore'

const Viewer = lazy(() => import('../../components/FurnitureViewer'))

function Fold({ number, title, summary, open, toggle, children }: {
  number: string; title: string; summary: string; open: boolean; toggle: () => void; children: ReactNode
}) {
  const id = useId()
  return <section className="sf-fold">
    <h3><button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}>
      <span className="sf-fold-number">{number}</span><span>{title}<small>{summary}</small></span><ChevronDown size={17} />
    </button></h3>
    <div id={id} hidden={!open} className="sf-fold-panel">{children}</div>
  </section>
}

export default function CleaningStudio({ asset, initial, onClose, onSave }: {
  asset: FurnitureAsset; initial: ItemConfiguration | null; onClose: () => void; onSave: (configuration: ItemConfiguration) => void
}) {
  const [config, setConfig] = useState(() => initial ? structuredClone(initial) : defaultConfiguration(asset.id))
  const [view, setView] = useState<'3d' | 'photo'>('3d')
  const [ready, setReady] = useState(false)
  const [reset, setReset] = useState(0)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [receipt, setReceipt] = useState(false)
  const [notes, setNotes] = useState(Boolean(config.notes))
  const [sections, setSections] = useState({ fabric: true, soil: true, extras: true })
  const dialog = useRef<HTMLDialogElement>(null)
  const pane = useRef<HTMLDivElement>(null)
  const receiptButton = useRef<HTMLButtonElement>(null)
  const receiptClose = useRef<HTMLButtonElement>(null)
  const {pricing}=useStore()
  const price = calculateItemPrice(config,pricing)
  const set = (value: Partial<ItemConfiguration>) => setConfig(c => ({ ...c, ...value }))
  const toggle = (key: keyof typeof sections) => setSections(previous => ({ ...previous, [key]: !previous[key] }))
  const scrollToOptions = () => {
    const el = pane.current
    if (el) { el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); el.focus({ preventScroll: true }) }
  }
  function hideReceipt() {
    setReceipt(false)
    requestAnimationFrame(() => receiptButton.current?.focus({ preventScroll: true }))
  }
  useEffect(() => {
    const el = dialog.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el?.showModal()
    return () => { el?.close(); document.body.style.overflow = overflow }
  }, [])
  useEffect(() => { if (receipt) receiptClose.current?.focus({ preventScroll: true }) }, [receipt])

  return <dialog ref={dialog} className="sf-studio" aria-labelledby="sf-studio-title" onCancel={event => {
    event.preventDefault()
    if (receipt) hideReceipt(); else onClose()
  }} onClick={event => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  }}>
    <header className="sf-studio-header">
      <button className="sf-icon" aria-label="Закрыть настройку" onClick={onClose}><ArrowLeft size={19} /></button>
      <div><span className="sf-micro">Настройка чистки</span><h2 id="sf-studio-title">{asset.name}</h2></div>
      <span className="sf-studio-unit">за предмет<br /><b>от {formatMoney(price.base)}</b></span>
    </header>
    <div className="sf-studio-scroll">
      <div className="sf-gallery">
        <div className="sf-gallery-stage">
          {view === '3d' ? <Suspense fallback={<div className="sf-photo"><img src={asset.preview} alt={asset.name} /><span role="status">Открываем модель…</span></div>}>
            <Viewer asset={asset} resetToken={reset} onReady={setReady} />
          </Suspense> : <div className="sf-photo"><img src={asset.preview} width="512" height="512" alt={`${asset.name}, студийный вид`} /></div>}
          <div className="sf-view-switch" role="group" aria-label="Вид мебели">
            <button aria-pressed={view === '3d'} onClick={() => setView('3d')}><Box size={14} />3D</button>
            <button aria-pressed={view === 'photo'} onClick={() => { setView('photo'); setReady(false) }}><Picture size={14} />Фото</button>
          </div>
          <div className="sf-gallery-bottom">
            <button className="sf-size-button" aria-label="Размеры модели" aria-expanded={sizeOpen} aria-controls="sf-model-size" onClick={() => setSizeOpen(!sizeOpen)}><Ruler size={16} />Размеры</button>
            {ready && view === '3d' && <button className="sf-icon sf-reset" aria-label="Сбросить вид" onClick={() => setReset(token => token + 1)}><RotateCcw size={16} /></button>}
          </div>
          {sizeOpen && <div id="sf-model-size" className="sf-size-label"><b>{dimensions(asset)} см</b><span>Ширина × глубина × высота</span></div>}
        </div>
        <div className="sf-gallery-caption">
          <span>{view === '3d' ? <><Hand size={15} />Потяните, чтобы повернуть</> : <><Picture size={15} />Фотография модели</>}</span>
          <button className="sf-jump-params" onClick={scrollToOptions}>Параметры<ChevronDown size={13} /></button>
        </div>
      </div>
      <div ref={pane} tabIndex={-1} className="sf-studio-options" aria-label="Параметры чистки">
        <p className="sf-kicker">Ваши параметры</p>
        <div className="sf-quantity"><div><h3>Количество</h3><small>Одинаковых предметов</small></div>
          <div className="sf-stepper"><button aria-label="Уменьшить количество" disabled={config.quantity <= 1} onClick={() => set({ quantity: config.quantity - 1 })}><Minus size={16} /></button><output aria-label="Количество предметов">{config.quantity}</output><button aria-label="Увеличить количество" disabled={config.quantity >= 20} onClick={() => set({ quantity: config.quantity + 1 })}><Plus size={16} /></button></div>
        </div>
        <Fold number="01" title={asset.category === 'mattress' ? 'Материал поверхности' : 'Материал обивки'} summary={UPHOLSTERY_OPTIONS.find(option => option.value === config.upholstery)!.label} open={sections.fabric} toggle={() => toggle('fabric')}>
          <fieldset className="sf-fabrics"><legend className="sf-sr">Выбор материала</legend>
            {UPHOLSTERY_OPTIONS.map(option => {
              const surcharge = calculateItemPrice({ ...config, upholstery: option.value },pricing).upholsterySurcharge
              return <label key={option.value} className="sf-fabric">
                <input type="radio" name="shop-fabric" value={option.value} checked={config.upholstery === option.value} onChange={() => set({ upholstery: option.value })} />
                <i aria-hidden="true" className={`sf-swatch swatch-${option.value}`} />
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
                <b>{surcharge ? `+${formatMoney(surcharge)}` : 'Включено'}</b><i className="sf-radio" />
              </label>
            })}
          </fieldset>
        </Fold>
        <Fold number="02" title="Загрязнения" summary={CONTAMINATION_OPTIONS.find(option => option.value === config.contamination)!.description} open={sections.soil} toggle={() => toggle('soil')}>
          <fieldset className="sf-soil"><legend className="sf-sr">Степень загрязнения</legend>{CONTAMINATION_OPTIONS.map((option, index) => {
            const extra = calculateItemPrice({ ...config, contamination: option.value },pricing).contaminationSurcharge
            return <label key={option.value}><input type="radio" name="shop-soil" value={option.value} checked={config.contamination === option.value} onChange={() => set({ contamination: option.value })} />
              <i aria-hidden="true">{[0, 1, 2].map(n => <b key={n} data-on={n <= index} />)}</i><strong>{option.label}</strong><small>{extra ? `+${formatMoney(extra)}` : 'Без доплаты'}</small>
            </label>
          })}</fieldset>
        </Fold>
        <Fold number="03" title="Дополнительные услуги" summary={config.extras.length ? `Выбрано: ${config.extras.length}` : 'По желанию'} open={sections.extras} toggle={() => toggle('extras')}>
          <div className="sf-extras">{EXTRA_OPTIONS.map(option => {
            const checked = config.extras.includes(option.value)
            const unitExtra = calculateItemPrice({ ...config, extras: [option.value] },pricing).extrasTotal
            return <label key={option.value}><input type="checkbox" checked={checked} onChange={() => set({ extras: checked ? config.extras.filter(v => v !== option.value) : [...config.extras, option.value] })} />
              <i className="sf-check">{checked && <Check size={13} />}</i><span><strong>{option.label}</strong><small>{option.description}</small></span><b>+{formatMoney(unitExtra)}</b></label>
          })}</div>
        </Fold>
        <div className="sf-item-notes"><button type="button" aria-expanded={notes} aria-controls="sf-item-note" onClick={() => setNotes(!notes)}>{notes ? <Minus size={15} /> : <Plus size={15} />}Примечание к этому предмету</button>
          {notes && <textarea id="sf-item-note" aria-label="Примечание к мебели" value={config.notes} onChange={e => set({ notes: e.target.value })} maxLength={500} rows={3} placeholder="Например, пятно на левом подлокотнике" />}</div>
      </div>
    </div>
    {receipt && <section id="sf-calculation" className="sf-calculation" aria-label="Состав расчёта">
      <div><h3><ReceiptText size={17} />Состав расчёта</h3><button ref={receiptClose} className="sf-icon" aria-label="Скрыть состав расчёта" onClick={hideReceipt}><X size={16} /></button></div>
      <dl>{([['Базовая чистка', price.base], ['Материал', price.upholsterySurcharge], ['Загрязнения', price.contaminationSurcharge], ['Дополнения', price.extrasTotal]] as const).filter(([, amount]) => amount > 0).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{formatMoney(amount)}</dd></div>)}
        <div className="sf-receipt-total"><dt>{config.quantity} шт. × {formatMoney(price.unitPrice)}</dt><dd>{formatMoney(price.total)}</dd></div></dl>
      <p>Расчёт предварительный. Мастер уточнит стоимость после осмотра мебели.</p>
    </section>}
    <footer className="sf-studio-footer">
      <button className="sf-total-button" ref={receiptButton} aria-label={`${receipt ? 'Свернуть' : 'Показать'} состав расчёта: ${formatMoney(price.total)}`} aria-expanded={receipt} aria-controls={receipt ? 'sf-calculation' : undefined} onClick={() => setReceipt(!receipt)}><span>Предварительно<ChevronDown size={12} /></span><strong data-testid="config-total" aria-live="polite">{formatMoney(price.total)}</strong></button>
      <button className="sf-action sf-primary" onClick={() => onSave(config)}>{initial ? 'Сохранить изменения' : 'Добавить в заказ'}<ArrowRight size={17} /></button>
    </footer>
  </dialog>
}
