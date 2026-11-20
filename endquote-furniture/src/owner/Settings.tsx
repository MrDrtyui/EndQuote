import { useState, type FormEvent } from 'react'
import { CalendarDays, ShieldCheck, UserRound, Mail, KeyRound, Link2 } from 'lucide-react'
import { api } from './api'
import { accessInfo, dateLabel, problem, useResource, type Provider, type Business } from './data'
import { Button, Feedback, Field, Loading, LoadError, PageHeading, type Message } from './ui'

import {NewPassword, matchingPassword, providerLabel, startSocial} from './Security'

export function Subscription({ business }: { business: Business }) {
  const { active, end, label } = accessInfo(business)
  const trial = business.accessState === 'trial'
  return <div className="ow-page"><PageHeading title="Подписка" />
    <section className="ow-panel ow-access-panel">
      <div className="ow-access-lead"><h2>{label}</h2>
        <span className={'ow-badge ' + (active ? 'ow-status-live' : 'ow-status-draft')}><i />{active ? 'Доступ открыт' : 'Только просмотр'}</span></div>
      <p>{active ? 'Вы можете принимать заявки, менять цены и управлять витриной.' : 'Полученные заявки и настройки доступны для просмотра. Для редактирования продлите доступ через администратора.'}</p>
      <dl className="ow-access-facts"><div><dt><CalendarDays size={16} />{trial ? 'Пробный период до' : 'Окончание доступа'}</dt><dd>{end ? dateLabel(end) : active ? 'Без даты окончания' : 'Доступ завершён'}</dd></div>
        <div><dt><ShieldCheck size={16} />Продление</dt><dd>Через администратора EndQuote</dd></div></dl>
      <div className="ow-plan-note">Автоматических списаний нет.</div>
    </section></div>
}
type Details={email:string; verified:boolean; createdAt:string; hasPassword:boolean; pending?:string; linked:Provider[]; mailReady:boolean}
export function Account({providers,refreshSession}:{providers:Provider[]; refreshSession:()=>Promise<void>}){
  const resource=useResource<Details>('owner/account'), account=resource.data
  const [edit,setEdit]=useState<'email'|'password'>(),[message,setMessage]=useState<Message|null>(null)
  const [busy,setBusy]=useState('')
  async function action(key:string,work:()=>Promise<void>){
    setBusy(key);setMessage(null)
    try{await work()}catch(e){setMessage({kind:'error',text:problem(e)})}finally{setBusy('')}
  }
  function open(next:typeof edit){setEdit(next);setMessage(null)}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    const form=event.currentTarget
    await action('save',async()=>{
      const fields=new FormData(form)
      await api('owner/account','PATCH',{currentPassword:fields.get('currentPassword'),...(edit==='email'?{email:fields.get('email')}:{password:matchingPassword(form)})})
      setMessage({kind:'success',text:edit==='email'?'Проверьте письмо на новом адресе.':'Пароль обновлён. Другие сеансы завершены.'})
      setEdit(undefined);resource.retry();await refreshSession()
    })
  }
  const editor=<form className="eq-edit" onSubmit={submit}><fieldset disabled={!!busy}>
    {edit==='email'?<Field autoFocus label="Новый адрес" type="email" name="email" autoComplete="email" required maxLength={254}/>:<NewPassword/>}
    <Field label="Текущий пароль" type="password" name="currentPassword" autoComplete="current-password" required maxLength={128}/>
    <div><Button type="submit" busy={busy==='save'}>{edit==='email'?'Получить письмо':'Сохранить пароль'}</Button> <Button variant="quiet" onClick={()=>open(undefined)}>Отмена</Button></div>
  </fieldset></form>
  return <div className="ow-page eq-account"><PageHeading title="Аккаунт"/>
    {resource.error?<LoadError error={resource.error} retry={resource.retry}/>:!account?<Loading/>:<>
    <section><h2><UserRound/>Профиль</h2><dl><div><dt>Почта аккаунта</dt><dd>{account.email}</dd></div><div><dt>Статус почты</dt><dd><span className={'eq-status '+(account.verified?'verified':'')}>{account.verified?'Подтверждена':'Ожидает подтверждения'}</span></dd></div><div><dt>Дата регистрации</dt><dd>{dateLabel(account.createdAt)}</dd></div></dl>
    </section>
    <section><h2><Mail/>Электронная почта</h2><div className="eq-row"><div><strong>{account.email}</strong><p>{account.pending?'Ожидает подтверждения адрес '+account.pending:'На этот адрес приходят письма для восстановления доступа.'}</p></div>
      {!edit&&account.hasPassword&&<Button variant="secondary" disabled={!!busy||!account.mailReady} onClick={()=>open('email')}>Изменить</Button>}</div>
      {!account.hasPassword&&<p>Для смены почты сначала установите пароль.</p>}{edit==='email'&&editor}</section>
    <section><h2><KeyRound/>Пароль и безопасность</h2><div className="eq-row"><p>{account.hasPassword?'После смены пароля другие сеансы завершатся.':'Получите ссылку на почту, чтобы настроить вход по паролю.'}</p>
      {!edit&&<Button variant="secondary" disabled={!!busy||(!account.hasPassword&&!account.mailReady)} busy={busy==='setup'} onClick={()=>account.hasPassword?open('password'):action('setup',async()=>{await api('auth/recover','POST',{email:account.email});setMessage({kind:'info',text:'Запрос принят. Проверьте почту.'})})}>{account.hasPassword?'Изменить пароль':'Установить пароль'}</Button>}</div>{edit==='password'&&editor}</section>
    <section><h2><Link2/>Связанные аккаунты</h2>{(['google','apple'] as const).map(p=>{
      const linked=account.linked.includes(p),enabled=providers.includes(p)
      return <div className="eq-row eq-provider" key={p}><div><strong>{providerLabel[p]}</strong><p>{linked?'Подключён':enabled?'Не подключён':'Вход временно недоступен'}</p></div>
        {(linked||enabled)&&<Button variant="secondary" disabled={!!busy||(!linked&&!account.verified)} busy={busy===p} onClick={()=>action(p,async()=>{
          if(!linked)return startSocial(p,true)
          await api('owner/social/unlink','POST',{provider:p});resource.retry();setMessage({kind:'success',text:'Аккаунт '+providerLabel[p]+' отключён.'})
        })}>{linked?'Отключить':'Подключить'}</Button>}</div>})}</section>
    </>}
    <Feedback message={message}/>
  </div>
}
