import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Box, Check, ChevronDown, LoaderCircle, Minus, Plus, RotateCcw } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { FurnitureAsset } from '../types'
import type { ItemConfiguration } from './domain'
import { calculateItemPrice, CONTAMINATION_OPTIONS, defaultConfiguration, DEMO_PRICING, EXTRA_OPTIONS, formatMoney, UPHOLSTERY_OPTIONS } from './pricing'

const FurnitureViewer = lazy(() => import('../components/FurnitureViewer'))

export default function Configurator({ asset, initial, onSave, onClose, startAtOptions = false }: {
  asset: FurnitureAsset
  initial: ItemConfiguration | null
  onSave: (configuration: ItemConfiguration) => void
  onClose: () => void
  startAtOptions?: boolean
}) {
  const [configuration, setConfiguration] = useState<ItemConfiguration>(() => initial ? structuredClone(initial) : defaultConfiguration(asset.id))
  const [ready, setReady] = useState(false)
  const [reset, setReset] = useState(0)
  const [notesOpen, setNotesOpen] = useState(Boolean(initial?.notes))
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const options = useRef<HTMLDivElement>(null)
  const price = useMemo(() => calculateItemPrice(configuration), [configuration])
  const patch = (value: Partial<ItemConfiguration>) => setConfiguration((current) => ({ ...current, ...value }))
  useEffect(() => {
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    return () => { document.body.style.overflow = old }
  }, [])
  useEffect(() => {
    if (startAtOptions) options.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [startAtOptions])

  function trap(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
    if (event.key !== 'Tab') return
    const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,[tabindex="0"]') ?? [])
      .filter((element) => element.getClientRects().length)
    if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus() }
    if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus() }
  }

  return <div className="booking-config-backdrop" onClick={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <div className="booking-config" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="config-title" onKeyDown={trap}>
      <header className="booking-config-header"><button ref={closeButton} onClick={onClose} className="booking-icon-button" aria-label="Закрыть настройку"><ArrowLeft size={21} /></button><div><span>Настроить чистку</span><h2 id="config-title">{asset.name}</h2></div><span className="booking-3d-tag"><Box size={14} />3D</span></header>
      <div className="booking-config-scroll">
        <div className="booking-config-viewer">
          <Suspense fallback={<div className="booking-viewer-placeholder"><img src={asset.preview} alt={asset.name} /><span><LoaderCircle className="animate-spin" size={16} />Открываем 3D-просмотр</span></div>}>
            <FurnitureViewer asset={asset} resetToken={reset} onReady={setReady} />
          </Suspense>
          {ready && <><span className="booking-viewer-instruction">Поверните мебель пальцем</span><button className="booking-reset" aria-label="Сбросить вид" onClick={() => setReset((value) => value + 1)}><RotateCcw size={16} /></button></>}
        </div>
        <div className="booking-config-options" ref={options}>
          <div className="booking-quantity-row"><div><h3>Количество</h3><p>Сколько таких предметов нужно почистить?</p></div><div className="booking-stepper"><button aria-label="Уменьшить количество" disabled={configuration.quantity === 1} onClick={() => patch({ quantity: configuration.quantity - 1 })}><Minus size={17} /></button><output aria-label="Количество предметов">{configuration.quantity}</output><button aria-label="Увеличить количество" disabled={configuration.quantity === 20} onClick={() => patch({ quantity: configuration.quantity + 1 })}><Plus size={17} /></button></div></div>
          <fieldset className="booking-option-group"><legend>{asset.category === 'mattress' ? 'Материал поверхности' : 'Материал обивки'}</legend><p>Если не уверены, выберите обычную ткань.</p><div className="booking-radio-list">{UPHOLSTERY_OPTIONS.map((option) => <label key={option.value} className={configuration.upholstery === option.value ? 'selected' : ''}><input type="radio" name="upholstery" value={option.value} checked={configuration.upholstery === option.value} onChange={() => patch({ upholstery: option.value })} /><span className="booking-radio-circle">{configuration.upholstery === option.value && <span />}</span><span><strong>{option.label}</strong><small>{option.description}</small></span><em>{DEMO_PRICING.upholstery[option.value] ? `+${Math.round(DEMO_PRICING.upholstery[option.value] * 100)}%` : 'Без доплаты'}</em></label>)}</div></fieldset>
          <fieldset className="booking-option-group"><legend>Загрязнения</legend><div className="booking-contamination">{CONTAMINATION_OPTIONS.map((option) => <label key={option.value} className={configuration.contamination === option.value ? 'selected' : ''}><input type="radio" name="contamination" value={option.value} checked={configuration.contamination === option.value} onChange={() => patch({ contamination: option.value })} /><strong>{option.label}</strong><small>{option.description}</small>{DEMO_PRICING.contamination[option.value] > 0 && <em>+{DEMO_PRICING.contamination[option.value] * 100}%</em>}</label>)}</div></fieldset>
          <fieldset className="booking-option-group"><legend>Добавим заботы?</legend><p>Дополнительные услуги — по желанию, за каждый предмет.</p><div className="booking-extras">{EXTRA_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={configuration.extras.includes(option.value)} onChange={(event) => patch({ extras: event.target.checked ? [...configuration.extras, option.value] : configuration.extras.filter((extra) => extra !== option.value) })} /><span className="booking-checkbox">{configuration.extras.includes(option.value) && <Check size={14} strokeWidth={2.5} />}</span><span><strong>{option.label}</strong><small>{option.description}</small></span><em>+{formatMoney(DEMO_PRICING.extras[option.value])}</em></label>)}</div></fieldset>
          <div className="booking-config-notes"><button aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}>Примечание к этому предмету <ChevronDown size={16} className={notesOpen ? 'turned' : ''} /></button>{notesOpen && <textarea aria-label="Примечание к мебели" value={configuration.notes} onChange={(event) => patch({ notes: event.target.value })} maxLength={500} rows={3} placeholder="Например, пятно от кофе на левом подлокотнике" />}</div>
          <div className="booking-price-breakdown"><h3>Предварительный расчёт</h3><div><span>Основная чистка</span><span>{formatMoney(price.base)}</span></div>{price.upholsterySurcharge > 0 && <div><span>Особенности ткани</span><span>+{formatMoney(price.upholsterySurcharge)}</span></div>}{price.contaminationSurcharge > 0 && <div><span>Сильные загрязнения</span><span>+{formatMoney(price.contaminationSurcharge)}</span></div>}{price.extrasTotal > 0 && <div><span>Дополнительные услуги</span><span>+{formatMoney(price.extrasTotal)}</span></div>}{configuration.quantity > 1 && <div><span>{configuration.quantity} шт. × {formatMoney(price.unitPrice)}</span><strong>{formatMoney(price.total)}</strong></div>}<p>Точная стоимость уточняется после осмотра мебели.</p></div>
        </div>
      </div>
      <footer className="booking-config-bottom"><span>Предварительная стоимость<strong data-testid="config-total">{formatMoney(price.total)}</strong></span><button className="booking-primary" onClick={() => onSave(configuration)}>{initial ? 'Сохранить изменения' : 'Добавить в заказ'}<Plus size={18} /></button></footer>
    </div>
  </div>
}
