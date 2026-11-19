import { useEffect, useRef } from 'react'
import type { BookingFlow } from '../BookingApp'
import { getDemoOrder } from '../orders'

// Only in-page navigation belongs in history. Requests and cart contents
// continue to be owned by the existing booking controller.
export function useStoreNavigation(flow: BookingFlow): BookingFlow['go'] {
  const latest = useRef(flow)
  latest.current = flow
  useEffect(() => {
    function onBackOrForward() {
      const current = latest.current
      if (current.selected) current.closeConfig()
      const id = new URLSearchParams(location.search).get('order')
      const order = !current.live && id && getDemoOrder(id)
      if (order) {
        current.setOrder(order)
        current.go('success')
        return
      }
      const saved = history.state?.sfPage
      const next = saved === 'contact' && current.quantity ? 'contact' : saved === 'cart' || saved === 'contact' ? 'cart' : 'catalog'
      const y = history.state?.sfY
      current.go(next)
      if (next === 'catalog' && typeof y === 'number') {
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }))
      }
    }
    window.addEventListener('popstate', onBackOrForward)
    return () => window.removeEventListener('popstate', onBackOrForward)
  }, [])
  return next => {
    if (next === 'success' || next === flow.step) { flow.go(next); return }
    if (history.state?.sfPage === flow.step && history.state?.sfFrom === next) { history.back(); return }
    history.replaceState({ ...history.state, sfPage: flow.step, sfY: scrollY }, '')
    const url = new URL(location.href)
    url.searchParams.delete('order')
    url.hash = ''
    history.pushState({ sfPage: next, sfFrom: flow.step }, '', url)
    flow.go(next)
  }
}
