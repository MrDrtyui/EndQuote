let token = ''
let ownerId: string | null | undefined
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
const pending=new Map<string,Promise<unknown>>()
export async function api<T>(path:string, method='GET', body?:unknown):Promise<T> {
  if(method==='GET'&&path.endsWith('/session')){
    let request=pending.get(path)
    if(!request){request=send<T>(path,method,body).finally(()=>pending.delete(path));pending.set(path,request)}
    return request as Promise<T>
  }
  const originalOwner = ownerId
  try { return await send<T>(path, method, body) }
  catch (error) {
    if (method === 'GET' || path.startsWith('admin/') || !(error instanceof ApiError) || error.code !== 'CSRF') throw error
    const session = await api<{owner: {id: string} | null}>('auth/session')
    // The server rejected the request before writing. Only repeat it for the same identity.
    if (originalOwner !== (session.owner?.id ?? null)) {
      window.dispatchEvent(new CustomEvent('endquote:session-expired', { detail: session }))
      throw new Error('Сеанс изменился. Проверьте аккаунт и повторите действие.')
    }
    return send<T>(path, method, body)
  }
}
async function send<T>(path:string,method:string,body?:unknown):Promise<T>{
  const form=body instanceof FormData
  const r=await fetch('/api/'+path,{method,credentials:'same-origin',headers:body===undefined ? {} : {...!form&&{'Content-Type':'application/json'},'X-CSRF-Token':token},body:body===undefined?undefined:form?body:JSON.stringify(body)})
  if(r.status===204) return undefined as T
  const unavailable = 'Не удалось связаться с сервером EndQuote. Попробуйте ещё раз.'
  if (!r.headers.get('content-type')?.includes('application/json')) throw new Error(unavailable)
  const data=await r.json().catch(() => { throw new Error(unavailable) })
  if(!r.ok) {
    if(r.status === 401 && data.error?.code === 'AUTH' && path.startsWith('owner/')) {
      window.dispatchEvent(new Event('endquote:session-expired'))
    }
    throw new ApiError(r.status, data.error?.code ?? 'UNKNOWN', data.error?.message ?? 'Сервис временно недоступен.')
  }
  if(data.csrf) token=data.csrf
  if(path.startsWith('auth/') && Object.hasOwn(data, 'owner')) ownerId = data.owner?.id ?? null
  if(path === 'auth/session') {
    // Older servers return the session without advertising social sign-in.
    data.providers = Array.isArray(data.providers)
      ? data.providers.filter((provider: unknown) => provider === 'google' || provider === 'apple')
      : []
  }
  return data
}
