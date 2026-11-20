import { useEffect, useState } from 'react'
import { api } from './api'
import { type Business, type Session, problem } from './data'
import { AuthScreen, Onboarding } from './Access'
import EmailVerification from './EmailVerification'
import { Brand, LoadError, Loading, Notice } from './ui'
import Workspace from './Workspace'
import {MailScreen} from './Security'
import './product.css'
import './access.css'
import './workspace.css'
import './security.css'

function canonical(path: string) {
  if (location.pathname === path) return
  history.replaceState(history.state, '', path === '/owner/verify' ? path : path + location.search + location.hash)
  window.scrollTo({ top: 0, behavior: 'instant' })
}
export default function OwnerApp() {
  const [session, setSession] = useState<Session>()
  const [delivery,setDelivery]=useState<string>()
  const [created, setCreated] = useState<Business>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const mailPage=['/owner/forgot','/owner/reset'].includes(location.pathname)
  const verifyPage=location.pathname==='/owner/verify'
  const [authNotice]=useState(()=>{
    const code=new URLSearchParams(location.search).get('auth')
    return code==='CANCEL'?'Вход отменён.':code==='EXISTS'?'Войдите прежним способом и подключите провайдера в настройках аккаунта.':code?'Не удалось завершить авторизацию. Попробуйте ещё раз.':''
  })
  const register = location.pathname === '/owner/register'
  useEffect(() => {
    let current = true
    api<Session>('auth/session').then(value => { if (current) setSession(value) })
      .catch(e => { if (current) setError(problem(e)) })
    return () => { current = false }
  }, [attempt])
  useEffect(() => {
    function sessionExpired(event: Event) {
      const updated = (event as CustomEvent<Session>).detail
      setError('')
      if (updated) {
        if (updated.owner?.id !== session?.owner?.id) setCreated(undefined)
        setSession(updated)
      } else {
        setCreated(undefined)
        setSession(undefined)
        setAttempt(n => n + 1)
      }
    }
    window.addEventListener('endquote:session-expired', sessionExpired)
    return () => window.removeEventListener('endquote:session-expired', sessionExpired)
  }, [session?.owner?.id])
  useEffect(() => {
    if (!session || mailPage) return
    // An email link can be consumed without a session, including on another device.
    if (verifyPage && (location.hash || !session.owner)) return
    const target=session.owner && !session.owner.verifiedAt ? '/owner/verify'
      : session.owner ? session.onboarded ? '/owner' : '/owner/onboard'
      : register ? '/owner/register' : '/owner/login'
    canonical(target)
    if (session.owner && !session.owner.verifiedAt) document.title='Подтверждение почты · EndQuote'
    else if (!session.owner || !session.onboarded) document.title = (session.owner ? 'Создание витрины' : register ? 'Регистрация' : 'Вход') + ' · EndQuote'
  }, [session, register, mailPage, verifyPage])

  async function refresh(result?:string) {
    if(result)setDelivery(result)
    setSession(await api<Session>('auth/session'))
  }
  async function logout() {
    setSigningOut(true)
    setError('')
    try {
      await api('auth/logout', 'POST', {})
      location.replace('/owner/login')
    } catch (e) { setError(problem(e)); setSigningOut(false) }
  }
  return <div className="ow-app">
    {!session ? <main className="ow-boot"><Brand />{error
      ? <LoadError error={error} retry={() => { setError(''); setAttempt(n => n + 1) }} />
      : <Loading label="Открываем кабинет…" />}</main> : <>
      {error && <Notice kind="error">{error}</Notice>}
      {authNotice && <Notice kind="info">{authNotice}</Notice>}
      {mailPage?<MailScreen/>:verifyPage && (Boolean(location.hash) || !session.owner) || session.owner && !session.owner.verifiedAt
        ? <EmailVerification email={session.owner?.normalizedEmail} alreadyVerified={Boolean(session.owner?.verifiedAt)} mailReady={session.mailReady} delivery={delivery} refresh={refresh} logout={session.owner ? logout : undefined} signingOut={signingOut} />
        : !session.owner ? <AuthScreen providers={session.providers} register={register} refresh={refresh} /> : !session.onboarded
        ? <Onboarding logout={logout} signingOut={signingOut} onCreated={business => { setCreated(business); setSession({ ...session, onboarded: true }) }} />
        : <Workspace providers={session.providers} key={session.owner.id} email={session.owner.normalizedEmail} logout={logout} signingOut={signingOut}
            created={created} dismissCreated={() => setCreated(undefined)} refreshSession={refresh} />}
    </>}
  </div>
}
