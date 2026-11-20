import { useEffect, useState } from 'react'
import { api } from './api'
import { type Business, type Session, problem } from './data'
import { AuthScreen, Onboarding } from './Access'
import { Brand, LoadError, Loading, Notice } from './ui'
import Workspace from './Workspace'
import {MailScreen} from './Security'
import './product.css'
import './access.css'
import './workspace.css'
import './security.css'

function canonical(path: string) {
  if (location.pathname === path) return
  history.replaceState(history.state, '', path + location.search + location.hash)
  window.scrollTo({ top: 0, behavior: 'instant' })
}
export default function OwnerApp() {
  const [session, setSession] = useState<Session>()
  const [delivery,setDelivery]=useState<string>()
  const [created, setCreated] = useState<Business>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const mailPage=['/owner/forgot','/owner/verify','/owner/reset'].includes(location.pathname)
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
    canonical(session.owner ? session.onboarded ? '/owner' : '/owner/onboard' : register ? '/owner/register' : '/owner/login')
    if (!session.owner || !session.onboarded) document.title = (session.owner ? 'Создание витрины' : register ? 'Регистрация' : 'Вход') + ' · EndQuote'
  }, [session, register, mailPage])

  async function refresh(result?:string) {
    if(result)setDelivery(result)
    setSession(await api<Session>('auth/session'))
  }
  let verification: string | undefined
  if(session?.owner && !session.owner.verifiedAt){
    if(delivery==='unavailable') verification='Письмо отправить не удалось. Сохраните черновик и запросите новое письмо в настройках.'
    else if(session.mailReady) verification='Для публикации витрины подтвердите почту. Новое письмо можно запросить в настройках аккаунта.'
    else verification='Отправка писем временно недоступна. Вы можете сохранить черновик витрины.'
  }
  const signInToConfirm=location.pathname==='/owner/verify' && new URLSearchParams(location.search).get('signin')==='1' && !session?.owner
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
      {signInToConfirm && <Notice kind="info">Войдите в свой аккаунт, чтобы подтвердить адрес из письма.</Notice>}
      {signInToConfirm?<AuthScreen register={false} refresh={refresh}/>:mailPage?<MailScreen/>:!session.owner ? <AuthScreen providers={session.providers} register={register} refresh={refresh} /> : !session.onboarded
        ? <Onboarding verification={verification} logout={logout} signingOut={signingOut} onCreated={business => { setCreated(business); setSession({ ...session, onboarded: true }) }} />
        : <Workspace providers={session.providers} key={session.owner.id} email={session.owner.normalizedEmail} logout={logout} signingOut={signingOut}
            created={created} dismissCreated={() => setCreated(undefined)} refreshSession={refresh} />}
    </>}
  </div>
}
