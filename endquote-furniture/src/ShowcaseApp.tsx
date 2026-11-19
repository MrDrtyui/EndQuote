import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Box, Check, ChevronRight, LoaderCircle, Maximize2, MousePointer2, RotateCcw, Search, Sparkles, X } from 'lucide-react'
import { categoryNames, formatFileSize, isFurnitureAsset } from './types'
import type { FurnitureAsset } from './types'

const FurnitureViewer = lazy(() => import('./components/FurnitureViewer'))
const number = new Intl.NumberFormat('ru-RU')
const meters = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
const filters = [
  { id: 'all', label: 'Все предметы', categories: [] as string[] },
  { id: 'sofas', label: 'Диваны', categories: ['sofa'] },
  { id: 'seating', label: 'Кресла и стулья', categories: ['armchair', 'chair'] },
  { id: 'bedroom', label: 'Для спальни', categories: ['mattress', 'headboard'] },
  { id: 'ottomans', label: 'Пуфы', categories: ['ottoman'] },
]

function Wordmark() {
  return <a className="wordmark" href="#" aria-label="EndQuote — в начало">
    <span className="brand-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 10h9v4h-5v4h5v4H7zm18 12h-9v-4h5v-4h-5v-4h9z" fill="currentColor" /></svg></span>
    <span>EndQuote<span className="wordmark-period">.</span></span>
  </a>
}

function CatalogCard({ asset, index, onSelect }: { asset: FurnitureAsset; index: number; onSelect: (asset: FurnitureAsset) => void }) {
  return <button
    className="furniture-card group text-left focus-visible:outline-2 focus-visible:outline-offset-4"
    onClick={() => onSelect(asset)}
    aria-label={`Открыть ${asset.name} в 3D`}
    data-testid={`model-card-${asset.id}`}
    style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
  >
    <div className="card-art">
      <span className="card-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <img src={asset.preview} alt={asset.name} width="512" height="512" loading="lazy" decoding="async" draggable="false" />
      <span className="card-open" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.6} /></span>
      <span className="card-3d" aria-hidden="true"><Box size={13} strokeWidth={1.5} /> Смотреть в 3D</span>
    </div>
    <div className="card-caption">
      <h3>{asset.name}</h3>
      <div className="card-metadata"><span>{categoryNames[asset.category] ?? asset.category}</span><span className="metadata-dot" /><span>{formatFileSize(asset.file_size_bytes)}</span><span className="card-format">GLB</span></div>
    </div>
  </button>
}

function ViewerSkeleton({ asset }: { asset: FurnitureAsset }) {
  return <div className="viewer-skeleton" role="status" aria-live="polite">
    <img src={asset.preview} alt="" aria-hidden="true" />
    <span><LoaderCircle className="animate-spin" size={16} /> Подготавливаем 3D-просмотр</span>
  </div>
}

function ModelDialog({ asset, assets, onSelect, onClose }: { asset: FurnitureAsset; assets: FurnitureAsset[]; onSelect: (asset: FurnitureAsset) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [resetToken, setResetToken] = useState(0)
  const [ready, setReady] = useState(false)
  const [viewerError, setViewerError] = useState('')
  const index = assets.findIndex((model) => model.id === asset.id)
  const handleReady = useCallback((value: boolean) => setReady(value), [])
  const handleError = useCallback((message: string) => setViewerError(message), [])

  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  useEffect(() => {
    setReady(false)
    setViewerError('')
  }, [asset.id])

  function navigate(direction: number) {
    setReady(false)
    onSelect(assets[(index + direction + assets.length) % assets.length])
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]') ?? [])
        .filter((element) => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }

  return <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialog} className="model-dialog" role="dialog" aria-modal="true" aria-labelledby="model-name" aria-describedby="model-description" onKeyDown={onKeyDown}>
      <div className="dialog-toolbar">
        <div className="dialog-breadcrumb"><Box size={16} strokeWidth={1.5} /><span>Коллекция</span><ChevronRight size={13} /><span>Просмотр модели</span></div>
        <div className="dialog-toolbar-actions">
          <span className="dialog-counter">{String(index + 1).padStart(2, '0')} <span>/ {assets.length}</span></span>
          <button className="icon-button close-button" ref={closeButton} onClick={onClose} aria-label="Закрыть просмотр"><X size={20} strokeWidth={1.6} /></button>
        </div>
      </div>

      <div className="dialog-content">
        <div className="viewer-column">
          <div className="studio-label" aria-hidden="true">ENDQUOTE <span>/</span> OBJECT STUDIO</div>
          <div className={`viewer-mode ${ready ? 'is-ready' : ''}`} aria-live="polite"><span />{ready ? 'Интерактивный 3D' : viewerError ? 'Изображение модели' : 'Загрузка 3D'}</div>
          <Suspense fallback={<ViewerSkeleton asset={asset} />}>
            <FurnitureViewer asset={asset} resetToken={resetToken} onReady={handleReady} onError={handleError} />
          </Suspense>
          <div className="viewer-bottom-label" aria-hidden="true"><MousePointer2 size={15} strokeWidth={1.5} /><span>Потяните, чтобы повернуть</span><span className="viewer-hint-separator" /><span>Прокрутите для масштаба</span></div>
        </div>

        <aside className="model-inspector">
          <div className="inspector-heading">
            <span className="eyebrow">{categoryNames[asset.category] ?? asset.category}</span>
            <h2 id="model-name">{asset.name}</h2>
            <p id="model-description">Рассмотрите форму и детали<br className="desktop-break" /> со всех сторон.</p>
          </div>
          <div className="dimensions-block">
            <div className="section-label">Размеры <span>м</span></div>
            <div className="dimensions-grid">
              <div><strong>{meters.format(asset.dimensions.width)}</strong><span>Ширина</span></div>
              <div><strong>{meters.format(asset.dimensions.depth)}</strong><span>Глубина</span></div>
              <div><strong>{meters.format(asset.dimensions.height)}</strong><span>Высота</span></div>
            </div>
          </div>
          <dl className="technical-details">
            <div><dt>Треугольники</dt><dd>{number.format(asset.triangle_count)}</dd></div>
            <div><dt>Размер файла</dt><dd>{formatFileSize(asset.file_size_bytes)}</dd></div>
            <div><dt>Материалы</dt><dd>{asset.material_count}</dd></div>
            <div><dt>Draw calls</dt><dd>{asset.draw_calls}</dd></div>
          </dl>
          <div className="inspector-tags"><span><Box size={12} /> GLB 2.0</span><span><Maximize2 size={12} /> Масштаб 1:1</span></div>
          <div className="inspector-actions">
            <button className="reset-button" onClick={() => setResetToken((token) => token + 1)} disabled={!ready}><RotateCcw size={16} strokeWidth={1.7} />Сбросить вид</button>
            <p className="touch-hint">Один палец — вращение.<br />Два пальца — приближение.</p>
          </div>
        </aside>
      </div>
      <div className="dialog-footer">
        <button onClick={() => navigate(-1)} className="model-navigation" aria-label="Предыдущая модель"><ArrowLeft size={16} /> <span>Предыдущая</span></button>
        <span className="dialog-footer-caption"><span className="status-dot" />{assets.length} предметов. Бесконечно много ракурсов.</span>
        <button onClick={() => navigate(1)} className="model-navigation" aria-label="Следующая модель"><span>Следующая</span> <ArrowRight size={16} /></button>
      </div>
    </div>
  </div>
}

export default function App() {
  const [assets, setAssets] = useState<FurnitureAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [activeFilter, setActiveFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<FurnitureAsset | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const openModel = useCallback((asset: FurnitureAsset) => {
    opener.current = document.activeElement as HTMLElement | null
    setSelected(asset)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch('/manifest.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<unknown>
      })
      .then((data) => {
        if (!Array.isArray(data) || !data.length || !data.every(isFurnitureAsset)) throw new Error('Некорректный manifest.json')
        setAssets(data)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Неизвестная ошибка')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])

  const visible = useMemo(() => {
    const categoryFilter = filters.find((filter) => filter.id === activeFilter)!
    const search = query.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е')
    return assets.filter((asset) => (!categoryFilter.categories.length || categoryFilter.categories.includes(asset.category))
      && `${asset.name} ${categoryNames[asset.category] ?? asset.category}`.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').includes(search))
  }, [assets, activeFilter, query])
  const featured = assets.find((asset) => asset.id === 'armchair') ?? assets[0]
  const close = useCallback(() => {
    setSelected(null)
    requestAnimationFrame(() => opener.current?.focus({ preventScroll: true }))
  }, [])

  return <>
    <div className="site-shell" inert={selected !== null}>
      <header className="site-header">
        <div className="page-container header-content">
          <div className="brand-group"><Wordmark /><span className="brand-divider" /><span className="lab-label">Furniture Lab</span></div>
          <nav className="header-navigation" aria-label="Основная навигация"><a href="#collection" className="active">Коллекция</a><a href="#about">О проекте</a></nav>
          <span className="preview-badge"><span className="status-dot" />Тестовая библиотека</span>
        </div>
      </header>

      <main className="page-container">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow hero-eyebrow"><span />Форма обретает объём</span>
            <h1 id="hero-title">Знакомая мебель.<br /><span>Новый ракурс.</span></h1>
            <p>Небольшая коллекция, продуманная в деталях.<br className="desktop-break" /> Выберите предмет и рассмотрите его в 3D.</p>
            <a className="collection-link" href="#collection">Исследовать коллекцию <ArrowDown size={16} strokeWidth={1.6} /></a>
          </div>
          {featured && <button className="hero-feature" onClick={() => openModel(featured)} aria-label={`Рассмотреть ${featured.name} в 3D`}>
            <span className="hero-feature-cross cross-top" aria-hidden="true">+</span><span className="hero-feature-cross cross-bottom" aria-hidden="true">+</span>
            <span className="hero-orbit" aria-hidden="true" />
            <img src={featured.preview} alt={featured.name} width="512" height="512" fetchPriority="high" draggable="false" />
            <span className="feature-note"><span className="feature-note-icon"><Box size={16} strokeWidth={1.5} /></span><span>Ближе к форме.<small>Поверните. Приблизьте. Изучите.</small></span><ArrowUpRight size={17} strokeWidth={1.5} /></span>
            <span className="feature-coordinate" aria-hidden="true">OBJECT / {featured.id.toUpperCase()}</span>
          </button>}
        </section>

        <section id="collection" className="collection-section" aria-labelledby="collection-title">
          <div className="collection-heading">
            <div><h2 id="collection-title">Коллекция <span className="collection-count">{assets.length || '—'}</span></h2><p>Формы, с которыми приятно познакомиться.</p></div>
            <span className="collection-hint"><Box size={15} strokeWidth={1.5} />Каждый предмет можно рассмотреть в 3D</span>
          </div>
          <div className="catalog-tools">
            <div className="category-filters" role="group" aria-label="Категории мебели">
              {filters.map((filter) => {
                const count = assets.filter((asset) => !filter.categories.length || filter.categories.includes(asset.category)).length
                return <button key={filter.id} aria-pressed={activeFilter === filter.id} onClick={() => setActiveFilter(filter.id)} className={`filter-button ${activeFilter === filter.id ? 'is-active' : ''}`}>
                  {filter.label}<span>{count}</span>
                </button>
              })}
            </div>
            <div className="search-field"><Search size={16} strokeWidth={1.6} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти предмет" aria-label="Поиск мебели" />{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={14} /></button>}</div>
          </div>
          {loading ? <div className="catalog-grid" aria-busy="true" aria-label="Загрузка коллекции">{Array.from({ length: 6 }, (_, index) => <div key={index} className="card-skeleton animate-pulse"><div /><span /><span /></div>)}</div>
            : error ? <div className="catalog-message" role="alert"><Box size={28} /><h3>Не удалось открыть коллекцию</h3><p>Проверьте доступность manifest.json и попробуйте снова.</p><small>{error}</small><button onClick={() => setAttempt((value) => value + 1)}>Попробовать снова <ArrowRight size={15} /></button></div>
              : visible.length ? <><div className="catalog-grid">{visible.map((asset) => <CatalogCard key={asset.id} asset={asset} index={assets.indexOf(asset)} onSelect={openModel} />)}</div><div className="catalog-bottom-note"><Check size={14} />{visible.length === assets.length ? 'Вся коллекция перед вами' : `Найдено предметов: ${visible.length}`}<span>Каждый предмет можно рассмотреть со всех сторон.</span></div></>
                : <div className="catalog-message" role="status"><Search size={28} /><h3>Пока ничего не нашлось</h3><p>Попробуйте другое название или выберите все предметы.</p><button onClick={() => { setQuery(''); setActiveFilter('all') }}>Показать всю коллекцию <ArrowRight size={15} /></button></div>}
        </section>
      </main>

      <footer className="site-footer" id="about"><div className="page-container footer-content"><div><span className="footer-brand">EndQuote<span>.</span></span><p>Меньше догадок. Больше ясности.</p></div><div className="footer-project"><span><Sparkles size={14} strokeWidth={1.5} />Небольшое пространство для больших ракурсов.</span><p>Furniture Lab — только для просмотра и тестирования 3D-моделей.</p></div><a href="#collection" aria-label="Вернуться к коллекции"><ArrowUpRight size={18} /></a></div></footer>
    </div>
    {selected && <ModelDialog asset={selected} assets={assets} onSelect={setSelected} onClose={close} />}
  </>
}
