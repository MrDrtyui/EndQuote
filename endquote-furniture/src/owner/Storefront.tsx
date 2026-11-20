import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { ArrowUpRight, Check, Globe2, Link2, Upload } from 'lucide-react'
import { api, ApiError } from './api'
import { accessInfo, normalizePhone, problem, publicUrl, slugError, useUnsavedChanges, validPhone, type Business } from './data'
import { BusinessAvatar, Button, CopyLink, Feedback, Field, firstError, Modal, PageHeading, PreviewLink, type FormErrors, type Message } from './ui'

const profileFields = (b: Business) => ({ name: b.name, city: b.city, phone: b.phone, area: b.area, description: b.description, slug: b.slug })
const socialFields = (b: Business) => ({ instagram: b.social.instagram ?? '', tiktok: b.social.tiktok ?? '' })
type Social = 'instagram' | 'tiktok'
function validSocial(raw: string, key: Social) {
  if (!raw.trim()) return true
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && [key + '.com', 'www.' + key + '.com'].includes(url.hostname) && !url.username && !url.password && !url.port
  } catch { return false }
}
export default function Storefront({ business, setBusiness }: { business: Business; setBusiness: Dispatch<SetStateAction<Business>> }) {
  const [draft, setDraft] = useState(() => profileFields(business)), [social, setSocial] = useState(() => socialFields(business))
  const [tab, setTab] = useState<'publication' | 'profile' | 'identity'>('publication')
  const [errors, setErrors] = useState<FormErrors>({})
  const [busy, setBusy] = useState(''), [confirm, setConfirm] = useState(false)
  const [feedback, setFeedback] = useState<{ scope: string; message: Message } | null>(null)
  const [selectedLogo, setSelectedLogo] = useState(''), fileInput = useRef<HTMLInputElement>(null)
  const editable = accessInfo(business).active
  const locked = !editable || !!busy
  const profileDirty = JSON.stringify(draft) !== JSON.stringify(profileFields(business))
  const socialDirty = JSON.stringify(social) !== JSON.stringify(socialFields(business))
  useUnsavedChanges(profileDirty || socialDirty)
  function edit(key: keyof typeof draft, value: string) {
    setDraft(prev => ({ ...prev, [key]: value })); setErrors(prev => ({ ...prev, [key]: undefined })); setFeedback(null)
  }
  function feedbackFor(scope: string) { return <Feedback message={feedback?.scope === scope ? feedback.message : null} /> }
  function notify(scope: string, kind: Message['kind'], text: string) { setFeedback({ scope, message: { kind, text } }) }
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next = { name: draft.name.trim() ? undefined : 'Введите название компании.', city: draft.city.trim() ? undefined : 'Укажите город.',
      phone: validPhone(draft.phone) ? undefined : 'Введите номер с кодом страны, например +7 700 123 45 67.', slug: slugError(draft.slug) }
    setErrors(next); setFeedback(null)
    if (firstError(e.currentTarget, next)) return
    setBusy('profile')
    try {
      const result = await api<Business>('owner/profile', 'PATCH', { ...draft, phone: normalizePhone(draft.phone) })
      setBusiness(result); setDraft(profileFields(result)); notify('profile', 'success', 'Профиль сохранён')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setErrors({ slug: 'Этот адрес уже используется. Выберите другой.' })
      else notify('profile', 'error', problem(err))
    } finally { setBusy('') }
  }
  async function saveSocial(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next: FormErrors = {}
    for (const key of ['instagram','tiktok'] as const) if (!validSocial(social[key], key)) next[key] = 'Нужна HTTPS-ссылка на ' + key + '.com.'
    setErrors(next); setFeedback(null)
    if (firstError(e.currentTarget, next)) return
    setBusy('social')
    try {
      const links = Object.fromEntries(Object.entries(social).map(([k, v]) => [k, v.trim()]).filter(([,v]) => v))
      const result = await api<Business>('owner/profile', 'PATCH', { social: links })
      setBusiness(result); setSocial(socialFields(result)); notify('social', 'success', 'Социальные ссылки сохранены')
    } catch (err) { notify('social', 'error', problem(err)) } finally { setBusy('') }
  }
  async function upload(file: File) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      notify('logo', 'error', 'Выберите PNG, JPEG или WebP размером до 2 МБ.'); return
    }
    const preview = URL.createObjectURL(file)
    setSelectedLogo(preview); setBusy('logo'); setFeedback(null)
    try {
      const form = new FormData(); form.append('image', file)
      const { id } = await api<{ id: string }>('owner/logo', 'POST', form)
      setBusiness(current => ({ ...current, logoId: id })); notify('logo', 'success', 'Логотип сохранён')
    } catch (err) { notify('logo', 'error', problem(err)) } finally {
      setSelectedLogo(''); URL.revokeObjectURL(preview); setBusy('')
    }
  }
  async function publish() {
    setBusy('publish'); setFeedback(null)
    try {
      const result = await api<Business>('owner/profile', 'PATCH', { published: !business.published })
      setBusiness(result); notify('publish', 'success', result.published ? 'Витрина опубликована' : 'Витрина снята с публикации')
    } catch (err) { notify('publish', 'error', problem(err)) } finally { setBusy(''); setConfirm(false) }
  }
  return <div className="ow-page"><PageHeading title="Витрина" />
    <div className="ow-viewbar"><div className="ow-segments" role="group" aria-label="Настройки витрины">
      {([['publication','Публикация'],['profile','Профиль'],['identity','Оформление']] as const).map(([key,label]) =>
        <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}
    </div></div>
    <section hidden={tab !== 'publication'} className="ow-settings-pane ow-publication"><div className="ow-publish-heading"><span className="ow-tile-icon"><Globe2 size={21} /></span><div><h2>Публичная витрина</h2><p>{business.published && editable ? 'Клиенты могут рассчитать цену и отправить заявку.' : business.published ? 'Доступ к витрине приостановлен.' : 'Пока черновик виден только вам.'}</p></div>
      <span className={'ow-badge ' + (business.published && editable ? 'ow-status-live' : 'ow-status-draft')}><i />{business.published ? editable ? 'Опубликована' : 'Недоступна' : 'Черновик'}</span></div>
      <div className="ow-public-url"><Link2 size={17} />{business.published && editable
        ? <a href={'/' + business.slug} target="_blank" rel="noreferrer">{publicUrl(business.slug)}<ArrowUpRight size={14} /></a>
        : <span>{publicUrl(business.slug)}</span>}</div>
      <div className="ow-actions"><CopyLink key={business.slug} slug={business.slug} /><PreviewLink /><Button variant={business.published ? 'quiet' : 'primary'} disabled={locked} onClick={() => setConfirm(true)}>{business.published ? 'Снять с публикации' : 'Опубликовать'}</Button></div>
      {feedbackFor('publish')}</section>
    <div className="ow-settings-pane" hidden={tab === 'publication'}><form hidden={tab !== 'profile'} noValidate className="ow-panel ow-edit-panel ow-profile-form" onSubmit={saveProfile}>
      <div className="ow-setting-heading"><h2>Профиль компании</h2><p>Эти данные появятся на странице для клиентов.</p></div>
      <fieldset disabled={locked} className="ow-fields"><Field label="Название компании" name="name" required maxLength={100} autoComplete="organization" value={draft.name} error={errors.name} onChange={e => edit('name',e.target.value)} />
        <div className="ow-field-pair"><Field label="Город" name="city" required autoComplete="address-level2" maxLength={100} value={draft.city} error={errors.city} onChange={e => edit('city',e.target.value)} />
        <Field label="Телефон" name="phone" type="tel" required autoComplete="tel" value={draft.phone} error={errors.phone} onChange={e => edit('phone',e.target.value)} /></div>
        <Field label="Зона выезда" name="area" maxLength={180} placeholder="Например, город и до 20 км за его пределами" value={draft.area} onChange={e => edit('area',e.target.value)} />
        <label className="ow-field"><span className="ow-field-label">Описание</span><textarea name="description" rows={3} maxLength={1000} placeholder="Расскажите, какую мебель вы чистите и как работаете" value={draft.description} onChange={e => edit('description',e.target.value)} /></label>
        <Field label="Адрес витрины" name="slug" prefix={location.host + '/'} required maxLength={48} autoCapitalize="none" spellCheck={false} value={draft.slug} error={errors.slug}
          hint={draft.slug !== business.slug ? 'После сохранения прежняя ссылка перестанет открывать витрину.' : undefined} onChange={e => edit('slug',e.target.value.toLowerCase())} />
        {feedbackFor('profile')}<Button type="submit" busy={busy === 'profile'} disabled={!profileDirty}><Check size={16} />Сохранить профиль</Button>
      </fieldset></form>
      <div hidden={tab !== 'identity'} className="ow-setting-stack"><section className="ow-panel ow-edit-panel"><div className="ow-setting-heading"><h2>Логотип</h2><p>Изображение профиля на витрине.</p></div>
        <div className="ow-logo-form">{selectedLogo ? <img className="ow-logo-preview" src={selectedLogo} alt="Предпросмотр логотипа" /> : <BusinessAvatar business={business} />}
          <div><Button variant="secondary" busy={busy === 'logo'} disabled={locked} onClick={() => fileInput.current?.click()}><Upload size={15} />{business.logoId ? 'Заменить' : 'Загрузить'}</Button><small>PNG, JPEG, WebP · до 2 МБ</small></div></div>
        <input ref={fileInput} hidden type="file" aria-label="Логотип компании" accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file) }} />{feedbackFor('logo')}</section>
        <form noValidate className="ow-panel ow-edit-panel" onSubmit={saveSocial}><div className="ow-setting-heading"><h2>Социальные сети</h2><p>Добавьте ссылки на профили компании.</p></div>
          <fieldset disabled={locked} className="ow-fields">{(['instagram','tiktok'] as const).map(key => <Field key={key} name={key} label={key === 'instagram' ? 'Instagram' : 'TikTok'} type="url" autoCapitalize="none" spellCheck={false}
            value={social[key]} error={errors[key]} placeholder={'https://' + key + '.com/…'} onChange={e => { setSocial({ ...social, [key]: e.target.value }); setErrors(prev => ({ ...prev, [key]: undefined })); setFeedback(null) }} />)}
            {feedbackFor('social')}<Button variant="secondary" type="submit" busy={busy === 'social'} disabled={!socialDirty}>Сохранить ссылки</Button></fieldset></form>
      </div></div>
    {confirm && <Modal title={business.published ? 'Снять витрину с публикации?' : 'Опубликовать витрину?'} onClose={() => { if (!busy) setConfirm(false) }}><div className="ow-modal-body">
      <p>{business.published ? 'Клиенты больше не смогут открыть витрину. Полученные заявки останутся в кабинете.' : 'Клиенты увидят сохранённый профиль и цены. По публичной ссылке можно будет отправить заявку.'}</p>
      <div className="ow-actions ow-actions-end"><Button variant="secondary" disabled={!!busy} onClick={() => setConfirm(false)}>Назад</Button>
        <Button variant={business.published ? 'danger' : 'primary'} busy={busy === 'publish'} onClick={publish}>{business.published ? 'Снять с публикации' : 'Опубликовать'}</Button></div>
    </div></Modal>}
  </div>
}
