import { ArrowRight, CalendarDays, ClipboardList, Inbox, Link2, ReceiptText, Store, type LucideIcon } from 'lucide-react'
import { formatMoney } from '../booking/pricing'
import { accessInfo, statusGroups, statuses, useResource, type Business, type OrderPage, type Summary } from './data'
import { CopyLink, Empty, LoadError, Loading, PageHeading, RefreshButton } from './ui'
import { OrderList } from './Orders'

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return <div className="ow-metric"><div><span>{label}</span><Icon size={17} /></div><strong>{value}</strong></div>
}
export default function Overview({ business, version, open, refresh }: { business: Business; version: number; open: (id: string) => void; refresh: () => void }) {
  const summary = useResource<Summary>('owner/summary', version)
  const recent = useResource<OrderPage>('owner/orders', version)
  const counts = summary.data?.counts
  const total = counts && statuses.reduce((sum, status) => sum + counts[status], 0)
  const live = business.published && accessInfo(business).active
  return <div className="ow-page">
    <PageHeading title="Обзор" action={<RefreshButton onClick={refresh} />} />
    <section className="ow-hero"><div className="ow-hero-body">
      <div className="ow-hero-label"><Store size={15} />Ваша витрина<span className={'ow-badge ' + (live ? 'ow-status-live' : 'ow-status-draft')}><i />{live ? 'Опубликована' : business.published ? 'Недоступна' : 'Черновик'}</span></div>
      <h2>{business.name}</h2><div className="ow-hero-url"><Link2 size={14} /><span>{location.host}/{business.slug}</span></div>
      <div className="ow-actions"><a href="#storefront" className="ow-btn ow-primary">Настроить витрину<ArrowRight size={15} /></a><CopyLink slug={business.slug} /></div>
    </div><div className="ow-hero-art" aria-hidden="true"><img src="/previews/sofa-2-seater.webp" alt="" /></div></section>
    <section className="ow-stat-section" aria-label="Статистика заявок"><div className="ow-section-title"><h2>Статистика заявок</h2><span className="ow-period"><CalendarDays size={14} />Последние 30 дней</span></div>
      {summary.error ? <LoadError error={summary.error} retry={summary.retry} /> : counts && summary.data ?
        <div className="ow-metrics"><Metric icon={ClipboardList} label="Всего заявок" value={total!} /><Metric icon={Inbox} label="Новые заявки" value={counts.new} /><Metric icon={ReceiptText} label="Сумма оценок" value={formatMoney(summary.data.estimate)} /></div>
        : <Loading label="Загружаем статистику…" />}
    </section>
    <div className="ow-overview-lower"><section className="ow-panel">
      <header className="ow-panel-head"><h2>Последние заявки</h2><a href="#orders" className="ow-inline-link">Все заявки<ArrowRight size={14} /></a></header>
      {recent.error ? <LoadError error={recent.error} retry={recent.retry} /> : !recent.data ? <Loading /> : recent.data.orders.length
        ? <OrderList orders={recent.data.orders.slice(0, 5)} open={open} compact />
        : <Empty title="Заявок пока нет">{live ? 'Отправьте клиенту ссылку на витрину. Его заявка появится здесь.' : 'Опубликуйте витрину и поделитесь ссылкой с клиентами.'}</Empty>}
    </section><section className="ow-panel ow-breakdown"><header className="ow-panel-head"><h2>По статусам</h2></header>
      {counts ? <div className="ow-breakdown-body"><div className="ow-status-bar" aria-hidden="true">{!!total && statuses.filter(s => counts[s]).map(s => <i key={s} className={'ow-color-' + s} style={{ flexGrow: counts[s] }} />)}</div>
        <ul>{statuses.map(s => <li key={s}><a href={'#orders/' + s}><i className={'ow-status-dot ow-color-' + s} />{statusGroups[s]}<strong>{counts[s]}</strong></a></li>)}</ul>
      </div> : summary.error ? <LoadError error={summary.error} retry={summary.retry} /> : <Loading />}</section></div>
  </div>
}
