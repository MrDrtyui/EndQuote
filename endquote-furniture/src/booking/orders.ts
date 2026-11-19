import type { CartItem, CustomerDetails, DemoOrder } from './domain.ts'
import { calculateCartTotal, calculateItemPrice, DEMO_PRICING } from './pricing.ts'

export const ORDER_STORAGE_KEY = 'endquote.demo.orders.v1'
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T12:00:00')
  return Number.isFinite(date.getTime()) && localDate(date) === value
}
export const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('8') ? '7' + digits.slice(1) : digits
}
export function formatPhone(phone: string) {
  let digits = normalizePhone(phone)
  if (!digits) return ''
  if (!digits.startsWith('7')) digits = '7' + digits
  digits = digits.slice(0, 11)
  return '+7' + (digits.length > 1 ? ' (' + digits.slice(1, 4) : '')
    + (digits.length >= 4 ? ') ' : '') + digits.slice(4, 7)
    + (digits.length > 7 ? '-' + digits.slice(7, 9) : '')
    + (digits.length > 9 ? '-' + digits.slice(9, 11) : '')
}
export function validateCustomer(customer: CustomerDetails): Partial<Record<keyof CustomerDetails, string>> {
  const errors: Partial<Record<keyof CustomerDetails, string>> = {}
  if (customer.name.trim().length < 2 || customer.name.trim().length > 80) errors.name = 'Укажите имя: от 2 до 80 символов.'
  if (!/^7[67]\d{9}$/.test(normalizePhone(customer.phone))) errors.phone = 'Укажите номер Казахстана: +7 (700) 123-45-67.'
  if (customer.address.trim().length < 8 || customer.address.trim().length > 240) errors.address = 'Укажите улицу, номер дома и квартиру.'
  const date = customer.preferredDate
  if (!isCalendarDate(date) || date < localDate()) errors.preferredDate = 'Выберите сегодняшнюю или будущую дату.'
  if (customer.comment.length > 1000) errors.comment = 'Комментарий должен быть не длиннее 1 000 символов.'
  if (customer.photos.length > 3 || customer.photos.some((photo) => !/^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl) || photo.dataUrl.length > 650_000)) errors.photos = 'Можно прикрепить до трёх небольших фотографий.'
  return errors
}

function isOrder(value: unknown): value is DemoOrder {
  if (!value || typeof value !== 'object') return false
  const order = value as DemoOrder
  if (order.demo !== true || typeof order.id !== 'string' || typeof order.number !== 'string'
    || typeof order.createdAt !== 'string' || !Number.isFinite(Date.parse(order.createdAt)) || typeof order.total !== 'number' || !Number.isFinite(order.total) || order.total <= 0
    || !order.customer || !Array.isArray(order.customer.photos) || !Array.isArray(order.items) || !order.items.length) return false
  try {
    return order.items.every((item) => typeof item.id === 'string' && calculateItemPrice(item.configuration).total > 0
      && (item.quotedTotal === undefined || (Number.isFinite(item.quotedTotal) && item.quotedTotal > 0)))
      && ['name', 'phone', 'address', 'preferredDate', 'comment'].every((key) => typeof order.customer[key as keyof CustomerDetails] === 'string')
      && isCalendarDate(order.customer.preferredDate)
      && order.customer.photos.length <= 3
      && order.customer.photos.every((photo) => photo && typeof photo.id === 'string' && typeof photo.name === 'string' && typeof photo.dataUrl === 'string' && photo.dataUrl.length <= 650_000 && /^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl))
  } catch { return false }
}

export function readDemoOrders(): DemoOrder[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(isOrder) : []
  } catch { return [] }
}
export const getDemoOrder = (id: string) => readDemoOrders().find((order) => order.id === id) ?? null

/** Browser-only repository. A future API adapter can implement this contract. */
export function submitDemoOrder(customer: CustomerDetails, items: CartItem[]): DemoOrder {
  if (Object.keys(validateCustomer(customer)).length) throw new Error('Проверьте контактные данные.')
  if (!items.length) throw new Error('Добавьте хотя бы один предмет мебели.')
  const id = crypto.randomUUID()
  const order: DemoOrder = {
    id, number: `EQ-${localDate().replaceAll('-', '').slice(2)}-${id.slice(0, 4).toUpperCase()}`,
    createdAt: new Date().toISOString(), customer: structuredClone(customer), items: structuredClone(items).map((item) => {
      const price = calculateItemPrice(item.configuration)
      return { ...item, quotedUnitPrice: price.unitPrice, quotedTotal: price.total }
    }),
    total: calculateCartTotal(items), pricingVersion: DEMO_PRICING.version, demo: true,
  }
  try {
    const orders = [...readDemoOrders(), order]
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders))
  } catch {
    throw new Error('Не удалось сохранить демо-заявку в браузере. Попробуйте убрать фотографии или освободить место и повторить.')
  }
  return order
}
