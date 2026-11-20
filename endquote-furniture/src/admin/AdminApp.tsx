import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react'
import {
  Activity,ArrowRight,ArrowUpRight,Building2,Check,ChevronRight,Clock3,
  CreditCard,ExternalLink,KeyRound,LayoutDashboard,LoaderCircle,LockKeyhole,
  LogOut,Menu,RefreshCw,Search,Settings2,ShieldCheck,Store,Users,X
} from 'lucide-react'
import {api,ApiError} from '../owner/api'
import './admin.css'

type Stage='login'|'setup'|'verify'|'ready'
type Tab='overview'|'businesses'|'subscriptions'|'activity'|'settings'
type Access='trial'|'active'|'expired'|'suspended'
type Session={stage:Stage;authenticated:boolean;email:string|null;mfaReady:boolean}
type Business={
  id:string;name:string;slug:string;city:string;published:boolean;accessState:Access;
  status:Access;accessVersion:number;trialEndsAt:string;paidThrough:string|null;
  owner:{normalizedEmail:string;createdAt:string}
}
type Audit={
  id:string;createdAt:string;reason:string;
  prior:{state:string;trial?:string;paid?:string};
  next:{state:string;trial?:string;paid?:string};
  admin:{email:string};business?:{id:string;name:string}
}
type Overview={total:number;trial:number;active:number;expired:number;suspended:number;newBusinesses:number;recent:Business[]}
type BusinessPage={rows:Business[];cursor:string|null}
type ActivityPage={rows:Audit[];cursor:string|null}
type Detail={business:Business;audits:Audit[]}
type Change={business:Business;state:Access;endsAt:string|null;reason:string}

const labels:Record<Access,string>={
  trial:'Пробный период',active:'Активна',expired:'Истекла',suspended:'Приостановлена'
}
const tabs=[
  {id:'overview',name:'Обзор',icon:LayoutDashboard},
  {id:'businesses',name:'Компании',icon:Building2},
  {id:'subscriptions',name:'Подписки',icon:CreditCard},
  {id:'activity',name:'Журнал действий',icon:Activity},
  {id:'settings',name:'Настройки',icon:Settings2}
] as const
const date=(value:string|null|undefined)=>value
  ?new Intl.DateTimeFormat('ru-KZ',{dateStyle:'medium'}).format(new Date(value)):'—'
const dateTime=(value:string)=>new Intl.DateTimeFormat('ru-KZ',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
const until=(b:Business)=>b.status==='trial'?b.trialEndsAt:b.paidThrough
const errorText=(e:unknown)=>e instanceof Error?e.message:'Не удалось выполнить действие.'
const getData=(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault()
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>
}
function Brand(){return <span className="ea-brand"><span className="ea-mark">〞</span> EndQuote <span className="ea-brand-sub">Admin</span></span>}
function Status({status}:{status:Access}){return <span className={'ea-status ea-status-'+status}><span className="ea-dot"/>{labels[status]}</span>}
function Busy({text='Загрузка…'}:{text?:string}){return <div className="ea-loading" role="status"><LoaderCircle className="ea-spin" size={17}/>{text}</div>}
function Alert({children}:{children:ReactNode}){return <div role="alert" className="ea-alert">{children}</div>}
function SectionTitle({title,subtitle,action}:{title:string;subtitle?:string;action?:ReactNode}){
  return <header className="ea-section-title"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</header>
}
function Table({rows,onOpen}:{rows:Business[];onOpen:(id:string)=>void}){
  return <div className="ea-table-wrap"><table className="ea-table">
    <thead><tr><th>Компания</th><th>Владелец</th><th>Подписка</th><th>Срок</th><th>Регистрация</th><th aria-label="Действие"/></tr></thead>
    <tbody>{rows.map(b=><tr key={b.id}>
      <td data-label="Компания"><button className="ea-entity" onClick={()=>onOpen(b.id)}><span className="ea-avatar">{b.name.trim().slice(0,2).toUpperCase()}</span><span><strong>{b.name}</strong><small>/{b.slug}</small></span></button></td>
      <td data-label="Владелец" className="ea-muted">{b.owner.normalizedEmail}</td>
      <td data-label="Подписка"><Status status={b.status}/></td>
      <td data-label="Срок" className="ea-muted">{until(b)?date(until(b)):'Без срока'}</td>
      <td data-label="Регистрация" className="ea-muted">{date(b.owner.createdAt)}</td>
      <td data-label="Действие"><button className="ea-icon" aria-label={'Управлять '+b.name} onClick={()=>onOpen(b.id)}><ChevronRight size={17}/></button></td>
    </tr>)}</tbody>
  </table>{rows.length===0&&<div className="ea-empty"><Building2 size={24}/><strong>Компании не найдены</strong><span>Попробуйте изменить фильтры.</span></div>}</div>
}

export default function AdminApp(){
  const [session,setSession]=useState<Session|null>(null)
  const [startupError,setStartupError]=useState('')
  const [tab,setTab]=useState<Tab>('overview')
  const [drawer,setDrawer]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [overview,setOverview]=useState<Overview>()
  const [businesses,setBusinesses]=useState<BusinessPage>()
  const [audits,setAudits]=useState<ActivityPage>()
  const [detail,setDetail]=useState<Detail>()
  const [search,setSearch]=useState('')
  const [appliedSearch,setAppliedSearch]=useState('')
  const [filter,setFilter]=useState<'all'|Access>('all')
  const [pending,setPending]=useState<Change|null>(null)
  const [reauth,setReauth]=useState(false)
  const [secret,setSecret]=useState<{secret:string;uri:string}|null>(null)
  const modalFocus=useRef<HTMLInputElement>(null)

  async function refreshSession(){
    const value=await api<Session>('admin/session')
    setSession(value)
    return value
  }
  useEffect(()=>{
    let current=true
    api<Session>('admin/session').then(v=>{if(current)setSession(v)})
      .catch(e=>{if(current)setStartupError(errorText(e))})
    return ()=>{current=false}
  },[])
  async function loadOverview(){setOverview(await api<Overview>('admin/overview'))}
  async function loadBusinesses(q=appliedSearch,state=filter,more=false){
    const query=new URLSearchParams()
    if(q)query.set('q',q)
    if(state!=='all')query.set('state',state)
    if(more&&businesses?.cursor)query.set('cursor',businesses.cursor)
    const response=await api<BusinessPage>('admin/businesses?'+query.toString())
    setBusinesses(old=>more&&old?{rows:[...old.rows,...response.rows],cursor:response.cursor}:response)
  }
  async function loadAudits(more=false){
    const response=await api<ActivityPage>('admin/activity'+(more&&audits?.cursor?'?cursor='+audits.cursor:''))
    setAudits(old=>more&&old?{rows:[...old.rows,...response.rows],cursor:response.cursor}:response)
  }
  async function openBusiness(id:string){
    setMessage('')
    try{setDetail(await api<Detail>('admin/businesses/'+id))}
    catch(e){setMessage(errorText(e))}
  }
  useEffect(()=>{
    if(session?.stage!=='ready')return
    let cancelled=false
    Promise.all([api<Overview>('admin/overview'),api<BusinessPage>('admin/businesses'),api<ActivityPage>('admin/activity')])
      .then(([o,b,a])=>{if(!cancelled){setOverview(o);setBusinesses(b);setAudits(a)}})
      .catch(e=>{if(!cancelled)setMessage(errorText(e))})
    return ()=>{cancelled=true}
  },[session?.stage])
  useEffect(()=>{
    if(pending||reauth)modalFocus.current?.focus()
  },[pending,reauth])
  useEffect(()=>{
    if(!pending&&!reauth)return
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){setPending(null);setReauth(false)}
    }
    window.addEventListener('keydown',escape)
    return ()=>window.removeEventListener('keydown',escape)
  },[pending,reauth])
  async function action(fn:()=>Promise<void>){
    setMessage('');setBusy(true)
    try{await fn()}catch(e){setMessage(errorText(e))}
    finally{setBusy(false)}
  }
  async function authenticated(){
    await refreshSession()
    setSecret(null)
  }
  async function logout(){
    await api('admin/logout','POST',{})
    setSession({stage:'login',authenticated:false,email:null,mfaReady:false})
    setOverview(undefined);setBusinesses(undefined);setDetail(undefined)
  }
  function chooseTab(next:Tab){setTab(next);setDrawer(false);setDetail(undefined);setMessage('')}
  function requestChange(b:Business,d:Record<string,string>){
    const state=d.state as Access, endsAt=d.end?new Date(d.end).toISOString():null
    setPending({business:b,state,endsAt,reason:d.reason.trim()})
  }
  async function commitChange(){
    if(!pending)return
    try{
      await api('admin/businesses/'+pending.business.id+'/access','PATCH',{
        expectedVersion:pending.business.accessVersion,state:pending.state,
        endsAt:pending.endsAt,reason:pending.reason
      })
      setPending(null);setReauth(false);setMessage('Изменение подписки сохранено и записано в журнал.')
      await Promise.all([loadOverview(),loadBusinesses(),loadAudits(),openBusiness(pending.business.id)])
    }catch(e){
      if(e instanceof ApiError&&e.code==='REAUTH'){setReauth(true)}
      else{setMessage(errorText(e));setPending(null);setReauth(false)}
    }
  }

  if(!session){
    return <div className="ea"><div className="ea-auth"><Brand/>{startupError?<Alert>{startupError} <button onClick={()=>void action(authenticated)}>Повторить</button></Alert>:<Busy/>}</div></div>
  }
  if(session.stage!=='ready'){
    return <div className="ea"><div className="ea-auth-shell">
      <div className="ea-auth-head"><Brand/><a href="/" className="ea-subtle-link">На главную <ArrowUpRight size={14}/></a></div>
      <main className="ea-auth-card">
        <div className="ea-security-icon">{session.stage==='login'?<LockKeyhole size={24}/>:<ShieldCheck size={24}/>}</div>
        {session.stage==='login'?<>
          <h1>Вход для администратора</h1>
          <p>Закрытое рабочее пространство EndQuote. Доступ только для администраторов платформы.</p>
          <form className="ea-form" onSubmit={e=>{const d=getData(e);void action(async()=>{
            await api('admin/login','POST',d);await authenticated()
          })}}>
            <label>Почта<input autoComplete="username" name="email" type="email" required/></label>
            <label>Пароль<input autoComplete="current-password" name="password" type="password" required/></label>
            <button disabled={busy} className="ea-primary">{busy?'Проверяем…':'Продолжить'}<ArrowRight size={16}/></button>
          </form>
        </>:session.stage==='setup'?<>
          <h1>Включите защиту аккаунта</h1>
          <p>Для доступа к панели администратора необходимо настроить одноразовые коды в приложении-аутентификаторе.</p>
          {!session.mfaReady&&<Alert>На сервере не настроен ADMIN_TOTP_KEY. Обратитесь к оператору.</Alert>}
          {!secret?<button disabled={busy||!session.mfaReady} className="ea-primary" onClick={()=>void action(async()=>{
            setSecret(await api<{secret:string;uri:string}>('admin/mfa/setup','POST',{}))
          })}>Создать ключ для MFA <ArrowRight size={16}/></button>:<>
            <div className="ea-secret"><span>Секретный ключ · не передавайте никому</span><code>{secret.secret}</code>
              <button onClick={()=>void navigator.clipboard.writeText(secret.secret)}>Скопировать</button>
              <a href={secret.uri}>Открыть в приложении-аутентификаторе <ArrowUpRight size={14}/></a>
            </div>
            <form className="ea-form" onSubmit={e=>{const d=getData(e);void action(async()=>{
              await api('admin/mfa/activate','POST',{code:d.code});await authenticated()
            })}}>
              <label>6-значный код<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} required/></label>
              <button className="ea-primary" disabled={busy}>Активировать защиту <Check size={16}/></button>
            </form>
          </>}
          <button className="ea-text-button" onClick={()=>void action(logout)}>Выйти</button>
        </>:<>
          <h1>Подтвердите вход</h1>
          <p>Введите текущий код из приложения-аутентификатора. Код можно использовать только один раз.</p>
          <form className="ea-form" onSubmit={e=>{const d=getData(e);void action(async()=>{
            await api('admin/mfa/verify','POST',{code:d.code});await authenticated()
          })}}>
            <label>Код безопасности<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} required autoFocus/></label>
            <button className="ea-primary" disabled={busy}>Войти <ArrowRight size={16}/></button>
          </form>
          <button className="ea-text-button" onClick={()=>void action(logout)}>Выйти</button>
        </>}
        {message&&<Alert>{message}</Alert>}
        <div className="ea-auth-foot"><ShieldCheck size={15}/> Отдельная защищённая сессия администратора</div>
      </main>
    </div></div>
  }

  return <div className="ea">
    {drawer&&<button className="ea-scrim" aria-label="Закрыть навигацию" onClick={()=>setDrawer(false)}/>}
    <aside className={'ea-sidebar'+(drawer?' ea-sidebar-open':'')}>
      <div className="ea-side-brand"><Brand/><button className="ea-mobile-close ea-icon" aria-label="Закрыть меню" onClick={()=>setDrawer(false)}><X size={18}/></button></div>
      <div className="ea-nav-caption">Рабочее пространство</div>
      <nav aria-label="Администрирование">{tabs.map(item=>{
        const Icon=item.icon
        return <button key={item.id} className={'ea-nav-item'+(tab===item.id?' ea-active':'')} aria-current={tab===item.id?'page':undefined} onClick={()=>chooseTab(item.id)}>
          <Icon size={16}/>{item.name}
        </button>
      })}</nav>
      <div className="ea-side-footer"><div className="ea-operator"><div className="ea-operator-icon"><ShieldCheck size={15}/></div><div><strong>Администратор</strong><span title={session.email??''}>{session.email}</span></div></div>
        <button className="ea-signout" onClick={()=>void action(logout)}><LogOut size={15}/> Выйти</button>
      </div>
    </aside>
    <main className="ea-main">
      <header className="ea-topbar">
        <button className="ea-menu ea-icon" aria-label="Открыть меню" onClick={()=>setDrawer(true)}><Menu size={18}/></button>
        <span>EndQuote Admin</span><ChevronRight size={13}/><strong>{tabs.find(t=>t.id===tab)?.name}</strong>
        <span className="ea-top-spacer"/>
        <span className="ea-top-private"><ShieldCheck size={14}/> Внутренний доступ</span>
      </header>
      <div className="ea-content">
        <header className="ea-page-header"><div><h1>{tabs.find(t=>t.id===tab)?.name}</h1>
          <p>{tab==='overview'?'Текущее состояние платформы':tab==='businesses'?'Компании и публичные витрины':tab==='subscriptions'?'Контроль доступа и сроков подписки':tab==='activity'?'История административных изменений':'Безопасность платформы'}</p></div>
          {tab!=='settings'&&<button className="ea-button" disabled={busy} onClick={()=>void action(async()=>{
            await Promise.all([loadOverview(),loadBusinesses(),loadAudits()])
          })}><RefreshCw size={15}/> Обновить</button>}
        </header>
        {message&&<div className="ea-message" role="status">{message}<button aria-label="Закрыть уведомление" onClick={()=>setMessage('')}><X size={15}/></button></div>}
        {tab==='overview'&&(!overview?<Busy/>:<>
          <section className="ea-metrics" aria-label="Статистика">
            {[
              {name:'Всего компаний',value:overview.total,icon:Building2},
              {name:'Активные',value:overview.active,icon:Check},
              {name:'Пробные',value:overview.trial,icon:Clock3},
              {name:'Истекшие',value:overview.expired,icon:CreditCard},
              {name:'За 30 дней',value:overview.newBusinesses,icon:Users}
            ].map(m=>{const Icon=m.icon;return <div className="ea-metric" key={m.name}><div><span>{m.name}</span><Icon size={16}/></div><strong>{m.value.toLocaleString('ru-KZ')}</strong></div>})}
          </section>
          <section className="ea-section">
            <SectionTitle title="Недавно зарегистрированные" subtitle="Компании по дате регистрации владельца" action={<button className="ea-link" onClick={()=>chooseTab('businesses')}>Все компании <ArrowRight size={15}/></button>}/>
            <Table rows={overview.recent} onOpen={id=>void openBusiness(id)}/>
          </section>
        </>)}
        {(tab==='businesses'||tab==='subscriptions')&&<section className="ea-section">
          <div className="ea-toolbar">
            <form className="ea-search" onSubmit={e=>{e.preventDefault();setAppliedSearch(search);setBusinesses(undefined);void action(()=>loadBusinesses(search,filter))}}>
              <Search size={16}/><input aria-label="Поиск компаний" placeholder="Название, ссылка или почта…" value={search} onChange={e=>setSearch(e.target.value)}/><button type="submit">Найти</button>
            </form>
            <select aria-label="Фильтр подписки" value={filter} onChange={e=>{const next=e.target.value as 'all'|Access;setFilter(next);setBusinesses(undefined);void action(()=>loadBusinesses(appliedSearch,next))}}>
              <option value="all">Все статусы</option><option value="active">Активные</option><option value="trial">Пробные</option>
              <option value="expired">Истекшие</option><option value="suspended">Приостановленные</option>
            </select>
          </div>
          {!businesses?<Busy/>:<>
            <Table rows={businesses.rows} onOpen={id=>void openBusiness(id)}/>
            {businesses.cursor&&<div className="ea-load-more"><button className="ea-button" disabled={busy} onClick={()=>void action(()=>loadBusinesses(appliedSearch,filter,true))}>Показать ещё</button></div>}
          </>}
        </section>}
        {tab==='activity'&&<section className="ea-section">
          <SectionTitle title="Действия администраторов" subtitle="Записи создаются при изменении доступа к компаниям."/>
          {!audits?<Busy/>:audits.rows.length===0?<div className="ea-empty"><Activity size={25}/><strong>Журнал пока пуст</strong><span>Изменения подписок будут появляться здесь.</span></div>:<>
            <div className="ea-history">{audits.rows.map(a=><article className="ea-history-item" key={a.id}>
              <div className="ea-history-icon"><Activity size={15}/></div><div><strong>{a.business?.name??'Компания'}</strong>
                <span>{a.prior.state} → {a.next.state}</span><p>{a.reason}</p>
                <small>{a.admin.email} · {dateTime(a.createdAt)}</small>
              </div></article>)}</div>
            {audits.cursor&&<div className="ea-load-more"><button className="ea-button" disabled={busy} onClick={()=>void action(()=>loadAudits(true))}>Ранее</button></div>}
          </>}
        </section>}
        {tab==='settings'&&<section className="ea-section ea-settings">
          <SectionTitle title="Безопасность администратора" subtitle="Защита доступа к управлению подписками и компаниями"/>
          <div className="ea-setting-row"><div className="ea-setting-icon"><ShieldCheck size={19}/></div>
            <div><strong>Двухфакторная аутентификация</strong><p>Одноразовые коды TOTP обязательны при входе.</p></div><span className="ea-setting-enabled"><Check size={15}/> Включена</span>
          </div>
          <div className="ea-setting-row"><div className="ea-setting-icon"><KeyRound size={19}/></div>
            <div><strong>Подтверждение важных действий</strong><p>Для изменения подписки повторно потребуются пароль и новый одноразовый код.</p></div>
          </div>
          <div className="ea-setting-row"><div className="ea-setting-icon"><Store size={19}/></div>
            <div><strong>Учетная запись</strong><p>{session.email}</p></div>
            <button className="ea-button" onClick={()=>void action(logout)}>Выйти</button>
          </div>
        </section>}
      </div>
    </main>

    {detail&&<div className="ea-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(undefined)}}>
      <aside className="ea-detail" role="dialog" aria-modal="true" aria-label={'Компания '+detail.business.name}>
        <header><div><span className="ea-eyebrow">Компания</span><h2>{detail.business.name}</h2></div>
          <button className="ea-icon" aria-label="Закрыть сведения" onClick={()=>setDetail(undefined)}><X size={18}/></button></header>
        <div className="ea-detail-body">
          <Status status={detail.business.status}/>
          <div className="ea-detail-grid">
            <div><span>Владелец</span><strong>{detail.business.owner.normalizedEmail}</strong></div>
            <div><span>Город</span><strong>{detail.business.city}</strong></div>
            <div><span>Страница</span><a href={'/'+detail.business.slug} target="_blank" rel="noreferrer">/{detail.business.slug}<ExternalLink size={14}/></a></div>
            <div><span>Публикация</span><strong>{detail.business.published?'Опубликована':'Скрыта'}</strong></div>
            <div><span>Дата регистрации владельца</span><strong>{date(detail.business.owner.createdAt)}</strong></div>
            <div><span>Действует до</span><strong>{until(detail.business)?date(until(detail.business)):'Без срока'}</strong></div>
          </div>
          <form className="ea-form ea-detail-form" onSubmit={e=>requestChange(detail.business,getData(e))}>
            <h3>Управление подпиской</h3>
            <label>Статус<select name="state" defaultValue={detail.business.accessState} key={detail.business.accessVersion}>
              <option value="trial">Пробный период</option><option value="active">Активна</option>
              <option value="expired">Истекла</option><option value="suspended">Приостановлена</option>
            </select></label>
            <label>Дата окончания (для пробного периода обязательна)<input type="datetime-local" name="end"/></label>
            <label>Причина изменения<textarea required name="reason" minLength={5} maxLength={300} rows={3} placeholder="Причина для журнала действий"/></label>
            <button className="ea-primary" type="submit">Применить изменение <ArrowRight size={16}/></button>
            <p className="ea-hint">Если дата окончания не указана, активная подписка будет бессрочной. Данные заказов недоступны администраторам.</p>
          </form>
          <SectionTitle title="История подписки"/>
          {detail.audits.length===0?<p className="ea-muted">Изменений пока нет.</p>:<div className="ea-detail-history">{detail.audits.map(a=><div key={a.id}><strong>{a.prior.state} → {a.next.state}</strong><p>{a.reason}</p><small>{dateTime(a.createdAt)} · {a.admin.email}</small></div>)}</div>}
        </div>
      </aside>
    </div>}
    {(pending||reauth)&&<div className="ea-overlay ea-overlay-confirm" role="presentation">
      <div className="ea-confirm" role="dialog" aria-modal="true" aria-labelledby="ea-confirm-title">
        {reauth?<><div className="ea-security-icon"><LockKeyhole size={20}/></div><h2 id="ea-confirm-title">Подтверждение личности</h2>
          <p>Для изменения подписки повторно введите пароль администратора и новый код из приложения-аутентификатора.</p>
          <form className="ea-form" onSubmit={e=>{const d=getData(e);void action(async()=>{
            await api('admin/reauth','POST',{password:d.password,code:d.code});setReauth(false);await commitChange()
          })}}>
            <label>Пароль<input ref={modalFocus} name="password" type="password" autoComplete="current-password" required/></label>
            <label>Одноразовый код<input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/></label>
            <div className="ea-confirm-actions"><button type="button" className="ea-button" onClick={()=>{setReauth(false);setPending(null)}}>Отмена</button>
              <button className="ea-primary" disabled={busy}>Подтвердить <ArrowRight size={16}/></button></div>
          </form>
        </>:<><h2 id="ea-confirm-title">Изменить доступ?</h2>
          <p>Компания <strong>{pending?.business.name}</strong> получит статус «{pending?labels[pending.state]:''}». Действие будет записано в журнал.</p>
          <div className="ea-confirm-actions"><button ref={modalFocus} className="ea-button" onClick={()=>setPending(null)}>Отмена</button>
            <button className="ea-primary" disabled={busy} onClick={()=>void action(commitChange)}>Подтвердить <ArrowRight size={16}/></button></div>
        </>}
        {message&&<Alert>{message}</Alert>}
      </div>
    </div>}
  </div>
}
