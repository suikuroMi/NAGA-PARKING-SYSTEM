import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import { Pool } from 'pg'
import { dbConfig } from '../lib/db'
import { buildSeed } from '../store/seed'
import { credentials } from '../server/credentials'
import { saveState } from '../server/repository'

loadEnvConfig(process.cwd())
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.local or environment variables first.')
  const pool = new Pool(dbConfig(process.env.DATABASE_URL))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(readFileSync(resolve('server/schema.sql'),'utf8'))
    const existing = await client.query('SELECT id FROM parking_config WHERE id=1')
    if (!existing.rowCount) {
      const demo = process.argv.includes('--demo') || process.env.SEED_DEMO === 'true'
      if (!process.env.INITIAL_ADMIN_PIN || !/^\d{4}$/.test(process.env.INITIAL_ADMIN_PIN)) throw new Error('Set a four-digit INITIAL_ADMIN_PIN before initializing.')
      const state = buildSeed()
      state.admin = { ...credentials(process.env.INITIAL_ADMIN_PIN), failedAttempts: 0 }
      for (const staff of state.attendants) {
        const pin = process.env[`INITIAL_PIN_${staff.id.replace('-','_')}`]
        if (!pin || !/^\d{4}$/.test(pin)) throw new Error(`Set INITIAL_PIN_${staff.id.replace('-','_')}.`)
        Object.assign(staff, credentials(pin), { failedAttempts:0, lockedUntil:undefined, mustChangePin:!demo, status:'Offline' })
      }
      if (!demo) {
        state.sessions={}; state.transactions=[]; state.activity=[]; state.nextTicket=1; state.nextTxn=1
        state.slots=state.slots.map(s=>({...s,status:'available',reason:'Eligible for assignment',ticketId:undefined}))
      }
      await saveState(client, null, state)
      console.log(`Initialized ${demo ? 'presentation fixtures' : 'empty parking facility'} in PostgreSQL.`)
    } else console.log('Schema checked; existing data preserved.')
    await client.query('COMMIT')
  } catch(e) { await client.query('ROLLBACK'); throw e }
  finally { client.release(); await pool.end() }
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
