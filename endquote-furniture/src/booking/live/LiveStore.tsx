import {useEffect,useState,useRef,createContext,useContext} from 'react'
import BookingApp from '../BookingApp'
import type {BusinessProfile} from '../company'
import type {PricingConfiguration} from '../pricing'
import type {CartItem,CustomerDetails} from '../domain'
type Data={profile:{slug:string;name:string;city:string;area:string;description:string;phone:string;social:Record<string,string>;logo:string|null};
  catalog:{categories:{id:string;name:string}[];models:{id:string;name:string;category:string;base:number}[];upholstery:PricingConfiguration['upholstery'];contamination:PricingConfiguration['contamination'];extras:PricingConfiguration['extras']};
  revision:number;consentVersion:string;csrf:string;attempt:string;proof:string}
export type Store={company:BusinessProfile;pricing:PricingConfiguration;live:boolean;preview:boolean;logo?:string|null}
export const StoreContext=createContext<Store|null>(null)
export const useStore=()=>useContext(StoreContext)!
export type LiveData=Store&{categories:Data['catalog']['categories'];models:Data['catalog']['models'];quote:(cart:CartItem[])=>Promise<number>;submit:(cart:CartItem[],customer:CustomerDetails)=>Promise<{reference:string;total:number}>;restart:()=>void}
class Failure extends Error{constructor(readonly status:number,readonly code:string,message:string){super(message)}}
async function read<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,init);const data=await r.json()
  if(!r.ok)throw new Failure(r.status,data.error.code,data.error.message)
  return data
}
export default function LiveStore({slug,preview=false}:{slug:string;preview?:boolean}){
  const [data,setData]=useState<Data>(),[issue,setIssue]=useState(''),[again,retry]=useState(0)
  const url=preview?'/api/owner/preview':'/api/public/'+slug
  const pending=useRef<{key:string,promise:Promise<Data>}|null>(null)
  useEffect(()=>{let active=true;setIssue('');const key=url+':'+again
    if(pending.current?.key!==key)pending.current={key,promise:read<Data>(url)}
    pending.current.promise.then(d=>{if(active)setData(d)}).catch(e=>{if(active)setIssue(e.status===404?'Страница не найдена':e.status===410?'Витрина сейчас недоступна':'Не удалось загрузить витрину.')});return()=>{active=false}},[url,again])
  const [uploaded]=useState(()=>new Map<string,string>())
  if(issue)return <main><h1>{issue}</h1><button onClick={()=>retry(x=>x+1)}>Попробовать ещё раз</button></main>
  if(!data)return <p>Загрузка витрины…</p>
  const {profile:p,catalog:c}=data
  async function refreshOnConflict(error:unknown,current:Data):Promise<never>{
    if(error instanceof Failure&&['PRICE_CHANGED','CONSENT_CHANGED'].includes(error.code)){
      const updated=await read<Data>(url);setData({...updated,csrf:current.csrf,attempt:current.attempt,proof:current.proof})
    }
    throw error
  }
  const fraction=<K extends string>(v:Record<K,number>)=>Object.fromEntries(Object.entries(v).map(([k,n])=>[k,Number(n)/10000])) as Record<K,number>
  const live:LiveData={live:true,preview,logo:p.logo,company:{...p,initials:p.name.slice(0,2),tagline:p.description||'Химчистка мебели на дому',phoneHref:'tel:'+p.phone,messengerHref:'https://wa.me/'+p.phone.replace(/\D/g,''),socialLinks:Object.entries(p.social).map(([k,href])=>({kind:k as 'instagram'|'tiktok',label:k,href})),demo:false},
    pricing:{version:String(data.revision),basePrices:Object.fromEntries(c.models.map(m=>[m.id,m.base])),upholstery:fraction(c.upholstery),contamination:fraction(c.contamination),extras:c.extras},
    categories:c.categories,models:c.models,restart(){setData(undefined);uploaded.clear();retry(x=>x+1)},
    async quote(cart){
      try{return (await read<{total:number}>(url+'/quote',{method:'POST',headers:{'X-CSRF-Token':data.csrf,'Content-Type':'application/json'},body:JSON.stringify({revision:data.revision,items:cart.map(v=>v.configuration)})})).total}
      catch(e){return refreshOnConflict(e,data)}
    },
    async submit(cart,customer){
      if(preview)throw new Error('Предпросмотр доступен только для чтения.')
      const headers={'X-CSRF-Token':data.csrf,'X-Attempt-Proof':data.proof,'X-Attempt':data.attempt,'Idempotency-Key':data.attempt}
      const {photos,...contact}=customer
      const ids:string[]=[]
      for(const [local,id] of uploaded)if(!photos.some(v=>v.id===local)){
        await read(url+'/uploads/release',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({attempt:data.attempt,id})})
        uploaded.delete(local)
      }
      for(const photo of photos){
        if(!uploaded.has(photo.id)){
          const form=new FormData();form.append('image',photo.file!)
          const result=await read<{id:string}>(url+'/uploads',{method:'POST',headers,body:form})
          uploaded.set(photo.id,result.id)
        }
        ids.push(uploaded.get(photo.id)!)
      }
      try{
        const result=await read<{reference:string;total?:number}>(url+'/orders',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({revision:data.revision,items:cart.map(v=>v.configuration),contact,consent:true,consentVersion:data.consentVersion,uploads:ids,attempt:data.attempt})})
        return {reference:result.reference,total:result.total??(await read<{total:number}>(url+'/receipts/'+result.reference)).total}
      }catch(e){return refreshOnConflict(e,data)}
    }}
  return <BookingApp live={live}/>
}
