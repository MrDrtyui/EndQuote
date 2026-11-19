import { lazy, Suspense } from 'react'
import MarketingApp from './marketing/MarketingApp'
const BookingApp = lazy(() => import('./booking/BookingApp'))
const ShowcaseApp = lazy(() => import('./ShowcaseApp'))
const OwnerApp = lazy(() => import('./owner/OwnerApp'))
const LiveStore = lazy(() => import('./booking/live/LiveStore'))
const AdminApp=lazy(()=>import('./admin/AdminApp'))
export default function App() {
  const path = window.location.pathname
  if (path === '/') return <MarketingApp />
  return <Suspense fallback={<p role="status" style={{ padding: 24 }}>Открываем страницу…</p>}>
    {path === '/lab' ? <ShowcaseApp /> : ['/chistodom','/clean/chistodom'].includes(path) ? <BookingApp /> :
      ['/owner','/owner/login','/owner/register','/owner/onboard'].includes(path)? <OwnerApp/> :
      path==='/admin'?<AdminApp/>:path==='/owner/preview'?<LiveStore slug="" preview/>:/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)?<LiveStore slug={path.slice(1)}/>:
      <p>Страница не найдена</p>}
  </Suspense>
}
