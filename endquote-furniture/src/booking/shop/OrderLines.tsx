import { Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import type { FurnitureAsset } from '../../types'
import type { CartItem } from '../domain'
import {useStore} from '../live/LiveStore'
import { calculateItemPrice, CONTAMINATION_OPTIONS, EXTRA_OPTIONS, formatMoney, UPHOLSTERY_OPTIONS } from '../pricing'

export default function OrderLines({ items, assets, edit, remove, quantity }: {
  items: CartItem[]; assets: FurnitureAsset[]
  edit?: (asset: FurnitureAsset, item: CartItem) => void
  remove?: (item: CartItem) => void
  quantity?: (item: CartItem, next: number) => void
}) {
  const {pricing}=useStore()
  return <div className="sf-order-lines">{items.map(item => {
    const asset = assets.find(a => a.id === item.configuration.modelId)
    const config = item.configuration
    const quote = calculateItemPrice(config,pricing)
    const total = item.quotedTotal ?? quote.total, unit = item.quotedUnitPrice ?? quote.unitPrice
    return <article className="sf-order-line" key={item.id} data-testid={`cart-item-${config.modelId}`}>
      <div className="sf-line-head">
        {asset && <img src={asset.preview} alt="" width="80" height="80" />}
        <div><h3>{asset?.name ?? 'Мебель'}</h3><small>{config.quantity} шт. × {formatMoney(unit)}</small><strong>{formatMoney(total)}</strong></div>
        {remove && <button className="sf-remove" aria-label={`Удалить ${asset?.name ?? 'мебель'}`} onClick={() => remove(item)}><Trash2 size={16} /></button>}
      </div>
      <dl className="sf-line-specs">
        <div><dt>Материал</dt><dd>{UPHOLSTERY_OPTIONS.find(opt => opt.value === config.upholstery)?.label}</dd></div>
        <div><dt>Загрязнения</dt><dd>{CONTAMINATION_OPTIONS.find(opt => opt.value === config.contamination)?.label}</dd></div>
        {config.extras.length > 0 && <div><dt>Дополнения</dt><dd>{EXTRA_OPTIONS.filter(opt => config.extras.includes(opt.value)).map(opt => opt.label).join(', ')}</dd></div>}
        {config.notes && <div><dt>Примечание</dt><dd>{config.notes}</dd></div>}
      </dl>
      {edit && quantity && <div className="sf-line-actions">
        <button className="sf-text-button" disabled={!asset} onClick={() => asset && edit(asset, item)} aria-label={`Изменить ${asset?.name ?? 'мебель'}`}><Pencil size={14} />Настройки</button>
        <div className="sf-stepper"><button aria-label={`Уменьшить количество: ${asset?.name}`} disabled={config.quantity <= 1} onClick={() => quantity(item, config.quantity - 1)}><Minus size={14} /></button><span>{config.quantity}</span><button aria-label={`Увеличить количество: ${asset?.name}`} disabled={config.quantity >= 20} onClick={() => quantity(item, config.quantity + 1)}><Plus size={14} /></button></div>
      </div>}
    </article>
  })}</div>
}
