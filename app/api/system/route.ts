import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { readState, saveState } from '@/server/repository'
import { createEngine } from '@/server/engine'
import { cookie, identity, issueSession, publicState, rateLimit, secureCookie, tokenHash, type Identity } from '@/server/access'
import { adminCommands, authCommands, exitCommands, kioskCommands, RequestError, validate } from '@/server/validation'

export const dynamic='force-dynamic'

async function handle(request: Request, mutate: boolean) {
  let client
  try {
    let body: Record<string,unknown> = {}
    if(mutate) {
      const origin=request.headers.get('origin')
      if(request.headers.get('x-naga-request')!=='1'||(origin && new URL(origin).host!==request.headers.get('host'))) throw new RequestError('Request origin rejected.',403)
      if(Number(request.headers.get('content-length')||0)>16000)throw new RequestError('Request too large.',413)
      const rawText=await request.text()
      if(rawText.length>16000)throw new RequestError('Request too large.',413)
      let parsed: unknown
      try {parsed=JSON.parse(rawText)}catch{throw new RequestError('Invalid JSON.')}
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new RequestError('Invalid request body.')
      body=parsed as Record<string,unknown>
      if(typeof body.command!=='string')throw new RequestError('Command required.')
    }
    client=await pool.connect()
    await client.query('BEGIN')
    // The facility has one exit terminal. Serialize commands across all clients.
    await client.query('SELECT id FROM parking_config WHERE id=1 FOR UPDATE')
    const before=await readState(client)
    let auth=await identity(client,request,before)
    const deviceCookie=cookie(request,'nsp_device')
    const device=/^[a-f0-9-]{36}$/.test(deviceCookie)?deviceCookie:randomUUID()
    const engine=createEngine(structuredClone(before),device)
    engine.sweep()
    if(before.exitSession && !before.exitSession.locked && Date.now()-before.exitSession.lastActive>before.settings.exitLockMin*60000) engine.lockExit('idle')
    let nextCookie: string|undefined
    let result: unknown=null
    let command=''
    if(mutate) {
      command=body.command as string
      const args=validate(command,body.args)
      const requestId=body.id
      if(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/.test(requestId))throw new RequestError('Request ID required.')
      const authAction=['verifyAdminPin','signInExit','unlockExit'].includes(command)
      if(!await rateLimit(client,`${authAction?'auth':'command'}:${device}`,authAction?10:180,60000)) {
        await client.query('COMMIT')
        return NextResponse.json({error:'Too many requests. Please wait a minute.'},{status:429})
      }
      const allowed=kioskCommands.includes(command)||authCommands.includes(command)||(auth.role==='admin'&&adminCommands.includes(command))||(auth.role==='attendant'&&exitCommands.includes(command))
      if(!allowed)throw new RequestError('Sign in with an authorized account.',403)
      if(auth.role==='attendant'&&exitCommands.includes(command)&&!['unlockExit','setOwnPin','signOutExit'].includes(command)) {
        const terminal=before.exitSession
        if(!terminal||terminal.locked||Date.now()-terminal.lastActive>before.settings.exitLockMin*60000)throw new RequestError('Terminal locked. Unlock it to continue.',403)
      }
      const argsHash=tokenHash(JSON.stringify(args))
      const cached=await client.query('SELECT result,command,args_hash FROM parking_requests WHERE device=$1 AND id=$2',[device,requestId])
      if(cached.rowCount&&!authCommands.includes(command)) {
        const previous=cached.rows[0]
        if(previous.command!==command||previous.args_hash!==argsHash)throw new RequestError('Request ID was already used for another action.',409)
        result=previous.result
      } else if(command==='logout') {
        if(auth.hash)await client.query('DELETE FROM parking_auth WHERE token_hash=$1',[auth.hash])
        if(auth.role==='attendant')engine.signOutExit()
        auth={role:'kiosk',actor:''};nextCookie='';result=true
      } else if(command==='touchAdmin') {
        if(auth.role!=='admin')throw new RequestError('Administrator sign-in required.',403)
        await client.query('UPDATE parking_auth SET expires_at=$2 WHERE token_hash=$1',[auth.hash,Date.now()+30*60000])
        result=true
      } else {
        if(command==='completePayment' && before.checkout && Date.now()-before.checkout.openedAt>5*60000) throw new RequestError('The fee quote expired. Cancel checkout and scan the ticket again to refresh the amount.',409)
        // Dispatch is limited to the explicit allowlists and validated argument shapes.
        const action=(engine as unknown as Record<string,(...a:unknown[])=>unknown>)[command]
        if(!action)throw new RequestError('Unsupported operation.')
        result=action(...args)
        if(result===undefined)result=true
        if(command==='issueTicket'&&result&&typeof result==='object'&&'ticketId' in result) {
          Object.assign(result,{kioskId:device})
        }
        if((command==='verifyAdminPin'||command==='signInExit')&&(result as {ok?:boolean})?.ok) {
          if(auth.hash)await client.query('DELETE FROM parking_auth WHERE token_hash=$1',[auth.hash])
          const role=command==='verifyAdminPin'?'admin':'attendant'
          const actor=role==='admin'?'administrator':String(args[0])
          if(role==='attendant')await client.query("DELETE FROM parking_auth WHERE role='attendant'")
          nextCookie=await issueSession(client,role,actor)
          auth={role,actor,hash:tokenHash(nextCookie)}
        }
        if(command==='signOutExit'&&result===true) {
          await client.query('DELETE FROM parking_auth WHERE token_hash=$1',[auth.hash])
          auth={role:'kiosk',actor:''};nextCookie=''
        }
        if(command==='forceSignOutExit'||command==='resetAttendantPin'||command==='setAttendantDisabled') {
          if(command==='forceSignOutExit')await client.query("DELETE FROM parking_auth WHERE role='attendant'")
          else await client.query("DELETE FROM parking_auth WHERE role='attendant' AND actor=$1",[args[0]])
        }
        if(command==='changeAdminPin'&&(result as {ok?:boolean})?.ok)await client.query("DELETE FROM parking_auth WHERE role='admin' AND token_hash<>$1",[auth.hash])
        if(!authCommands.includes(command))await client.query('INSERT INTO parking_requests(device,id,command,args_hash,result,at) VALUES($1,$2,$3,$4,$5,$6)',[device,requestId,command,argsHash,JSON.stringify(result),Date.now()])
      }
      if(auth.hash) {
        await client.query('UPDATE parking_auth SET expires_at=$2 WHERE token_hash=$1',[auth.hash,Date.now()+30*60000])
        if(nextCookie===undefined)nextCookie=cookie(request,'nsp_session')
      }
    }
    const state=engine.getState()
    await saveState(client,before,state)
    await client.query('COMMIT')
    const response=NextResponse.json({state:publicState(state,auth,device),auth:{role:auth.role,actor:auth.actor},device,result}, {headers:{'Cache-Control':'no-store'}})
    if(device!==deviceCookie)response.headers.append('Set-Cookie',secureCookie(request,'nsp_device',device,86400))
    if(nextCookie!==undefined)response.headers.append('Set-Cookie',secureCookie(request,'nsp_session',nextCookie,nextCookie?1800:0))
    return response
  } catch(error) {
    if(client)await client.query('ROLLBACK').catch(()=>{})
    if(error instanceof RequestError)return NextResponse.json({error:error.message},{status:error.status})
    console.error('Parking operation failed:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({error:'Parking database unavailable. Your action was not confirmed. Retry when connected.'},{status:503})
  } finally {client?.release()}
}
export function GET(request: Request) {return handle(request,false)}
export function POST(request: Request) {return handle(request,true)}
