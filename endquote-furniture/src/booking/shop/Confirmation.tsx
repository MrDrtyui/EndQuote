import { ArrowRight, CalendarDays, CheckCheck, Home, Info, Phone } from 'lucide-react'
import type { BookingFlow } from '../BookingApp'
import { formatMoney } from '../pricing'
import {useStore} from '../live/LiveStore'
import OrderLines from './OrderLines'

export default function Confirmation({ flow }: { flow: BookingFlow }) {
  const order = flow.order
  const {company}=useStore()
  if(flow.live&&flow.receipt)return <section className="sf-confirm"><h1>Заявка отправлена</h1><p>{company.name} получила заявку. Дату и время нужно согласовать отдельно.</p><p>Предварительная стоимость: {formatMoney(flow.receipt.total)}</p><button onClick={flow.returnToServices}>Вернуться к услугам</button></section>
  if (!order) return null
  const customer = order.customer
  const date = new Intl.DateTimeFormat('ru-KZ', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(customer.preferredDate + 'T12:00:00'))
  return <section className="sf-confirm">
    <header><span className="sf-success-icon"><CheckCheck size={27} /></span><p className="sf-kicker">Демо · {company.name}</p><h1 ref={flow.heading} tabIndex={-1}>Заявка сохранена</h1>
      <p>Спасибо, {customer.name}! Ниже все детали вашей заявки.</p><b className="sf-number">{order.number}</b></header>
    <p className="sf-local-note"><Info size={17} />Это демонстрация. Заявка сохранена только в этом браузере и не отправлена в «ЧистоДом».</p>
    <div className="sf-confirm-layout"><div className="sf-confirm-info"><h2>Детали выезда</h2>
      <dl>{[{ icon: Home, label: 'Адрес', value: customer.address }, { icon: CalendarDays, label: 'Желаемая дата', value: date }, { icon: Phone, label: customer.name, value: customer.phone }].map(row => <div key={row.icon.displayName}><row.icon size={17} /><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      {customer.comment && <p>{customer.comment}</p>}
      {customer.photos.length > 0 && <div className="sf-confirm-photos">{customer.photos.map(photo => <img key={photo.id} src={photo.dataUrl} alt={photo.name} />)}</div>}
    </div><div><h2>Состав заявки</h2><OrderLines items={order.items} assets={flow.assets} />
      <div className="sf-summary-total"><span>Предварительно</span><strong>{formatMoney(order.total)}</strong></div></div></div>
    <button className="sf-action sf-primary" onClick={flow.returnToServices}>Вернуться к услугам<ArrowRight size={16} /></button>
  </section>
}
