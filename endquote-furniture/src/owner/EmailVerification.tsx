import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, MailCheck, RefreshCw } from 'lucide-react'
import { api } from './api'
import { problem } from './data'
import { Brand, Button, Notice } from './ui'

type Props = {
  email?: string
  alreadyVerified?: boolean
  mailReady: boolean
  delivery?: string
  refresh: () => Promise<void>
  logout?: () => Promise<void>
  signingOut?: boolean
}

export default function EmailVerification({ email, alreadyVerified, mailReady, delivery, refresh, logout, signingOut }: Props) {
  const [linkToken] = useState(() => location.hash.slice(1))
  const consumed = useRef(false)
  const [checking, setChecking] = useState(Boolean(linkToken))
  const [confirmed, setConfirmed] = useState(false)
  const [resending, setResending] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string }>()
  const validToken = /^[a-f0-9]{64}$/i.test(linkToken)

  useEffect(() => {
    if (!linkToken || consumed.current) return
    consumed.current = true
    // Tokens live in the URL fragment so they never reach the server in an HTTP request.
    // Remove the fragment before sending the token in the request body.
    history.replaceState(history.state, '', '/owner/verify')
    if (!validToken) {
      setChecking(false)
      setNotice({ kind: 'error', text: 'Ссылка неполная. Откройте её целиком из письма.' })
      return
    }
    void (async () => {
      try {
        await api('auth/confirm', 'POST', { token: linkToken })
        setConfirmed(true)
        await refresh()
      } catch (error) {
        setNotice({ kind: 'error', text: problem(error) })
      } finally {
        setChecking(false)
      }
    })()
  }, [linkToken, validToken])

  async function resend() {
    setResending(true)
    setNotice(undefined)
    try {
      await api('owner/verify', 'POST', {})
      setNotice({ kind: 'info', text: 'Новое письмо отправлено. Ссылка действует один час.' })
    } catch (error) {
      setNotice({ kind: 'error', text: problem(error) })
    } finally {
      setResending(false)
    }
  }

  return <main className="ow-auth eq-verify">
    <div className="ow-auth-main">
      <header><Brand /></header>
      <section className="ow-access-form eq-verify-content" aria-live="polite">
        <div className="eq-verify-icon">{confirmed ? <CheckCircle2 size={25} /> : <MailCheck size={25} />}</div>
        <span className="eq-verify-step">{alreadyVerified ? 'Аккаунт · Новый email' : 'Регистрация · Подтверждение почты'}</span>
        <h1>{confirmed ? 'Почта подтверждена' : checking ? 'Подтверждаем адрес…' : alreadyVerified ? 'Подтвердите новый адрес' : 'Проверьте почту'}</h1>
        {confirmed ? <p>Адрес подтверждён. Теперь можно продолжить настройку EndQuote.</p>
          : <p>{alreadyVerified ? 'Проверяем ссылку для смены адреса. Если она устарела, запросите изменение ещё раз в настройках аккаунта.' : email ? <>Отправили письмо на <strong>{email}</strong>. Перейдите по ссылке в письме, чтобы завершить регистрацию.</>
            : 'Перейдите по ссылке из письма. После подтверждения войдите в аккаунт, чтобы продолжить.'}</p>}
        {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        {!confirmed && !checking && delivery === 'unavailable' && <Notice kind="error">Первое письмо отправить не удалось. Попробуйте ещё раз.</Notice>}
        {!confirmed && !checking && email && !mailReady && <Notice kind="error">Отправка писем временно недоступна. Попробуйте позже.</Notice>}
        {!confirmed && !checking && email && !alreadyVerified && mailReady && <Button variant="secondary" className="ow-wide" busy={resending} onClick={resend}>
          <RefreshCw size={16} />Отправить письмо ещё раз
        </Button>}
        {!email && <a className="eq-verify-link" href="/owner/login">Войти в аккаунт</a>}
        {alreadyVerified && <a className="eq-verify-link" href="/owner#account">В настройки аккаунта</a>}
        {email && !alreadyVerified && logout && <Button variant="quiet" className="ow-wide" busy={signingOut} onClick={logout}>
          Выйти и использовать другой адрес
        </Button>}
        <p className="eq-verify-tip">Проверьте папку «Спам», если письмо не пришло. Ссылка действительна 60 минут.</p>
      </section>
      <footer><a className="ow-back" href="/"><ArrowLeft size={15} />На главную</a></footer>
    </div>
  </main>
}
