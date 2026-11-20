import {useEffect,useRef} from 'react'
import {ArrowRight, ArrowUpRight, CalendarClock, ChevronRight, EyeOff, FileQuestion, LoaderCircle, RefreshCw, ShieldCheck, Store, WifiOff} from 'lucide-react'
import {QuoteMark} from '../../marketing/ui'
import {whatsappLink} from '../../marketing/content'
import type {StoreStatus} from './store-response'
import './store-notice.css'

const copy = {
  closed: {icon:Store,title:'Запись временно закрыта',description:'Сейчас оформить заявку онлайн не получится. Попробуйте зайти немного позже.'},
  unpublished: {icon:EyeOff,title:'Витрина снята с публикации',description:'Клиенты пока не могут оставить заявку. Когда будете готовы принимать заказы, опубликуйте витрину в настройках.'},
  expired: {icon:CalendarClock,title:'Срок подписки истёк',description:'Онлайн-запись для клиентов приостановлена. Чтобы возобновить приём заявок, обратитесь к администратору EndQuote.'},
  missing: {icon:FileQuestion,title:'Витрина не найдена',description:'Проверьте адрес или попросите у компании актуальную ссылку для записи.'},
  error: {icon:WifiOff,title:'Не удалось загрузить витрину',description:'Проверьте подключение к интернету и попробуйте ещё раз.'},
  loading: {icon:LoaderCircle,title:'Открываем витрину…',description:''},
  'preview-login': {icon:ShieldCheck,title:'Войдите для предпросмотра',description:'Предпросмотр витрины доступен в кабинете владельца.'},
}
const dateFormat=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Almaty'})

export function StoreNotice({status,retry}:{status:StoreStatus;retry:()=>void}){
  const titleRef=useRef<HTMLHeadingElement>(null)
  const retrying=useRef(false)
  useEffect(()=>{
    if(retrying.current && status.kind!=='loading'){
      titleRef.current?.focus({preventScroll:true})
      retrying.current=false
    }
  },[status.kind])
  const {icon:Icon,title,description}=copy[status.kind]
  const owner=status.kind==='expired'||status.kind==='unpublished'
  const heading=status.kind==='expired' && status.trial?'Пробный период завершён':title
  return <main className="sf-notice">
    <header className="sf-bar"><a href="/" className="sf-brand" aria-label="EndQuote — главная"><QuoteMark/>EndQuote</a>
      <ChevronRight size={13} aria-hidden="true"/><span>Онлайн-запись</span>
    </header>
    <div className="sf-body"><section className="sf-card" aria-labelledby="sf-title">
      <div className="sf-copy" aria-live="polite">
        <div className="sf-identity"><span className={'sf-symbol'+(status.kind==='loading'?' sf-pending':'')}><Icon size={20} strokeWidth={1.6} aria-hidden="true"/></span>{owner&&<span>{status.name}</span>}</div>
        <h1 id="sf-title" tabIndex={-1} ref={titleRef}>{heading}</h1>
        {description&&<p>{description}</p>}
        {status.kind==='expired'&&<dl className="sf-terms">
          {status.endedAt&&<div><dt>Дата окончания</dt><dd><time dateTime={status.endedAt}>{dateFormat.format(new Date(status.endedAt))}</time></dd></div>}
          <div><dt>Условия продления</dt><dd>По запросу в WhatsApp</dd></div>
        </dl>}
      </div>
      {status.kind!=='loading'&&<footer className="sf-actions">
        {status.kind==='expired'&&<a className="sf-primary" href={whatsappLink('Здравствуйте! Подскажите условия продления доступа к витрине «'+status.name+'» в EndQuote.')} target="_blank" rel="noreferrer">Запросить продление<ArrowUpRight size={15}/></a>}
        {status.kind==='unpublished'&&<a className="sf-primary" href="/owner#storefront">Настройки витрины<ArrowRight size={15}/></a>}
        {owner&&<a className="sf-secondary" href="/owner">В кабинет</a>}
        {(status.kind==='closed'||status.kind==='error')&&<button type="button" className="sf-secondary" onClick={()=>{retrying.current=true;retry()}}><RefreshCw size={14}/>Попробовать ещё раз</button>}
        {status.kind==='missing'&&<a className="sf-secondary" href="/">На главную EndQuote<ArrowRight size={14}/></a>}
        {status.kind==='preview-login'&&<a className="sf-primary" href="/owner/login">Войти в кабинет<ArrowRight size={14}/></a>}
      </footer>}
    </section></div>
  </main>
}
