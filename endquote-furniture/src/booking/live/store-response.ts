export type StoreStatus =
  | {kind:'closed'|'missing'|'error'|'loading'|'preview-login'}
  | {kind:'unpublished'; name:string}
  | {kind:'expired'; name:string; trial:boolean; endedAt:string|null}

export class Failure extends Error {
  readonly status:number
  readonly code:string
  constructor(status:number, code:string, message:string) {
    super(message)
    this.status=status
    this.code=code
  }
}
export async function read<T>(url:string, init?:RequestInit):Promise<T> {
  const response=await fetch(url,init)
  const data=await response.json()
  if (!response.ok) throw new Failure(response.status,data.error?.code,data.error?.message)
  return data
}

export async function loadStore<T>(slug:string, preview:boolean):Promise<{kind:'ready';data:T}|StoreStatus> {
  const url=preview?'/api/owner/preview':'/api/public/'+encodeURIComponent(slug)
  const options=():RequestInit=>({cache:'no-store',signal:AbortSignal.timeout(15000)})
  try {
    return {kind:'ready',data:await read<T>(url,options())}
  } catch (error) {
    if (!(error instanceof Failure)) return {kind:'error'}
    if (error.status===404) return {kind:'missing'}
    if (preview && error.status===401) return {kind:'preview-login'}
    if (preview || error.status!==410) return {kind:'error'}
  }

  // Only a closed public storefront needs an authenticated ownership check.
  let info:Extract<StoreStatus,{kind:'expired'|'unpublished'}>|{kind:'open'}
  try {
    info=await read('/api/owner/storefront-status/'+encodeURIComponent(slug),options())
  } catch (error) {
    if (error instanceof Failure && [401,404].includes(error.status)) return {kind:'closed'}
    return {kind:'error'}
  }
  if (info.kind==='expired' || info.kind==='unpublished') return info
  if (info.kind!=='open') return {kind:'error'}
  try {
    return {kind:'ready',data:await read<T>(url,options())}
  } catch (error) {
    if (error instanceof Failure && error.status===404) return {kind:'missing'}
    if (error instanceof Failure && error.status===410) return {kind:'closed'}
    return {kind:'error'}
  }
}
