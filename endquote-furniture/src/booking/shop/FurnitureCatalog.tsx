import { useMemo, useRef } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Box, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Grid2X2, Info, MapPin, Ruler, Search, SlidersHorizontal, X } from 'lucide-react'
import type { BookingFlow } from '../BookingApp'
import type { FurnitureAsset } from '../../types'
import {useStore} from '../live/LiveStore'
import { formatMoney } from '../pricing'

export const dimensions = (asset: FurnitureAsset) =>
  [asset.dimensions.width, asset.dimensions.depth, asset.dimensions.height].map(n => Math.round(n * 100)).join(' × ')

function ServiceIntro({ flow, onContact }: { flow: BookingFlow; onContact: () => void }) {
  const example = flow.assets.find(item => item.id === 'sofa-l-shaped')
  const {company,pricing,logo,live}=useStore()
  return <section className="sf-intro" aria-labelledby="sf-shop-title">
    <div className="sf-intro-copy">
      <span className="sf-kicker"><i />Студия химчистки <b>/</b> {company.city}</span>
      {logo&&<img src={logo} width="56" height="56" alt=""/>}<h1 id="sf-shop-title">{company.name}</h1>
      <p>{company.tagline}.</p>
      <div className="sf-intro-actions">
        <a href="#sf-catalog" className="sf-action sf-primary">Выбрать мебель<ArrowDown size={16} /></a>
        <button className="sf-action sf-quiet" onClick={onContact} aria-label={'Связаться с '+company.name}><CircleHelp size={16} />Связаться</button>
      </div>
    </div>
    {(!live||example)&&<button type="button" disabled={!example} className="sf-feature" onClick={() => example && flow.configure(example)} aria-label="Настроить чистку углового дивана">
      <img src="/marketing/study-sofa-l-shaped.webp" alt="" width="1440" height="792" fetchPriority="high" draggable={false} />
      <span className="sf-feature-format"><Box size={14} />3D-каталог</span>
      <span className="sf-feature-info"><span>{live?example?.name:'Угловой диван'}</span><b>от {formatMoney(pricing.basePrices['sofa-l-shaped'])}</b><i><ArrowUpRight size={15} /></i></span>
    </button>}
  </section>
}

export default function FurnitureCatalog({ flow, sort, setSort, onContact }: {
  flow: BookingFlow; sort: string; setSort: (value: string) => void; onContact: () => void
}) {
  const { assets, filtered, category, query, setQuery, setCategory, configure, recent } = flow
  const search = useRef<HTMLInputElement>(null)
  const {pricing}=useStore()
  const ordered = useMemo(() => {
    if (sort === 'catalog') return filtered
    return [...filtered].sort((a, b) => (pricing.basePrices[a.id] - pricing.basePrices[b.id]) * (sort === 'ascending' ? 1 : -1))
  }, [filtered, sort,pricing])
  return <>
    <ServiceIntro flow={flow} onContact={onContact} />
    <section className="sf-catalog" id="sf-catalog" aria-labelledby="sf-catalog-title">
      <header className="sf-catalog-head">
        <div><span className="sf-kicker"><Grid2X2 size={12} />Каталог химчистки</span><h2 id="sf-catalog-title" ref={flow.heading} tabIndex={-1}>Услуги и цены</h2></div>
        <p>Выберите похожую мебель. Состав чистки и стоимость можно уточнить на следующем шаге.</p>
      </header>
      <div className="sf-catalog-tools">
        <div className="sf-categories" role="group" aria-label="Категории мебели">{flow.categories.map(group =>
          <button key={group.id} type="button" aria-pressed={category === group.id} onClick={e => {
            setCategory(group.id)
            // Keep the selected chip visible without moving the page vertically.
            const el = e.currentTarget
            const rail = el.parentElement!
            rail.scrollTo({ left: rail.scrollLeft + el.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - el.offsetWidth) / 2, behavior: 'instant' })
          }}>{group.name}</button>)}</div>
        <div className="sf-search"><Search size={17} /><input ref={search} type="search" aria-label="Найти мебель" placeholder="Найти мебель" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); setQuery(''); search.current?.blur() }
        }} />
          {query && <button type="button" aria-label="Очистить поиск" onClick={() => { setQuery(''); search.current?.focus() }}><X size={15} /></button>}</div>
      </div>
      <div className="sf-result-bar">
        <span role="status">{flow.loading ? 'Загружаем каталог…' : `Показано: ${ordered.length} из ${assets.length}`}</span>
        <label className="sf-sort"><SlidersHorizontal size={13} /><select value={sort} aria-label="Сортировка мебели" onChange={e => setSort(e.target.value)}>
          <option value="catalog">По каталогу</option><option value="ascending">Сначала дешевле</option><option value="descending">Сначала дороже</option>
        </select><ChevronDown size={12} /></label>
      </div>
      {flow.loading ? <div className="sf-grid" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div className="sf-skeleton" key={i} />)}</div>
      : flow.loadError ? <div className="sf-empty" role="alert"><Info /><h3>Не удалось открыть каталог</h3><p>{flow.loadError}</p><button className="sf-action sf-secondary" onClick={() => flow.setAttempt(n => n + 1)}>Попробовать снова</button></div>
      : ordered.length ? <div className="sf-grid">{ordered.map((asset, i) => {
        const count = flow.cart.filter(item => item.configuration.modelId === asset.id).reduce((sum, item) => sum + item.configuration.quantity, 0)
        return <button className="sf-product" key={asset.id} data-selected={count > 0} data-testid={`booking-card-${asset.id}`} onClick={() => configure(asset)}
          aria-label={`Настроить ${asset.name}, от ${formatMoney(pricing.basePrices[asset.id])}${count ? `, в заказе: ${count}` : ''}`}>
          <span className="sf-product-art" data-wide={asset.category === 'sofa' && asset.id !== 'sofa-bed'}>
            <img src={asset.preview} width="512" height="512" alt={asset.name} loading={i < 4 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
            <span className="sf-product-index">{String(assets.indexOf(asset) + 1).padStart(2, '0')}</span>
            <span className="sf-product-tag">{count ? <><Check size={11} />В заказе: {count}</> : <><Box size={11} />3D</>}</span>
          </span>
          <span className="sf-product-body booking-card-details"><strong className="sf-product-name">{asset.name}</strong>
            <span className="sf-product-size"><Ruler size={12} />{Math.round(asset.dimensions.width * 100)} × {Math.round(asset.dimensions.depth * 100)} см</span>
            <span className="sf-product-bottom"><span>от <b>{formatMoney(pricing.basePrices[asset.id])}</b></span><i><ArrowUpRight size={16} /></i></span>
          </span>
        </button>
      })}</div> : <div className="sf-empty"><Search /><h3>Такой мебели пока не нашлось</h3><p>Попробуйте другое название или категорию.</p><button className="sf-action sf-secondary" onClick={() => { setQuery(''); setCategory('all') }}>Показать всю мебель</button></div>}
      <p className="sf-catalog-note"><Info size={14} />Размеры указаны для ориентира. Точную стоимость мастер подтвердит после осмотра.</p>
      {recent && <button className="sf-recent" onClick={() => { flow.setOrder(recent); history.replaceState(null, '', `${location.pathname}?order=${recent.id}`); flow.go('success') }}>
        <CheckCheck size={19} /><span>Ваша демо-заявка {recent.number}<small>{formatMoney(recent.total)} · Сохранена в этом браузере</small></span><ChevronRight size={16} /></button>}
    </section>
  </>
}

export function StoreFooter({ contact }: { contact: () => void }) {
  const {company}=useStore()
  return <footer className="sf-footer"><span><MapPin size={14} />{company.city} · Выезд на дом</span><button onClick={contact}>Контакты студии<ArrowRight size={14} /></button><small>Витрина на <b>EndQuote</b></small></footer>
}
