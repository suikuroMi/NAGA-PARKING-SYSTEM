import { createHash, randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { State } from '../store/types'

export type Identity = { role: 'kiosk' | 'admin' | 'attendant'; actor: string; hash?: string }
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
export function cookie(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(p=>p.trim()).find(p=>p.startsWith(name+'='))?.slice(name.length+1) ?? ''
}
export async function identity(client: Pick<PoolClient,'query'>, request: Request, state: State): Promise<Identity> {
  const token=cookie(request,'nsp_session')
  if(!token) return {role:'kiosk',actor:''}
  const hash=tokenHash(token)
  const {rows}=await client.query('SELECT role,actor FROM parking_auth WHERE token_hash=$1 AND expires_at>$2',[hash,Date.now()])
  const auth=rows[0]
  if(!auth) return {role:'kiosk',actor:''}
  if(auth.role==='attendant' && (state.attendants.find(a=>a.id===auth.actor)?.status==='Disabled' || state.exitSession?.attendantId!==auth.actor)) return {role:'kiosk',actor:''}
  return {...auth,hash}
}
export async function issueSession(client: PoolClient, role: string, actor: string) {
  const token=randomBytes(32).toString('hex')
  await client.query('INSERT INTO parking_auth(token_hash,role,actor,expires_at,created_at) VALUES($1,$2,$3,$4,$5)',[tokenHash(token),role,actor,Date.now()+30*60000,Date.now()])
  return token
}
export function secureCookie(request: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol==='https:' || request.headers.get('x-forwarded-proto')==='https'
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}
export function publicState(state: State, auth: Identity, device: string): State {
  const safe=structuredClone(state)
  safe.admin.pinHash='';safe.admin.pinSalt=''
  safe.attendants=safe.attendants.map(a=>({...a,pinHash:'',pinSalt:'',email:auth.role==='admin'?a.email:''}))
  if(auth.role==='kiosk') {
    // Public kiosks see only tickets they issued, not the facility's financial history.
    safe.sessions=Object.fromEntries(Object.entries(safe.sessions).filter(([,s])=>(s as typeof s & {kioskId?:string}).kioskId===device))
    safe.transactions=[]; safe.activity=[]; safe.checkout=null; safe.exitSession=null
    safe.claims=safe.claims.filter(c=>c.kioskId===device)
    safe.lastIssued=Object.values(safe.sessions).sort((a,b)=>b.entry-a.entry)[0]?.ticketId ?? null
    safe.lastCompleted=null
  }
  return safe
}

export async function rateLimit(client: PoolClient, key: string, limit: number, windowMs: number) {
  const t=Date.now()
  const result=await client.query(`INSERT INTO parking_rate_limits(key,count,reset_at) VALUES($1,1,$2)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN parking_rate_limits.reset_at<$3 THEN 1 ELSE parking_rate_limits.count+1 END,
    reset_at=CASE WHEN parking_rate_limits.reset_at<$3 THEN $2 ELSE parking_rate_limits.reset_at END RETURNING count`,[key,t+windowMs,t])
  return result.rows[0].count<=limit
}
