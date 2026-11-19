import type { CartItem } from './domain'
import { calculateItemPrice } from './pricing'

const KEY = 'endquote.demo.basket.chistodom.v1'
export function readBasket(): CartItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is CartItem => {
      try {
        return item && typeof item.id === 'string' && typeof item.configuration.notes === 'string'
          && item.configuration.notes.length <= 500 && calculateItemPrice(item.configuration).total > 0
      } catch { return false }
    })
  } catch { return [] }
}
export function saveBasket(items: CartItem[]) {
  // An unavailable draft store must not prevent browsing or adding services.
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* Submission reports storage failures separately. */ }
}
