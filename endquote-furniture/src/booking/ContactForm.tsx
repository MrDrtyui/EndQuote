import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Camera, Home, Info, LoaderCircle, Plus, X } from 'lucide-react'
import type { CustomerDetails } from './domain'
import { formatPhone, localDate, validateCustomer } from './orders'
import { preparePhoto } from './photos'

export default function ContactForm({ customer, onChange, onSubmit, submitError, onPreparing, shop = false,live=false,consent,onConsent }: {
  live?:boolean;consent?:boolean;onConsent?:(value:boolean)=>void
  customer: CustomerDetails; onChange: (update: (current: CustomerDetails) => CustomerDetails) => void
  onSubmit: () => void; submitError: string; onPreparing: (value: boolean) => void; shop?: boolean
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerDetails, string>>>({})
  const [preparing, setPreparing] = useState(false)
  function change<K extends keyof CustomerDetails>(key: K, value: CustomerDetails[K]) {
    onChange((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    const next = validateCustomer(customer)
    setErrors(next)
    if (Object.keys(next).length) {
      document.getElementById(`contact-${Object.keys(next)[0]}`)?.focus()
    } else if (!preparing) onSubmit()
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (customer.photos.length + files.length > 3) { setErrors((current) => ({ ...current, photos: 'Можно прикрепить не больше трёх фотографий.' })); return }
    setPreparing(true); onPreparing(true)
    try {
      const photos = await Promise.all(files.map(async file=>({...await preparePhoto(file),...live&&{file}})))
      onChange((current) => ({ ...current, photos: [...current.photos, ...photos] }))
      setErrors((current) => ({ ...current, photos: undefined }))
    } catch (error) { setErrors((current) => ({ ...current, photos: error instanceof Error ? error.message : 'Не удалось прикрепить фотографию.' })) }
    finally { setPreparing(false); onPreparing(false) }
  }
  return <form id="booking-contact" noValidate onSubmit={submit} className="booking-contact-form">
    <section className="booking-form-card"><h2><Home size={18} />Контакты и адрес</h2>
      <label className="booking-field" htmlFor="contact-name">Ваше имя<span className="booking-required">*</span><input id="contact-name" name="name" autoComplete="given-name" value={customer.name} onChange={(event) => change('name', event.target.value)} placeholder="Например, Алия" maxLength={80} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'error-name' : undefined} />{errors.name && <small id="error-name" className="booking-field-error">{errors.name}</small>}</label>
      <label className="booking-field" htmlFor="contact-phone">Номер телефона<span className="booking-required">*</span><input id="contact-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={customer.phone} onChange={(event) => change('phone', formatPhone(event.target.value))} placeholder="+7 (700) 000-00-00" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'error-phone' : 'phone-hint'} /><small id="phone-hint">Номер Казахстана, начиная с +7</small>{errors.phone && <small id="error-phone" className="booking-field-error">{errors.phone}</small>}</label>
      <label className="booking-field" htmlFor="contact-address">Адрес<span className="booking-required">*</span><textarea id="contact-address" name="address" autoComplete="street-address" value={customer.address} onChange={(event) => change('address', event.target.value)} placeholder="Алматы, улица, дом, квартира" rows={2} maxLength={240} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'error-address' : undefined} />{errors.address && <small id="error-address" className="booking-field-error">{errors.address}</small>}</label>
      <label className="booking-field" htmlFor="contact-preferredDate">Желаемая дата<span className="booking-required">*</span><input id="contact-preferredDate" name="date" type="date" min={localDate()} value={customer.preferredDate} onChange={(event) => change('preferredDate', event.target.value)} aria-invalid={Boolean(errors.preferredDate)} aria-describedby={errors.preferredDate ? 'error-date' : 'date-hint'} /><small id="date-hint">Это пожелание. Дату и время нужно согласовать отдельно.</small>{errors.preferredDate && <small id="error-date" className="booking-field-error">{errors.preferredDate}</small>}</label>
      {shop && <div className="sf-date-choices" role="group" aria-label="Быстрый выбор даты">{['Сегодня', 'Завтра', 'Послезавтра'].map((title, i) => {
        const day = new Date()
        day.setDate(day.getDate() + i)
        const value = localDate(day)
        return <button type="button" key={title} aria-pressed={customer.preferredDate === value} onClick={() => change('preferredDate', value)}>{title}</button>
      })}</div>}
    </section>
    <section className="booking-form-card"><h2><Camera size={18} />Детали помогут подготовиться</h2><p className="booking-form-intro">Этот раздел можно пропустить.</p>
      <label className="booking-field" htmlFor="contact-comment">Комментарий к заказу<span className="booking-optional">Необязательно</span><textarea id="contact-comment" value={customer.comment} onChange={(event) => change('comment', event.target.value)} placeholder="Домофон, этаж, особенности мебели или удобное время" rows={3} maxLength={1000} />{errors.comment && <small className="booking-field-error">{errors.comment}</small>}</label>
      <div className="booking-photo-heading"><strong>Фотографии мебели</strong><span>До 3 фото · JPG, PNG, WebP</span></div><div className="booking-photos">{customer.photos.map((photo) => <div className="booking-photo" key={photo.id}><img src={photo.dataUrl} alt={photo.name} /><button type="button" aria-label={`Удалить фотографию ${photo.name}`} onClick={() => change('photos', customer.photos.filter((value) => value.id !== photo.id))}><X size={13} /></button></div>)}{customer.photos.length < 3 && <label className={`booking-photo-upload ${preparing ? 'disabled' : ''}`}><input id="contact-photos" type="file" aria-label="Фотографии мебели" accept="image/jpeg,image/png,image/webp" multiple disabled={preparing} onChange={upload} />{preparing ? <LoaderCircle size={22} className="animate-spin" /> : <Plus size={22} />}<span>{preparing ? 'Подготовка…' : 'Добавить фото'}</span></label>}</div>{errors.photos && <p role="alert" className="booking-field-error">{errors.photos}</p>}
    </section>
    {live?<label><input type="checkbox" checked={consent} onChange={e=>onConsent?.(e.target.checked)}/> Согласен передать контакты, адрес и выбранные фотографии исполнителю для обработки заявки.</label>:<div className="booking-demo-notice"><Info size={18} /><span>Это демонстрация. Заявка не будет отправлена реальной клининговой компании — мы сохраним её только в вашем браузере.</span></div>}
    {submitError && <div role="alert" className="booking-submit-error"><Info size={18} />{submitError}</div>}
  </form>
}
