import { ArrowRight, ArrowUpRight, CalendarDays, ChevronRight, Inbox, Settings2 } from 'lucide-react'
import { formatMoney } from '../booking/pricing'
import { accessInfo, publicUrl, statusGroups, statuses, useResource, type Business, type OrderPage, type Summary } from './data'
import { BusinessAvatar, CopyLink, Empty, LoadError, Loading, PageHeading, RefreshButton, StatusIcon } from './ui'
import { OrderList } from './Orders'

export default function Overview({ business, version, open, selected, refresh }: { business: Business; version: number; selected?: string; open: (id: string) => void; refresh: () => void }) {
  const summary = useResource<Summary>('owner/summary', version)
  const recent = useResource<OrderPage>('owner/orders', version)
  const counts = summary.data?.counts
  const total = counts ? statuses.reduce((sum, status) => sum + counts[status], 0) : 0
  const live = business.published && accessInfo(business).active
  const storefrontIdentity = <>
    <BusinessAvatar business={business} />
    <span className="ow-storefront-details">
      <strong title={business.name}>{business.name}</strong>
      <span className="ow-storefront-meta">
        <span title={publicUrl(business.slug)}>/{business.slug}</span>
        {business.city && <><span aria-hidden="true">·</span><span title={business.city}>{business.city}</span></>}
      </span>
    </span>
  </>
  return <div className="ow-page">
    <PageHeading title="Обзор" action={<RefreshButton onClick={refresh} />} />
    <div className="ow-overview-layout"><div className="ow-overview-main">
      <section className="ow-summary"><header className="ow-section-head"><h2>Сводка по заявкам</h2><span className="ow-period"><CalendarDays size={13} />Последние 30 дней</span></header>
        {summary.error ? <LoadError error={summary.error} retry={summary.retry} /> : summary.data && counts ?
          <dl className="ow-metrics"><div><dt>Всего заявок</dt><dd>{total}</dd></div>
            <div><dt>Новые</dt><dd><a href="#orders/new">{counts.new}<ChevronRight size={13} /></a></dd></div>
            <div><dt>Сумма оценок</dt><dd>{formatMoney(summary.data.estimate)}</dd></div></dl>
          : <Loading label="Загружаем статистику…" />}
      </section>
      <section className="ow-recent"><header className="ow-section-head"><h2><Inbox size={15} />Последние заявки</h2><a href="#orders" className="ow-inline-link">Все заявки<ArrowRight size={13} /></a></header>
        {recent.error ? <LoadError error={recent.error} retry={recent.retry} /> : !recent.data ? <Loading /> : recent.data.orders.length
          ? <OrderList orders={recent.data.orders.slice(0, 5)} open={open} selected={selected} compact />
          : <Empty title="Заявок пока нет" action={live ? <CopyLink slug={business.slug} /> : <a className="ow-btn ow-secondary" href="#storefront">Настроить витрину<ArrowRight size={13} /></a>}>
            {live ? 'Поделитесь витриной с клиентом. Полученная заявка появится здесь.' : 'Опубликуйте витрину, чтобы клиенты могли отправить первую заявку.'}</Empty>}
      </section>
    </div>
    <aside className="ow-inspector">
      <section className="ow-storefront-summary" aria-labelledby="ow-storefront-title">
        <header><h2 id="ow-storefront-title">Витрина</h2>
          <span className={'ow-badge ' + (live ? 'ow-status-live' : 'ow-status-draft')}><i />{live ? 'Опубликована' : business.published ? 'Недоступна' : 'Черновик'}</span>
        </header>
        {live
          ? <a className="ow-storefront-identity" href={publicUrl(business.slug)} target="_blank" rel="noreferrer" aria-label={'Открыть витрину «' + business.name + '» в новой вкладке'}>
              {storefrontIdentity}<ArrowUpRight size={14} aria-hidden="true" />
            </a>
          : <div className="ow-storefront-identity">{storefrontIdentity}</div>}
        <div className="ow-storefront-actions"><CopyLink slug={business.slug} label="Копировать ссылку" />
          <a className="ow-btn ow-quiet" href="#storefront"><Settings2 size={14} />Настройки витрины</a>
        </div>
      </section>
      <section><h2>По статусам <small>30 дней</small></h2>
        {counts ? <ul className="ow-breakdown">{statuses.map(status => <li key={status}>
          <a href={'#orders/' + status}><StatusIcon status={status} />{statusGroups[status]}<strong>{counts[status]}</strong></a>
        </li>)}</ul> : summary.error ? <LoadError error={summary.error} retry={summary.retry} /> : <Loading />}
      </section>
    </aside></div>
  </div>
}
