import { ArrowLeft, ArrowRight, Check, ClipboardList, Info, Pencil, Plus, ShoppingBag } from 'lucide-react'
import type { BookingFlow } from '../BookingApp'
import { calculateItemPrice, formatMoney } from '../pricing'
import {useStore} from '../live/LiveStore'
import ContactForm from '../ContactForm'
import OrderLines from './OrderLines'

function PriceSummary({ flow }: { flow: BookingFlow }) {
  const {pricing}=useStore()
  return <aside className="sf-summary"><span className="sf-kicker"><ClipboardList size={14} />Сводка заказа</span>
    <dl>{flow.cart.map(item => {
      const a = flow.assets.find(asset => asset.id === item.configuration.modelId)
      return <div key={item.id}><dt>{a?.name ?? 'Мебель'} <span>× {item.configuration.quantity}</span></dt><dd>{formatMoney(calculateItemPrice(item.configuration,pricing).total)}</dd></div>
    })}</dl>
    <div className="sf-summary-total"><span>Предварительно</span><strong data-testid="cart-total" aria-live="polite">{formatMoney(flow.total)}</strong></div>
    <p><Info size={14} />Точную стоимость мастер согласует с вами до начала работ.</p>
    {flow.step === 'contact' && <button className="sf-text-button" onClick={() => flow.go('cart')}><Pencil size={13} />Изменить заказ</button>}
  </aside>
}

export default function Checkout({ flow }: { flow: BookingFlow }) {
  const contacts = flow.step === 'contact'
  const {company}=useStore()
  return <section className="sf-checkout">
    <div className="sf-checkout-nav"><button className="sf-back" onClick={() => flow.go(contacts ? 'cart' : 'catalog')}><ArrowLeft size={15} />{contacts ? 'К заказу' : 'К услугам'}</button>
      <ol aria-label="Этапы оформления"><li><Check size={12} />Каталог</li><li aria-current={!contacts ? 'step' : undefined}>{contacts ? <Check size={12} /> : <i />}Заказ</li><li aria-current={contacts ? 'step' : undefined}><i />Контакты</li></ol></div>
    <header className="sf-checkout-head"><span className="sf-kicker">{company.name} <b>/</b> Химчистка</span>
      <h1 ref={flow.heading} tabIndex={-1}>{contacts ? 'Куда приедем?' : 'Ваш заказ'}</h1>
      <p>{contacts ? flow.live?'Укажите контакты, адрес и желаемую дату.':'Укажите контакты, адрес и желаемую дату. Сейчас это демо: данные останутся в вашем браузере.' : 'Проверьте мебель и параметры чистки. Количество можно изменить прямо здесь.'}</p>
    </header>
    {flow.cart.length > 0 ? <div className="sf-checkout-layout">
      <div className="sf-checkout-main">{contacts
        ? <ContactForm live={flow.live} consent={flow.consented} onConsent={flow.setConsented} customer={flow.customer} onChange={value => { flow.setCustomer(value); flow.setSubmitError('') }} onSubmit={flow.submit} submitError={flow.submitError} onPreparing={flow.setPreparingPhotos} shop />
        : <><OrderLines items={flow.cart} assets={flow.assets} edit={flow.configure}
          remove={item => { flow.setCart(list => list.filter(i => i.id !== item.id)); flow.setToast('Предмет удалён из заказа') }}
          quantity={(item, next) => flow.setCart(list => list.map(i => i.id === item.id ? { ...i, configuration: { ...i.configuration, quantity: next } } : i))} />
          <button className="sf-more" onClick={() => flow.go('catalog')}><Plus size={17} />Добавить ещё мебель</button></>}
      </div>
      <PriceSummary flow={flow} />
    </div> : <div className="sf-empty"><ShoppingBag size={30} /><h2>Здесь пока пусто</h2><p>Выберите предмет, чтобы рассчитать чистку и добавить его в заказ.</p><button className="sf-action sf-primary" onClick={() => flow.go('catalog')}>Выбрать мебель<ArrowRight size={16} /></button></div>}
  </section>
}
