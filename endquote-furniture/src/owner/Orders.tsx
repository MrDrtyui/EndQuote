import { useState } from 'react'
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Filter, Image as ImageIcon, MapPin, Phone, Search, X } from 'lucide-react'
import { describeConfiguration, formatMoney } from '../booking/pricing'
import { api, ApiError } from './api'
import { dateLabel, dateTime, problem, statusGroups, statusLabels, statuses, useResource, type Order, type OrderDetail, type OrderPage, type Status } from './data'
import { Button, Empty, Feedback, LoadError, Loading, Modal, Notice, PageHeading, RefreshButton, StatusIcon, StatusBadge, type Message } from './ui'

export function OrderList({ orders, open, selected, compact = false }: { orders: Order[]; selected?: string; open: (id: string) => void; compact?: boolean }) {
  return <ul className={'ow-orders-list' + (compact ? ' ow-compact-list' : '')}>{orders.map(order =>
    <li key={order.id}><button className="ow-order-row" data-selected={selected === order.id || undefined} onClick={() => open(order.id)}>
      <span className="ow-order-id">#{order.id.slice(0, 7)}</span>
      <span className="ow-order-customer">{order.contact.name}</span>
      <span className="ow-order-meta">{compact ? <StatusBadge status={order.status} /> : order.contact.phone}</span>
      <b>{formatMoney(order.total)}</b><time dateTime={order.createdAt}>{dateTime(order.createdAt)}</time>
    </button></li>)}</ul>
}

function OrderGroup({ status, orders, open, selected }: { status: Status; orders: Order[]; selected?: string; open: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true)
  return <section className="ow-order-group"><h2><button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
    <ChevronDown size={12} /><StatusIcon status={status} />{statusGroups[status]}<small>{orders.length}</small>
  </button></h2>{expanded && <OrderList orders={orders} open={open} selected={selected} />}</section>
}
function findOrder(order: Order, query: string) {
  const text = query.trim().toLocaleLowerCase('ru')
  const number = text.replace(/[+()\s-]/g, '')
  return (number.length > 0 && /^\d+$/.test(number) && order.contact.phone.includes(number)) ||
    [order.contact.name, order.contact.address, order.id].some(value => value?.toLocaleLowerCase('ru').includes(text))
}

export default function Orders({ filter, version, open, selected, refresh }: { filter: Status | ''; version: number; selected?: string; open: (id: string) => void; refresh: () => void }) {
  const [query, setQuery] = useState('')
  return <div className="ow-page"><PageHeading title="Заявки" action={<RefreshButton onClick={refresh} />} />
    <section className="ow-queue"><div className="ow-order-tools">
      <div className="ow-search"><Search size={17} /><input type="search" aria-label="Поиск заявок" placeholder="Имя, телефон или адрес" value={query} onChange={e => setQuery(e.target.value)} />
        {query && <button type="button" className="ow-clear" aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15} /></button>}</div>
      <div className="ow-filter"><Filter size={15} /><select aria-label="Статус" value={filter} onChange={e => { location.hash = 'orders' + (e.target.value ? '/' + e.target.value : '') }}>
        <option value="">Все статусы</option>{statuses.map(status => <option key={status} value={status}>{statusGroups[status]}</option>)}</select></div>
    </div><OrderResults key={filter + '-' + version} filter={filter} query={query} open={open} selected={selected} reset={() => { setQuery(''); location.hash = 'orders' }} /></section>
  </div>
}
function OrderResults({ filter, query, open, selected, reset }: { filter: string; query: string; selected?: string; open: (id: string) => void; reset: () => void }) {
  const path = 'owner/orders' + (filter ? '?status=' + filter : '')
  const first = useResource<OrderPage>(path)
  const [more, setMore] = useState<OrderPage>(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (first.error) return <LoadError error={first.error} retry={first.retry} />
  if (!first.data) return <Loading label="Загружаем заявки…" />
  const loaded = [...first.data.orders, ...(more?.orders ?? [])]
  const rows = loaded.filter(order => findOrder(order, query))
  const cursor = more ? more.cursor : first.data.cursor
  async function loadMore() {
    if (!cursor || busy) return
    setBusy(true); setError('')
    try {
      const params = new URLSearchParams({ cursor })
      if (filter) params.set('status', filter)
      const next = await api<OrderPage>('owner/orders?' + params)
      setMore(prev => ({ orders: [...(prev?.orders ?? []), ...next.orders], cursor: next.cursor }))
    } catch (e) { setError(problem(e)) } finally { setBusy(false) }
  }
  return <>
    {rows.length ? statuses.map(status => {
      const group = rows.filter(order => order.status === status)
      return group.length > 0 && <OrderGroup key={status} status={status} orders={group} open={open} selected={selected} />
    }) : query || filter
      ? <Empty icon={Search} title="Заявки не найдены" action={<button className="ow-inline-link" onClick={reset}>Сбросить фильтры</button>}>Измените запрос или выберите другой статус.</Empty>
      : <Empty title="Заявок пока нет" action={<a className="ow-inline-link" href="#storefront">К витрине<ArrowRight size={14} /></a>}>Здесь появятся контакты клиента, состав заказа и предварительная стоимость.</Empty>}
    {error && <Notice kind="error">{error}</Notice>}
    {cursor && <div className="ow-list-foot"><span>{query ? 'Поиск по загруженным заявкам' : 'Загружено заявок'} · {loaded.length}</span><Button variant="secondary" busy={busy} onClick={loadMore}>Загрузить ещё</Button></div>}
  </>
}
export function OrderDrawer({ id, editable, close, onChange }: { id: string; editable: boolean; close: () => void; onChange: () => void }) {
  const detail = useResource<OrderDetail>('owner/orders/' + id)
  const [busy, setBusy] = useState(false), [confirmCancel, setConfirmCancel] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const order = detail.data
  async function transition(to: Status) {
    if (!order || busy) return
    setBusy(true); setMessage(null)
    try {
      await api('owner/orders/' + id + '/status', 'PATCH', { from: order.status, to })
      setConfirmCancel(false); setMessage({ kind: 'success', text: 'Статус обновлён' }); detail.retry(); onChange()
    } catch (e) {
      setMessage({ kind: 'error', text: problem(e) })
      if (e instanceof ApiError && e.status === 409) { setConfirmCancel(false); detail.retry(); onChange() }
    } finally { setBusy(false) }
  }
  return <Modal drawer title="Детали заявки" onClose={close}><div className="ow-modal-body ow-order-detail">
    <Feedback message={message} />
    {detail.error ? <LoadError error={detail.error} retry={detail.retry} /> : !order ? <Loading /> : <>
      <div className="ow-detail-lead"><div className="ow-detail-key"><span className="ow-order-id">#{order.id.slice(0, 7)}</span><StatusBadge status={order.status} /></div><h2>{order.contact.name}</h2><p>Получена {dateTime(order.createdAt)}</p></div>
      {editable && (order.status === 'new' || order.status === 'accepted') && <section className="ow-transition" aria-label="Изменить статус">
        {confirmCancel ? <div className="ow-inline-confirm"><p>Отменить заявку? Она останется в истории.</p><div className="ow-actions"><Button variant="danger" busy={busy} onClick={() => transition('cancelled')}>Да, отменить</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmCancel(false)}>Назад</Button></div></div> :
          <div className="ow-actions"><Button busy={busy} onClick={() => transition(order.status === 'new' ? 'accepted' : 'completed')}><Check size={15} />{order.status === 'new' ? 'Принять заявку' : 'Завершить заявку'}</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setConfirmCancel(true)}>Отменить заявку</Button></div>}</section>}
      <dl className="ow-contact-details"><div><dt><Phone size={15} />Телефон</dt><dd><a className="ow-inline-link" href={'tel:' + order.contact.phone}>{order.contact.phone}</a></dd></div>
        <div><dt><MapPin size={15} />Адрес</dt><dd>{order.contact.address}</dd></div>
        <div><dt><CalendarDays size={15} />Желаемая дата</dt><dd>{dateLabel(order.contact.preferredDate)}</dd></div></dl>
      {order.contact.comment && <section><h3>Комментарий клиента</h3><p>{order.contact.comment}</p></section>}
      <section><h3>Состав заявки</h3><ul className="ow-detail-items">{order.lines.map(({ snapshot: line }, i) => <li key={i}>
        <div><strong>{line.name}</strong><small>{line.quantity} × {formatMoney(line.unit)}</small>
          {line.configuration && <><small>{describeConfiguration(line.configuration)}</small>{line.configuration.notes && <small>{line.configuration.notes}</small>}</>}</div><b>{formatMoney(line.total)}</b>
      </li>)}</ul><div className="ow-detail-total"><span>Предварительная сумма</span><strong>{formatMoney(order.total)}</strong></div></section>
      {order.photos.length > 0 && <section><h3>Фотографии</h3><div className="ow-photos">{order.photos.map((photo, i) => <a key={photo.id} href={'/api/owner/photos/' + photo.id} target="_blank" rel="noreferrer" aria-label={'Открыть фото ' + (i + 1)}>
        <img src={'/api/owner/photos/' + photo.id} alt={'Фото ' + (i + 1)} /><ImageIcon size={13} /></a>)}</div></section>}
      <details className="ow-disclosure"><summary><Clock3 size={15} />История заявки<ChevronRight size={15} /></summary>
        <ul className="ow-history"><li><span>Заявка получена</span><time>{dateTime(order.createdAt)}</time></li>{order.events.filter(v => v.from).map((v, i) => <li key={i}><span>{statusLabels[v.to]}</span><time>{dateTime(v.createdAt)}</time></li>)}</ul>
        <small>Согласие клиента · {order.consentVersion} · {dateTime(order.consentAt)}</small></details>
    </>}
  </div></Modal>
}
