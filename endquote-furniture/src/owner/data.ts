import { useEffect, useState } from 'react'
import type { ItemConfiguration } from '../booking/domain'
import { api } from './api'

export type Provider = 'google' | 'apple'
export type Session = { providers: Provider[]; mailReady:boolean; owner: { verifiedAt:string|null; id: string; normalizedEmail: string } | null; onboarded: boolean }
export type Business = {
  id: string; slug: string; name: string; city: string; phone: string; description: string; area: string
  published: boolean; editable: boolean; trialEndsAt: string; paidThrough: string | null
  accessState: 'trial' | 'active' | 'expired'; social: Record<string, string>; logoId: string | null
  catalogRevision: number
}
export type Model = { id: string; name: string; category: string; enabled: boolean; base: number }
export type Category = { id: string; name: string; enabled: boolean }
export type Catalog = {
  models: Model[]; categories: Category[]
  upholstery: Record<string, number>; contamination: Record<string, number>; extras: Record<string, number>
}
export type CatalogResponse = { catalog: Catalog; revision: number }
export const statusLabels = { new: 'Новая', accepted: 'В работе', completed: 'Завершена', cancelled: 'Отменена' }
export const statusGroups = { new: 'Новые', accepted: 'В работе', completed: 'Завершённые', cancelled: 'Отменённые' }
export type Status = keyof typeof statusLabels
export const statuses = Object.keys(statusLabels) as Status[]
export type Summary = { counts: Record<Status, number>; estimate: number }
export type Order = {
  id: string; createdAt: string; status: Status; total: number
  contact: { name: string; phone: string; address: string; preferredDate: string; comment: string }
}
export type OrderPage = { orders: Order[]; cursor: string | null }
export type OrderDetail = Order & {
  lines: { snapshot: { name: string; quantity: number; unit: number; total: number; configuration: ItemConfiguration } }[]
  photos: { id: string }[]; events: { from: Status | null; to: Status; createdAt: string }[]
  consentVersion: string; consentAt: string
}

export function problem(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError) ? error.message : 'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.'
}

/** Ignore an older response after the requested resource or revision changes. */
export function useResource<T>(path: string, version = 0) {
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify([path, version, attempt])
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>()
  useEffect(() => {
    let current = true
    api<T>(path).then(data => { if (current) setResult({ key, data }) })
      .catch(error => { if (current) setResult({ key, error: problem(error) }) })
    return () => { current = false }
  }, [path, key])
  return { ...(result?.key === key ? result : {}), retry: () => setAttempt(n => n + 1) }
}

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

const fullDate = new Intl.DateTimeFormat('ru-KZ', { day: 'numeric', month: 'long', year: 'numeric' })
const briefDate = new Intl.DateTimeFormat('ru-KZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const dateLabel = (value: string) => fullDate.format(new Date(value.length === 10 ? value + 'T12:00:00' : value))
export const dateTime = (value: string) => briefDate.format(new Date(value))
export const publicUrl = (slug: string) => new URL('/' + slug, window.location.origin).href
export const initials = (name: string) => (name.trim().split(/\s+/).length > 1
  ? name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') : name.trim().slice(0, 2)).toLocaleUpperCase('ru')

export function accessInfo(business: Business) {
  const trial = business.accessState === 'trial'
  const end = trial ? business.trialEndsAt : business.paidThrough
  const active = business.editable && (!end || Date.parse(end) > Date.now())
  return { active, end, label: active ? (trial ? 'Пробный период' : 'Активная подписка') : 'Доступ истёк' }
}

const transliteration: Record<string, string> = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'yo', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n',
  о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y',
  ь:'', э:'e', ю:'yu', я:'ya', ә:'a', ғ:'g', қ:'q', ң:'n', ө:'o', ұ:'u', ү:'u', һ:'h', і:'i',
}
export function suggestSlug(name: string) {
  return Array.from(name.toLowerCase(), letter => transliteration[letter] ?? letter).join('')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-|-$/g, '')
}
export function slugError(value: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length < 3 || value.length > 48)
    return 'От 3 до 48 символов: латинские буквы, цифры и дефисы между словами.'
  if ('api owner admin lab clean chistodom assets models marketing previews health healthz ready readyz livez metrics static public uploads favicon manifest dist src node_modules'.split(' ').includes(value))
    return 'Этот адрес зарезервирован. Выберите другой.'
}
export const normalizePhone = (phone: string) => phone.trim().replace(/[\s()-]/g, '')
export const validPhone = (phone: string) => /^\+[1-9]\d{7,14}$/.test(normalizePhone(phone))
