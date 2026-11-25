import {test} from 'node:test'
import assert from 'node:assert/strict'
import {requestJson} from '../lib/request'

test('deadline aborts a stalled response body and ignores late completion',async()=>{
  const original=globalThis.fetch
  let signal:AbortSignal|null|undefined,finish!:(value:unknown)=>void
  globalThis.fetch=async(_url,init)=>{
    signal=init?.signal
    return {ok:true,status:200,json:()=>new Promise(resolve=>{finish=resolve})} as Response
  }
  try{
    await assert.rejects(requestJson('/test',{},20),/not confirmed/)
    assert.equal(signal?.aborted,true)
    finish({late:true})
  }finally{globalThis.fetch=original}
})

test('confirmed server rejection retains status and error for the caller',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'Sign in required'}),{status:403})
  try{assert.deepEqual(await requestJson('/test'),{ok:false,status:403,data:{error:'Sign in required'}})}
  finally{globalThis.fetch=original}
})
