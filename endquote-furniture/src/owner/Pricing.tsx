import { useEffect, useRef, useState } from 'react'
import { Check, Layers3, Pencil, SlidersHorizontal, Sofa } from 'lucide-react'
import { CONTAMINATION_OPTIONS, EXTRA_OPTIONS, UPHOLSTERY_OPTIONS } from '../booking/pricing'
import { api, ApiError } from './api'
import { accessInfo, problem, useResource, useUnsavedChanges, type Business, type Catalog, type CatalogResponse, type Model } from './data'
import { Button, Empty, Feedback, Field, LoadError, Loading, Modal, PageHeading, type Message } from './ui'

const rateSections = [
  { key: 'upholstery', title: 'Материал обивки', note: 'Процент от базовой цены за выбранную ткань.', options: UPHOLSTERY_OPTIONS },
  { key: 'contamination', title: 'Степень загрязнения', note: 'Процент от базовой цены за состояние мебели.', options: CONTAMINATION_OPTIONS },
  { key: 'extras', title: 'Дополнительные услуги', note: 'Фиксированная доплата за один предмет.', options: EXTRA_OPTIONS },
] as const
type Tab = 'models' | 'categories' | 'rates'
type PriceModel = Omit<Model, 'base'> & { base: string }
type Draft = Omit<Catalog, 'models' | 'upholstery' | 'contamination' | 'extras'> & {
  models: PriceModel[]; upholstery: Record<string, string>; contamination: Record<string, string>; extras: Record<string, string>
}
function mapValues<T, U>(record: Record<string, T>, convert: (value: T) => U) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, convert(value)]))
}
function toDraft(catalog: Catalog): Draft {
  const percent = (bp: number) => String(bp / 100)
  return { ...catalog, models: catalog.models.map(m => ({ ...m, base: String(m.base) })),
    upholstery: mapValues(catalog.upholstery, percent), contamination: mapValues(catalog.contamination, percent), extras: mapValues(catalog.extras, String) }
}
function toNumber(text: string) { return Number(text.trim().replace(',', '.')) }
function numericError(text: string, percent = false) {
  const pattern = percent ? /^\d+(?:[.,]\d{1,2})?$/ : /^\d+$/
  if (!pattern.test(text.trim()) || toNumber(text) > (percent ? 300 : 1000000)) return percent
    ? 'От 0 до 300%, до двух знаков после запятой.' : 'Целое число от 0 до 1 000 000 ₸.'
}
function serialize(draft: Draft): Catalog {
  const basisPoints = (value: string) => Math.round(toNumber(value) * 100)
  return { ...draft, models: draft.models.map(m => ({ ...m, base: toNumber(m.base) })),
    upholstery: mapValues(draft.upholstery, basisPoints), contamination: mapValues(draft.contamination, basisPoints), extras: mapValues(draft.extras, toNumber) }
}
function Toggle({ label, checked, change }: { label: string; checked: boolean; change: (value: boolean) => void }) {
  return <label className="ow-toggle" title={label}><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={e => change(e.target.checked)} /><span aria-hidden="true" /></label>
}
type Props = { business: Business; active: boolean; onRevision: (rev: number) => void }
export default function Pricing(props: Props) {
  const data = useResource<CatalogResponse>('owner/catalog')
  return <div className="ow-page"><PageHeading title="Услуги и цены" />
    {data.error ? <LoadError error={data.error} retry={data.retry} /> : !data.data ? <Loading label="Загружаем каталог…" />
      : <CatalogEditor {...props} initial={data.data} reload={data.retry} />}
  </div>
}
function CatalogEditor({ business, active, onRevision, initial, reload }: Props & { initial: CatalogResponse; reload: () => void }) {
  const [saved, setSaved] = useState(initial), [draft, setDraft] = useState(() => toDraft(initial.catalog))
  const [tab, setTab] = useState<Tab>('models'), [category, setCategory] = useState('')
  const [editing, setEditing] = useState<PriceModel>(), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null), [conflict, setConflict] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [invalidId, setInvalidId] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved.catalog))
  const editable = accessInfo(business).active
  useUnsavedChanges(dirty)
  useEffect(() => {
    if (message?.kind !== 'success') return
    const timer = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [message])
  useEffect(() => {
    if (active && !dirty && !busy && business.catalogRevision > saved.revision) reload()
  }, [active, dirty, busy, business.catalogRevision, saved.revision, reload])
  useEffect(() => {
    if (!invalidId) return
    const input = form.current?.elements.namedItem(invalidId)
    if (input instanceof HTMLElement) input.focus()
    setInvalidId('')
  }, [invalidId])
  function change(next: Draft, key?: string) {
    setDraft(next); setMessage(null)
    if (key) setErrors(prev => ({ ...prev, [key]: undefined }))
  }
  function updateModel(id: string, patch: Partial<PriceModel>) {
    change({ ...draft, models: draft.models.map(m => m.id === id ? { ...m, ...patch } : m) }, 'base-' + id)
  }
  async function save() {
    const nextErrors: Record<string, string | undefined> = {}
    for (const m of draft.models) nextErrors['base-' + m.id] = numericError(m.base)
    for (const c of draft.categories) if (!c.name.trim()) nextErrors['cat-' + c.id] = 'Введите название категории.'
    for (const group of rateSections) for (const [key, value] of Object.entries(draft[group.key]))
      nextErrors[group.key + '-' + key] = numericError(value, group.key !== 'extras')
    setErrors(nextErrors)
    const invalid = Object.keys(nextErrors).find(key => nextErrors[key])
    if (invalid) {
      setTab(invalid.startsWith('base-') ? 'models' : invalid.startsWith('cat-') ? 'categories' : 'rates')
      setCategory(''); setInvalidId(invalid)
      setMessage({ kind: 'error', text: 'Проверьте выделенные поля.' })
      return
    }
    setBusy(true); setMessage(null)
    try {
      const result = await api<CatalogResponse>('owner/catalog', 'PUT', { revision: saved.revision, catalog: serialize(draft) })
      setSaved(result); setDraft(toDraft(result.catalog)); setConflict(false); onRevision(result.revision)
      setMessage({ kind: 'success', text: 'Цены сохранены' })
    } catch (e) {
      setConflict(e instanceof ApiError && e.status === 409)
      setMessage({ kind: 'error', text: problem(e) })
    } finally { setBusy(false) }
  }
  const models = draft.models.filter(m => !category || m.category === category)
  return <><form ref={form} className="ow-catalog" noValidate onSubmit={e => { e.preventDefault(); if (editable && dirty && !busy) void save() }}>
    <div className="ow-catalog-tools"><div className="ow-segments" role="group" aria-label="Настройки цен">
      {([{ key: 'models', text: 'Мебель', icon: Sofa }, { key: 'categories', text: 'Категории', icon: Layers3 }, { key: 'rates', text: 'Надбавки', icon: SlidersHorizontal }] as const).map(({ key, text, icon: Icon }) =>
        <button key={key} type="button" aria-pressed={key === tab} onClick={() => setTab(key)}><Icon size={15} />{text}</button>)}</div>
      {tab === 'models' && <select className="ow-select" aria-label="Фильтр по категории" value={category} onChange={e => setCategory(e.target.value)}>
        <option value="">Все категории</option>{draft.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
    </div>
    <fieldset disabled={busy || !editable} className="ow-catalog-body">
      {tab === 'models' && (models.length ? <div className="ow-model-list"><div className="ow-model-labels" aria-hidden="true"><span>Услуга</span><span className="ow-category-col">Категория</span><span>Базовая цена</span><span>Показ</span></div>{models.map(m => {
        const group = draft.categories.find(c => c.id === m.category)
        return <article className="ow-model-row" key={m.id}>
          <img className="ow-model-thumb" src={'/previews/' + m.id + '.webp'} alt="" loading="lazy" />
          <div className="ow-model-name"><h3>{m.name}</h3><small>{group?.name}{!group?.enabled && ' · Категория скрыта'}</small></div>
          <span className="ow-category-col">{group?.name}{!group?.enabled && ' · Скрыта'}</span>
          <Field className="ow-price-input" label="Базовая цена" aria-label={'Базовая цена · ' + m.name} name={'base-' + m.id} inputMode="numeric" unit="₸" value={m.base} error={errors['base-' + m.id]} onChange={e => updateModel(m.id, { base: e.target.value })}
            onBlur={() => setErrors(prev => ({ ...prev, ['base-' + m.id]: numericError(m.base) }))} />
          <Toggle label={'Показывать: ' + m.name} checked={m.enabled} change={enabled => updateModel(m.id, { enabled })} />
          <button type="button" className="ow-icon-btn" title={'Настроить: ' + m.name} aria-label={'Настроить: ' + m.name} onClick={() => setEditing({ ...m })}><Pencil size={14} /></button>
        </article>
      })}</div> : <Empty icon={Sofa} title="В категории нет мебели">Назначьте предмету эту категорию в его настройках.</Empty>)}
      {tab === 'categories' && <div className="ow-panel ow-edit-panel"><div className="ow-setting-heading"><h2>Категории мебели</h2><p>Название увидят клиенты. Скрытая категория убирает с витрины все её предметы.</p></div>
        {draft.categories.map(c => <div className="ow-category-row" key={c.id}><Field label="Название категории" name={'cat-' + c.id} value={c.name} maxLength={100} error={errors['cat-' + c.id]} onChange={e => change({ ...draft, categories: draft.categories.map(v => v.id === c.id ? { ...v, name: e.target.value } : v) }, 'cat-' + c.id)} />
          <div className="ow-enable-row"><span>{c.enabled ? 'На витрине' : 'Скрыта'}</span><Toggle label={'Показывать категорию: ' + c.name} checked={c.enabled} change={enabled => change({ ...draft, categories: draft.categories.map(v => v.id === c.id ? { ...v, enabled } : v) })} /></div></div>)}</div>}
      {tab === 'rates' && <div className="ow-rate-groups">{rateSections.map(group => <section className="ow-panel ow-edit-panel" key={group.key}><div className="ow-setting-heading"><h2>{group.title}</h2><p>{group.note}</p></div>
        {group.options.map(option => { const key = group.key + '-' + option.value
          return <div className="ow-rate-row" key={key}><div><label htmlFor={key}>{option.label}</label><small>{option.description}</small></div>
            <Field id={key} name={key} className="ow-rate-input" label={group.key === 'extras' ? 'Доплата' : 'Надбавка'} unit={group.key === 'extras' ? '₸' : '%'}
              inputMode={group.key === 'extras' ? 'numeric' : 'decimal'} value={draft[group.key][option.value]} error={errors[key]}
              onChange={e => change({ ...draft, [group.key]: { ...draft[group.key], [option.value]: e.target.value } }, key)} />
          </div> })}</section>)}</div>}
    </fieldset>
    <div className={'ow-save-bar' + (dirty || busy || message ? ' is-active' : '')}><div><Feedback message={message} />{!message && <span>{!editable ? 'Каталог доступен для просмотра' : dirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}</span>}
      {conflict && <button type="button" className="ow-text-link" onClick={() => { if (window.confirm('Загрузить актуальные цены и заменить ваши изменения?')) reload() }}>Загрузить актуальные цены</button>}</div>
      <Button type="submit" busy={busy} disabled={!editable || !dirty}><Check size={16} />Сохранить цены</Button></div>
  </form>
    {editing && <Modal title="Настройки услуги" onClose={() => setEditing(undefined)}><form className="ow-modal-body" onSubmit={e => {
      e.preventDefault()
      if (!editing.name.trim() || !editable) return
      updateModel(editing.id, { ...editing, name: editing.name.trim() })
      setEditing(undefined)
    }}>
      <Field label="Название услуги" value={editing.name} maxLength={100} onChange={e => setEditing({ ...editing, name: e.target.value })} />
      <label className="ow-field"><span className="ow-field-label">Категория</span><select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}>{draft.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="ow-actions ow-actions-end"><Button variant="secondary" onClick={() => setEditing(undefined)}>Отмена</Button><Button type="submit" disabled={!editing.name.trim() || !editable}>Применить</Button></div>
    </form></Modal>}
  </>
}
