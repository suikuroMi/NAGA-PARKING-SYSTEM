import { CATEGORIES } from '../store/types'

export class RequestError extends Error { constructor(message: string, public status=400) { super(message) } }
function fail(): never { throw new RequestError('Invalid request. Check the supplied fields.') }
function str(v: unknown, max=200): string { if(typeof v!=='string'||v.length>max)return fail();return v }
function pin(v: unknown) { const s=str(v,4); if(!/^\d{4}$/.test(s))fail();return s }
function num(v: unknown, min=0, max=1000000) { if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max) return fail();return v }
function money(v: unknown, min=0) {
  const value=num(v,min),cents=Math.round(value*100)
  if(Math.abs(value*100-cents)>0.000001)fail()
  return cents/100
}
function bool(v: unknown) { if(typeof v!=='boolean')return fail();return v }
function obj(v: unknown): Record<string,unknown> { if(!v||typeof v!=='object'||Array.isArray(v))return fail();return v as Record<string,unknown> }
function one(v: unknown, choices: readonly string[]) { const s=str(v); if(!choices.includes(s))fail();return s }
function id(v: unknown) { const s=str(v,100);if(!s)fail();return s }

export const adminCommands = ['addSlots','updateSlot','saveRates','addAttendant','updateAttendant','resetAttendantPin','setAttendantDisabled','forceSignOutExit','changeAdminPin','updateSettings','voidTransaction','refundTransaction','endSession']
export const exitCommands = ['setOwnPin','lockExit','startBreak','unlockExit','signOutExit','touchExit','lookupTicket','cancelCheckout','completePayment','openLostCheckout','voidAndReopen']
export const kioskCommands = ['claimSlot','releaseClaim','issueTicket']
export const authCommands = ['verifyAdminPin','signInExit','logout','touchAdmin']

export function validate(command: string, raw: unknown): unknown[] {
  if(!Array.isArray(raw)||raw.length>6)fail()
  const a=raw
  switch(command) {
    case 'verifyAdminPin': case 'unlockExit': case 'setOwnPin': return [pin(a[0])]
    case 'signInExit': return [id(a[0]),pin(a[1])]
    case 'claimSlot': return [one(a[0],CATEGORIES)]
    case 'lookupTicket': return [str(a[0],500)]
    case 'openLostCheckout': return [id(a[0])]
    case 'lockExit': return [one(a[0],['idle','manual'])]
    case 'changeAdminPin': return [pin(a[0]),pin(a[1])]
    case 'resetAttendantPin': return [id(a[0]),pin(a[1])]
    case 'setAttendantDisabled': return [id(a[0]),bool(a[1])]
    case 'addSlots': {
      const block=str(a[0],3).trim().toUpperCase();if(!/^[A-Z]{1,3}$/.test(block))fail()
      const count=num(a[2],1,100);if(!Number.isInteger(count))fail()
      return [block,one(a[1],CATEGORIES),count]
    }
    case 'updateSlot': {const p=obj(a[1]);return [id(a[0]),{status:one(p.status,['available','reserved','unavailable']),category:one(p.category,CATEGORIES),reason:str(p.reason,300)}]}
    case 'addAttendant': {const p=obj(a[0]);return [{name:id(p.name),email:str(p.email,200),lane:one(p.lane,['Lane A','Lane B']),tempPin:pin(p.tempPin)}]}
    case 'updateAttendant': {const p=obj(a[1]);return [id(a[0]),{lane:one(p.lane,['Lane A','Lane B'])}]}
    case 'saveRates': {
      const values=obj(a[0]);const categories: Record<string,unknown>={}
      for(const c of CATEGORIES) {const r=obj(values[c]);categories[c]={initial:money(r.initial),initialMin:num(r.initialMin,1,1440),incrementMin:num(r.incrementMin,1,1440),additional:money(r.additional),lostFee:money(r.lostFee)}}
      return [categories,num(a[1],0,120)]
    }
    case 'updateSettings': {
      const p=obj(a[0]);const out:Record<string,unknown>={}
      for(const [key,min,max] of [['welcomeResetSec',5,300],['idleTimeoutSec',10,3600],['exitLockMin',1,120],['receiptPrinters',0,20]] as const) if(p[key]!==undefined)out[key]=num(p[key],min,max)
      if(p.autoWelcome!==undefined)out.autoWelcome=bool(p.autoWelcome)
      return [out]
    }
    case 'completePayment': {const p=obj(a[1]); const method=one(p.method,['Cash','Digital']);return [id(a[0]),method==='Cash'?{method,tender:money(p.tender)}:{method,provider:one(p.provider,['GCash','Maya']),reference:str(p.reference,40)}]}
    case 'voidTransaction': case 'voidAndReopen': case 'endSession': return [id(a[0]),str(a[1],100),str(a[2],1000),pin(a[3])]
    case 'refundTransaction': return [id(a[0]),money(a[1],0.01),str(a[2],100),str(a[3],1000),pin(a[4])]
    case 'releaseClaim': case 'issueTicket': case 'startBreak': case 'signOutExit': case 'touchExit': case 'cancelCheckout': case 'forceSignOutExit': case 'logout': case 'touchAdmin': return []
    default: throw new RequestError('Unknown operation.',404)
  }
}
