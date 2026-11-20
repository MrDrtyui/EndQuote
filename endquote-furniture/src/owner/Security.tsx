import {useState, type FormEvent} from 'react'
import {api} from './api'
import {problem,type Provider} from './data'
import {Brand,Button,Feedback,Field,type Message} from './ui'

export const providerLabel={google:'Google',apple:'Apple'}
export async function startSocial(provider:Provider,link:boolean) {
  const result=await api<{url:string}>('auth/social/start','POST',{provider,link})
  location.assign(result.url)
}
export function SocialButtons({providers}:{providers:Provider[]}){
  const [busy,setBusy]=useState<Provider>(),[error,setError]=useState('')
  async function start(provider:Provider){
    setBusy(provider)
    try{await startSocial(provider,false)}catch(e){setError(problem(e));setBusy(undefined)}
  }
  return <div className="eq-social" role="group" aria-label="Вход через другие сервисы">
    {(['google', 'apple'] as const).map(provider => {
      const available = providers.includes(provider)
      return <Button key={provider} variant="secondary" disabled={!available || !!busy} busy={busy === provider} onClick={() => start(provider)}>
        {available ? 'Продолжить с ' + providerLabel[provider] : <>{providerLabel[provider]} <small>Недоступно</small></>}
      </Button>
    })}
    {error && <Feedback message={{kind:'error',text:error}}/>}
  </div>
}
export function NewPassword(){
  return <><Field label="Новый пароль" name="password" type="password" required autoComplete="new-password" minLength={12} maxLength={128} hint="От 12 до 128 символов."/>
    <Field label="Повторите пароль" name="confirm" type="password" required autoComplete="new-password" maxLength={128}/></>
}
export function matchingPassword(form:HTMLFormElement) {
  const data=new FormData(form)
  if(data.get('password')!==data.get('confirm')){
    (form.elements.namedItem('confirm') as HTMLInputElement).focus()
    throw new Error('Пароли не совпадают.')
  }
  return String(data.get('password'))
}
export function MailScreen(){
  const mode=location.pathname.split('/').pop()
  const forgot=mode==='forgot',reset=mode==='reset'
  const [token]=useState(()=>location.hash.slice(1))
  const [busy,setBusy]=useState(false),[message,setMessage]=useState<Message|null>(null)
  const title=forgot?'Восстановить доступ':reset?'Новый пароль':'Подтвердить почту'
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    setBusy(true);setMessage(null)
    try{
      if(forgot)await api('auth/recover','POST',{email:new FormData(e.currentTarget).get('email')})
      else await api('auth/confirm','POST',{token,...(reset && {password:matchingPassword(e.currentTarget)})})
      history.replaceState(null,'',location.pathname)
      setMessage({kind:'success',text:forgot?'Если аккаунт существует, письмо со ссылкой придёт на указанную почту.':reset?'Пароль сохранён. Теперь можно войти с новым паролем.':'Почта подтверждена.'})
    }catch(e){setMessage({kind:'error',text:problem(e)})}finally{setBusy(false)}
  }
  const invalid=!forgot&&!/^[0-9a-f]{64}$/.test(token)
  return <main className="eq-mail"><Brand/><section><h1>{title}</h1><p>{forgot?'Укажите почту, с которой входите в EndQuote.':reset?'Придумайте пароль для входа в кабинет.':'Подтвердите, что хотите использовать этот адрес в EndQuote.'}</p>
    <Feedback message={message}/>{invalid?<Feedback message={{kind:'error',text:'Ссылка неполная. Откройте её целиком из письма.'}}/>:message?.kind!=='success'&&<form onSubmit={submit}>
      {forgot?<Field label="Почта" type="email" name="email" autoComplete="email" required maxLength={254}/>:reset?<NewPassword/>:null}
      <Button type="submit" busy={busy}>{forgot?'Получить ссылку':reset?'Сохранить пароль':'Подтвердить адрес'}</Button></form>}
    <a href="/owner" className="ow-text-link">В кабинет</a>{reset&&<a className="ow-text-link" href="/owner/forgot">Запросить новую ссылку</a>}</section></main>
}
