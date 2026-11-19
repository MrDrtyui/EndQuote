import { Pencil, Trash2 } from 'lucide-react'
import type { FurnitureAsset } from '../types'
import type { CartItem } from './domain'
import { calculateItemPrice, describeConfiguration, formatMoney } from './pricing'

export default function OrderItems({ items, assets, onEdit, onRemove }: {
  items: CartItem[]; assets: FurnitureAsset[]
  onEdit?: (asset: FurnitureAsset, item: CartItem) => void
  onRemove?: (item: CartItem) => void
}) {
  return <div className="booking-cart-list">{items.map((item) => {
    const asset = assets.find((value) => value.id === item.configuration.modelId)
    const calculated = calculateItemPrice(item.configuration)
    const price = { unitPrice: item.quotedUnitPrice ?? calculated.unitPrice, total: item.quotedTotal ?? calculated.total }
    return <article className="booking-cart-item" key={item.id} data-testid={`cart-item-${item.configuration.modelId}`}>
      <div className="booking-cart-item-main">{asset && <img src={asset.preview} alt={asset.name} width="96" height="96" />}<div><h3>{asset?.name ?? 'Мебель'}</h3><span>{item.configuration.quantity} шт. × {formatMoney(price.unitPrice)}</span><strong>{formatMoney(price.total)}</strong></div></div>
      <p className="booking-cart-options">{describeConfiguration(item.configuration)}</p>
      {item.configuration.notes && <p className="booking-item-note">{item.configuration.notes}</p>}
      {onEdit && onRemove && <div className="booking-cart-item-actions"><button onClick={() => asset && onEdit(asset, item)} aria-label={`Изменить ${asset?.name ?? 'мебель'}`}><Pencil size={14} />Изменить</button><button onClick={() => onRemove(item)} aria-label={`Удалить ${asset?.name ?? 'мебель'}`}><Trash2 size={14} />Удалить</button></div>}
    </article>
  })}</div>
}
