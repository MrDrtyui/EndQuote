import { useState, type FormEvent } from 'react'
import { BadgeCheck, CalendarDays, Check, Mail, ShieldCheck } from 'lucide-react'
import { api, ApiError } from './api'
import { accessInfo, dateLabel, problem, type Business } from './data'
import { Button, Feedback, Field, firstError, PageHeading, validEmail, type FormErrors, type Message } from './ui'

export function Subscription({ business }: { business: Business }) {
  const { active, end, label } = accessInfo(business)
  const trial = business.accessState === 'trial'
  return <div className="ow-page"><PageHeading title="Подписка">Условия доступа для компании «{business.name}».</PageHeading>
    <section className="ow-panel ow-access-panel"><div className="ow-access-lead"><span className="ow-tile-icon"><BadgeCheck size={25} /></span>
      <span className={'ow-badge ' + (active ? 'ow-status-live' : 'ow-status-draft')}><i />{active ? 'Доступ открыт' : 'Только просмотр'}</span></div>
      <h2>{label}</h2><p>{active ? 'Вы можете принимать заявки, менять цены и управлять витриной.' : 'Полученные заявки и настройки доступны для просмотра. Для редактирования продлите доступ через администратора.'}</p>
      <dl className="ow-access-facts"><div><dt><CalendarDays size={16} />{trial ? 'Пробный период до' : 'Окончание доступа'}</dt><dd>{end ? dateLabel(end) : active ? 'Без даты окончания' : 'Доступ завершён'}</dd></div>
        <div><dt><ShieldCheck size={16} />Продление</dt><dd>Через администратора EndQuote</dd></div></dl>
      <div className="ow-plan-note">Срок подписки меняет администратор. Автоматических списаний нет.</div>
    </section></div>
}
export function Account({ email, refreshSession }: { email: string; refreshSession: () => Promise<void> }) {
  const [newEmail, setNewEmail] = useState(''), [password, setPassword] = useState(''), [current, setCurrent] = useState('')
  const [errors, setErrors] = useState<FormErrors>({}), [message, setMessage] = useState<Message | null>(null), [busy, setBusy] = useState(false)
  const changedEmail = newEmail.trim().toLowerCase() !== email && !!newEmail.trim()
  function clear(key: string) { setErrors(prev => ({ ...prev, [key]: undefined })); setMessage(null) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = {
      email: newEmail && !validEmail(newEmail) ? 'Проверьте адрес почты.' : undefined,
      password: password && password.length < 12 ? 'Используйте не менее 12 символов.' : undefined,
      currentPassword: current ? undefined : 'Подтвердите изменение текущим паролем.',
    }
    setErrors(next); setMessage(null)
    if (firstError(event.currentTarget, next) || (!changedEmail && !password)) return
    setBusy(true)
    try {
      await api('owner/account', 'PATCH', { currentPassword: current, ...(changedEmail && { email: newEmail.trim() }), ...(password && { password }) })
      setCurrent(''); setPassword(''); setNewEmail('')
      await refreshSession(); setMessage({ kind: 'success', text: 'Данные аккаунта обновлены' })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PASSWORD') setErrors({ currentPassword: e.message })
      else if (e instanceof ApiError && e.status === 409) setErrors({ email: e.message })
      else setMessage({ kind: 'error', text: problem(e) })
    } finally { setBusy(false) }
  }
  return <div className="ow-page"><PageHeading title="Аккаунт">Данные для входа в кабинет EndQuote.</PageHeading>
    <div className="ow-panel ow-edit-panel ow-account-panel"><div className="ow-email-row"><span className="ow-tile-icon"><Mail size={20} /></span><div><small>Почта аккаунта</small><strong>{email}</strong></div></div>
      <form noValidate onSubmit={submit}><div className="ow-setting-heading"><h2>Изменить данные для входа</h2><p>Заполните только те поля, которые хотите изменить.</p></div>
        <fieldset disabled={busy} className="ow-fields"><Field label="Новая почта" type="email" name="email" autoComplete="email" maxLength={254} placeholder={email} value={newEmail} error={errors.email} onChange={e => { setNewEmail(e.target.value); clear('email') }} />
          <Field label="Новый пароль" name="password" type="password" autoComplete="new-password" maxLength={128} placeholder="Не менее 12 символов" value={password} error={errors.password} onChange={e => { setPassword(e.target.value); clear('password') }} />
          <div className="ow-rule" /><Field label="Текущий пароль" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} hint="Подтверждает, что изменения вносите вы." value={current} error={errors.currentPassword} onChange={e => { setCurrent(e.target.value); clear('currentPassword') }} />
          <Feedback message={message} /><Button type="submit" disabled={!changedEmail && !password} busy={busy}><Check size={16} />Обновить аккаунт</Button>
        </fieldset></form></div></div>
}
