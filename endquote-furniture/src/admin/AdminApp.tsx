import {useEffect,useState,type FormEvent} from 'react'
import {api} from '../owner/api'
import '../owner/owner.css'
function values(event:FormEvent<HTMLFormElement>) {
  event.preventDefault()
  return Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>
}
type Row={id:string;name:string;owner:{normalizedEmail:string};accessVersion:number;accessState:string;trialEndsAt:string;paidThrough:string|null}
export default function AdminApp(){
  const [ok,setOk]=useState(false),[rows,setRows]=useState<Row[]>([]),[cursor,setCursor]=useState<string|null>(null),[msg,setMsg]=useState('')
  async function load(more=false){const r=await api<{rows:Row[];cursor:string|null}>('admin/businesses'+(more?'?cursor='+cursor:''));setRows(more?[...rows,...r.rows]:r.rows);setCursor(r.cursor)}
  async function act(fn:()=>Promise<void>){setMsg('');try{await fn()}catch(e){setMsg(e instanceof Error?e.message:'Ошибка сети')}}
  useEffect(()=>{void act(async()=>{const s=await api<{authenticated:boolean}>('admin/session');setOk(s.authenticated);if(s.authenticated)await load()})},[])
  return <main className="eq-owner"><h1>Администрирование подписок</h1>{msg&&<p role="alert">{msg}</p>}
    {!ok?<form onSubmit={e=>{const d=values(e);void act(async()=>{await api('admin/login','POST',d);setOk(true);await load()})}}><label>Почта<input name="email" type="email" required/></label><label>Пароль<input name="password" type="password" required/></label><button>Войти</button></form>:<>
    <button onClick={()=>void act(async()=>{await api('admin/logout','POST',{});location.reload()})}>Выйти</button>
    {rows.map(b=><form key={b.id+b.accessVersion} onSubmit={e=>{const d=values(e);void act(async()=>{await api('admin/businesses/'+b.id+'/access','PATCH',{expectedVersion:b.accessVersion,state:d.state,endsAt:d.end?new Date(d.end).toISOString():null,reason:d.reason});await load()})}}>
    <h2>{b.name}</h2><p>{b.owner.normalizedEmail} · {b.accessState} · {b.accessState==='trial'?b.trialEndsAt:b.paidThrough??'Без даты окончания'}</p><label>Доступ<select name="state" defaultValue={b.accessState}>{['trial','active','expired'].map(s=><option key={s}>{s}</option>)}</select></label><label>До (местное время)<input type="datetime-local" name="end"/></label><label>Причина<input required name="reason"/></label><button>Изменить доступ</button></form>)}{cursor&&<button onClick={()=>void act(()=>load(true))}>Ещё</button>}</>}</main>
}
