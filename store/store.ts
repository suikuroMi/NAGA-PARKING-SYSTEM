import { useEffect, useState, useSyncExternalStore } from 'react'
import type { State, Category, Session, Transaction } from './types'
import { CATEGORIES } from './types'
import { calcFee, minutesOf } from './logic'
import { toast } from '../components/ui'
import type { createEngine } from '../server/engine'
import { requestJson } from '../lib/request'

type Engine = ReturnType<typeof createEngine>
export type AuthResult = ReturnType<Engine['verifyAdminPin']>
export type ActionResult = ReturnType<Engine['voidTransaction']>
export type LookupResult = ReturnType<Engine['lookupTicket']>
export type PaymentInput = Parameters<Engine['completePayment']>[1]
export const now = () => Date.now()
export const TERMINAL = { name: 'Terminal 01', lane: 'Lane A' as const }
export let KIOSK_ID = ''
let auth = { role: 'kiosk', actor: '' }
let connection: 'connecting' | 'connected' | 'offline' = 'connecting'
const categories = Object.fromEntries(CATEGORIES.map(c=>[c,{initial:0,initialMin:60,incrementMin:60,additional:0,lostFee:0}])) as State['rates']['categories']
let state: State = { slots:[],sessions:{},transactions:[],activity:[],attendants:[],claims:[],nextTicket:1,nextTxn:1,
  checkout:null,lastCompleted:null,lastIssued:null,exitSession:null,seededAt:0,
  settings:{welcomeResetSec:15,idleTimeoutSec:60,exitLockMin:10,autoWelcome:true,receiptPrinters:0},
  rates:{version:'',effective:0,grace:0,categories,history:[]},admin:{pinHash:'',pinSalt:'',failedAttempts:0} }
const listeners = new Set<() => void>()
function notify() { listeners.forEach(fn=>fn()) }
const subscribe = (fn:()=>void) => {listeners.add(fn);return ()=>{listeners.delete(fn)}}
export const getState = () => state
export function useStore<T>(select:(s:State)=>T):T {return select(useSyncExternalStore(subscribe,()=>state))}
export function useConnection() {return useSyncExternalStore(subscribe,()=>connection)}
export function useAuth() {return useSyncExternalStore(subscribe,()=>auth)}
export function useNow(intervalMs=10000) {const [t,setT]=useState(now);useEffect(()=>{const timer=setInterval(()=>setT(now()),intervalMs);return ()=>clearInterval(timer)},[intervalMs]);return t}
function accept(data: {state:State;auth:typeof auth;device:string}) {state=data.state;auth=data.auth;KIOSK_ID=data.device;connection='connected';notify()}
let pending=0
let generation=0
let poll:Promise<boolean>|null=null
export async function syncFromBackend():Promise<boolean> {
  if(pending)return connection==='connected'
  if(poll)return poll
  const started=generation
  poll=(async()=>{try {
    const response=await requestJson('/api/system',{cache:'no-store'})
    if(!response.ok)throw new Error('Database unavailable')
    const data=response.data
    if(!pending && started===generation)accept(data)
    return true
  }catch {if(!pending&&started===generation){connection='offline';notify()}return false}finally{poll=null}})()
  return poll
}
const requests=new Map<string,string>()
const inFlight=new Map<string,Promise<unknown>>()
let mutationQueue:Promise<unknown>=Promise.resolve()
function newId() {const b=crypto.getRandomValues(new Uint8Array(16));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5')}
async function request(command:string,args:unknown[]):Promise<unknown> {
  const key=JSON.stringify([command,args])
  if(inFlight.has(key))return inFlight.get(key)!
  const id=requests.get(key)??newId()
  requests.set(key,id)
  pending++
  generation++
  const task=mutationQueue.then(async()=>{
    let serverRejected=false
    let refreshAuth=false
    try {
      const response=await requestJson('/api/system',{method:'POST',headers:{'Content-Type':'application/json','X-Naga-Request':'1'},body:JSON.stringify({command,args,id})})
      const data=response.data
      if(!response.ok) {
        serverRejected=response.status<500
        if(serverRejected)requests.delete(key)
        refreshAuth=response.status===403
        throw new Error(data.error||'The action was not confirmed.')
      }
      requests.delete(key);accept(data);return data.result
    }catch(error) {
      if(!serverRejected){connection='offline';notify()}
      const message=error instanceof Error?error.message:'Connection failed. Retry the same action.'
      toast(serverRejected?message:`The action was not confirmed. ${message}`,'warn');throw error
    }finally {pending--;inFlight.delete(key);if(refreshAuth)void syncFromBackend()}
  })
  mutationQueue=task.catch(()=>{})
  inFlight.set(key,task);return task
}
function invoke<K extends keyof Engine>(command:K,...args:Parameters<Engine[K]>):Promise<ReturnType<Engine[K]>> {return request(command,args) as Promise<ReturnType<Engine[K]>>}
export const claimSlot = (...args:Parameters<Engine['claimSlot']>) => invoke('claimSlot',...args)
export const releaseClaim = (...args:Parameters<Engine['releaseClaim']>) => invoke('releaseClaim',...args)
export const issueTicket = (...args:Parameters<Engine['issueTicket']>) => invoke('issueTicket',...args)
export const signInExit = (...args:Parameters<Engine['signInExit']>) => invoke('signInExit',...args)
export const setOwnPin = (...args:Parameters<Engine['setOwnPin']>) => invoke('setOwnPin',...args)
export const lockExit = (...args:Parameters<Engine['lockExit']>) => invoke('lockExit',...args)
export const startBreak = (...args:Parameters<Engine['startBreak']>) => invoke('startBreak',...args)
export const unlockExit = (...args:Parameters<Engine['unlockExit']>) => invoke('unlockExit',...args)
export const signOutExit = (...args:Parameters<Engine['signOutExit']>) => invoke('signOutExit',...args)
let lastTouch=0
export function touchExit() {if(Date.now()-lastTouch<30000)return Promise.resolve();lastTouch=Date.now();return invoke('touchExit').catch(()=>{})}
export const lookupTicket = (...args:Parameters<Engine['lookupTicket']>) => invoke('lookupTicket',...args)
export const cancelCheckout = (...args:Parameters<Engine['cancelCheckout']>) => invoke('cancelCheckout',...args)
export const completePayment = (...args:Parameters<Engine['completePayment']>) => invoke('completePayment',...args)
export const openLostCheckout = (...args:Parameters<Engine['openLostCheckout']>) => invoke('openLostCheckout',...args)
export const voidAndReopen = (...args:Parameters<Engine['voidAndReopen']>) => invoke('voidAndReopen',...args)
export const voidTransaction = (...args:Parameters<Engine['voidTransaction']>) => invoke('voidTransaction',...args)
export const refundTransaction = (...args:Parameters<Engine['refundTransaction']>) => invoke('refundTransaction',...args)
export const endSession = (...args:Parameters<Engine['endSession']>) => invoke('endSession',...args)
export const updateSlot = (...args:Parameters<Engine['updateSlot']>) => invoke('updateSlot',...args)
export const addSlots = (...args:Parameters<Engine['addSlots']>) => invoke('addSlots',...args)
export const saveRates = (...args:Parameters<Engine['saveRates']>) => invoke('saveRates',...args)
export const addAttendant = (...args:Parameters<Engine['addAttendant']>) => invoke('addAttendant',...args)
export const updateAttendant = (...args:Parameters<Engine['updateAttendant']>) => invoke('updateAttendant',...args)
export const resetAttendantPin = (...args:Parameters<Engine['resetAttendantPin']>) => invoke('resetAttendantPin',...args)
export const setAttendantDisabled = (...args:Parameters<Engine['setAttendantDisabled']>) => invoke('setAttendantDisabled',...args)
export const forceSignOutExit = (...args:Parameters<Engine['forceSignOutExit']>) => invoke('forceSignOutExit',...args)
export const verifyAdminPin = (...args:Parameters<Engine['verifyAdminPin']>) => invoke('verifyAdminPin',...args)
export const changeAdminPin = (...args:Parameters<Engine['changeAdminPin']>) => invoke('changeAdminPin',...args)
export const updateSettings = (...args:Parameters<Engine['updateSettings']>) => invoke('updateSettings',...args)
export const logout = () => request('logout',[])
export const touchAdmin = () => request('touchAdmin',[])
export function resetDemo() {toast('Use the documented database restore procedure to reset presentation data.','warn')}
export const consumeRefreshNotice = () => false
export const availableFor = (category:Category,s:State=state) => s.slots.filter(x=>x.category===category&&x.status==='available')
export const useMyClaim = () => useStore(s=>s.claims.find(c=>c.kioskId===KIOSK_ID)??null)
export const exitAttendant = (s:State) => s.attendants.find(a=>a.id===s.exitSession?.attendantId&&a.status!=='Disabled')??null
export const useExitAttendant = () => useStore(exitAttendant)
export const useExitSession = () => useStore(s=>s.exitSession)
export function quoteFor(session:Session,exitAt:number,lost=false) {const minutes=minutesOf(session.entry,exitAt);return {minutes,...calcFee(session.rate,minutes,session.grace,lost)}}
export const normalizeReference = (r:string) => r.replace(/[\s-]+/g,'').toUpperCase()
export const isValidReference = (r:string) => /^[A-Z0-9]{6,20}$/.test(normalizeReference(r))
export const maskReference = (r:string) => '••'+r.slice(-4)
export function reasonError(reason:string,list:readonly string[],note?:string) {if(!list.includes(reason))return 'Choose a reason';if(reason==='Other'&&(note??'').trim().length<5)return 'Add a note (at least 5 characters)';return null}
export const OVERRIDE_WINDOW_MS=15*60000
export function overrideBlocker(s:State,tx:Transaction):string|null {
 const session=s.sessions[tx.ticketId]
 if(tx.voided||tx.refunds?.length)return 'This payment already has a correction.'
 if(!session||session.status!=='completed'||session.payment?.transactionId!==tx.id)return 'This payment is not the latest for its session.'
 if(now()-session.payment.paidAt>OVERRIDE_WINDOW_MS)return 'The 15-minute override window has passed.'
 if(s.slots.find(x=>x.id===session.slotId)?.status!=='available')return 'The space has been reassigned.'
 if(s.checkout)return 'Another checkout is open.'
 return null
}
