import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronRight, Globe2, Link2, LogOut, MapPin, Store } from 'lucide-react'
import { api, ApiError } from './api'
import { type Business, normalizePhone, problem, publicUrl, slugError, suggestSlug, validPhone } from './data'
import { Brand, Button, Field, firstError, type FormErrors, Notice, validEmail } from './ui'

import {SocialButtons} from './Security'
import type {Provider} from './data'

export function AuthScreen({ register, refresh, providers }: { providers?:Provider[]; register: boolean; refresh: (delivery?:string) => Promise<void> }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const validate = (mail = email, secret = password) => ({
    email: validEmail(mail) ? undefined : 'Введите почту в формате name@example.kz.',
    password: secret.length < 12 ? (register ? 'Используйте не менее 12 символов.' : 'Введите пароль от аккаунта (не менее 12 символов).') : undefined,
  })
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const credentials = { email: String(fields.get('email') ?? '').trim(), password: String(fields.get('password') ?? '') }
    const next = validate(credentials.email, credentials.password)
    setErrors(next)
    setError('')
    if (firstError(event.currentTarget, next)) return
    setBusy(true)
    try { const result=await api<{verificationDelivery?:string}>('auth/' + (register ? 'register' : 'login'), 'POST', credentials); await refresh(result.verificationDelivery) }
    catch (e) {
      if (register && e instanceof ApiError && e.status === 409) setErrors({ email: 'Эта почта уже зарегистрирована. Войдите в кабинет.' })
      else setError(problem(e))
    } finally { setBusy(false) }
  }
  return <main className="ow-auth">
    <div className="ow-auth-main"><header><Brand /></header>
      <div className="ow-access-form">
        <h1>{register ? 'Создайте аккаунт' : 'Вход в кабинет'}</h1>
        {providers && providers.length > 0 && <><SocialButtons providers={providers}/><div className="eq-divider">или по почте</div></>}
        <form noValidate onSubmit={submit} onInput={() => setError('')}>
          <Field label="Почта" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder="name@company.kz" required maxLength={254} value={email} error={errors.email} disabled={busy}
            onChange={e => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: undefined })) }}
            onBlur={() => email && setErrors(prev => ({ ...prev, email: validate().email }))} />
          <Field label="Пароль" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'}
            placeholder={register ? 'Придумайте пароль' : 'Введите пароль'} hint={register ? 'Не менее 12 символов.' : undefined}
            error={errors.password} required maxLength={128} value={password} disabled={busy}
            onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })) }} />
          {!register && <a className="eq-forgot" href="/owner/forgot">Забыли пароль?</a>}
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" busy={busy} className="ow-wide">{register ? 'Создать аккаунт' : 'Войти'}{!busy && <ArrowRight size={16} />}</Button>
        </form>
        {providers?.length === 0 && <SocialButtons providers={providers}/>}
        <p className="ow-switch-auth">{register ? 'Уже есть аккаунт?' : 'Нет аккаунта?'} <a href={register ? '/owner/login' : '/owner/register'}>{register ? 'Войти' : 'Зарегистрироваться'}</a></p>
      </div>
      <footer><a className="ow-back" href="/"><ArrowLeft size={15} />На главную</a></footer>
    </div>
  </main>
}

export function Onboarding({ onCreated, logout, signingOut }: { onCreated: (business: Business) => void; logout: () => void; signingOut: boolean }) {
  const [name, setName] = useState(''), [city, setCity] = useState(''), [phone, setPhone] = useState('')
  const [slug, setSlug] = useState(''), [customSlug, setCustomSlug] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  function clear(key: string) { setErrors(prev => ({ ...prev, [key]: undefined })); setError('') }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = { name: name.trim() ? undefined : 'Введите название компании.', city: city.trim() ? undefined : 'Укажите город.',
      phone: validPhone(phone) ? undefined : 'Укажите номер с кодом страны, например +7 700 123 45 67.', slug: slugError(slug) }
    setErrors(next)
    setError('')
    if (firstError(event.currentTarget, next)) return
    setBusy(true)
    try { onCreated(await api<Business>('owner/business', 'POST', { name: name.trim(), city: city.trim(), phone: normalizePhone(phone), slug })) }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) setErrors({ slug: 'Этот адрес уже занят. Выберите другой.' })
      else setError(problem(e))
    } finally { setBusy(false) }
  }
  return <main className="ow-onboard">
    <header className="ow-onboard-bar"><Brand /><Button variant="quiet" busy={signingOut} onClick={logout}><LogOut size={16} />Выйти</Button></header>
    <div className="ow-onboard-layout"><div className="ow-onboard-form">
      <ol className="ow-steps" aria-label="Настройка, шаг 3 из 3"><li><Check size={13} />Аккаунт</li><li aria-hidden="true"><ChevronRight size={14} /></li><li><Check size={13} />Почта</li><li aria-hidden="true"><ChevronRight size={14} /></li><li aria-current="step"><span>3</span>Витрина</li></ol>
      <h1>Создайте витрину</h1><p className="ow-intro">Укажите, как клиентам найти вашу компанию и связаться с вами.</p>
      <form noValidate onSubmit={submit}><fieldset disabled={busy} className="ow-fields">
        <Field label="Название компании" name="name" value={name} placeholder="Например, Мята" maxLength={100} autoComplete="organization" required error={errors.name}
          onChange={e => { const v = e.target.value; setName(v); clear('name'); if (!customSlug) { setSlug(suggestSlug(v)); clear('slug') } }} />
        <div className="ow-field-pair">
          <Field label="Город" name="city" value={city} placeholder="Павлодар" autoComplete="address-level2" maxLength={100} required error={errors.city} onChange={e => { setCity(e.target.value); clear('city') }} />
          <Field label="Телефон" name="phone" type="tel" value={phone} placeholder="+7 700 123 45 67" autoComplete="tel" required error={errors.phone} onChange={e => { setPhone(e.target.value); clear('phone') }} />
        </div>
        <div className="ow-rule" />
        <Field label="Адрес витрины" name="slug" prefix={location.host + '/'} autoCapitalize="none" spellCheck={false}
          value={slug} placeholder="myata" required maxLength={48} hint="Эту ссылку можно отправить клиентам после публикации." error={errors.slug}
          onChange={e => { setCustomSlug(true); setSlug(e.target.value.toLowerCase()); clear('slug') }}
          onBlur={() => slug && setErrors(prev => ({ ...prev, slug: slugError(slug) }))} />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" busy={busy}>Сохранить черновик<ArrowRight size={16} /></Button>
      </fieldset></form>
    </div><aside className="ow-onboard-preview">
      <div className="ow-preview-label"><Globe2 size={15} />Так будет выглядеть витрина</div>
      <div className="ow-mini-store"><div className="ow-mini-cover"><img src="/previews/sofa-2-seater.webp" alt="" /></div>
        <div className="ow-mini-body"><span className="ow-mini-avatar"><Store size={22} /></span><h2>{name.trim() || 'Название компании'}</h2>
          <p><MapPin size={14} />{city.trim() || 'Ваш город'}</p>{phone.trim() && <p>{phone}</p>}
          <div className="ow-mini-url"><Link2 size={15} /><span>{slug ? publicUrl(slug) : location.host + '/…'}</span></div>
        </div>
      </div><p className="ow-preview-note">Сначала витрина будет видна только вам. Проверьте цены и опубликуйте её из кабинета.</p>
    </aside></div>
  </main>
}
