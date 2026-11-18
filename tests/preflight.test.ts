import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'

test('preflight rejects invalid configuration without echoing its value',()=>{
  const marker='PRIVATE_CONFIGURATION_CANARY'
  const script=`const {check}=require(${JSON.stringify(resolve('scripts/preflight.cjs'))});check().then(f=>process.exitCode=f.length?1:0)`
  const result=spawnSync(process.execPath,['-e',script],{env:{...process.env,DATABASE_URL:marker},encoding:'utf8',windowsHide:true})
  assert.equal(result.status,1)
  assert.match(result.stdout,/Set a valid DATABASE_URL/)
  assert.ok(!(result.stdout+result.stderr).includes(marker))
})

test('preflight rejects a non-PostgreSQL URL without printing its password',()=>{
  const marker='PRIVATE_PASSWORD_CANARY'
  const script=`const {check}=require(${JSON.stringify(resolve('scripts/preflight.cjs'))});check().then(f=>process.exitCode=f.length?1:0)`
  const result=spawnSync(process.execPath,['-e',script],{env:{...process.env,DATABASE_URL:'https://user:'+marker+'@localhost/data'},encoding:'utf8',windowsHide:true})
  assert.equal(result.status,1)
  assert.ok(!(result.stdout+result.stderr).includes(marker))
})
