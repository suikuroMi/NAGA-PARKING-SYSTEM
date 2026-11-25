import type { PoolClient } from 'pg'
import type { State } from '../store/types'

/** Read all aggregates in one SQL snapshot so polling cannot observe a partial payment. */
export async function readState(client: Pick<PoolClient, 'query'>): Promise<State> {
  const result = await client.query(`SELECT data,
    (SELECT coalesce(jsonb_agg(data ORDER BY id),'[]') FROM parking_slots) slots,
    (SELECT coalesce(jsonb_object_agg(id,data),'{}') FROM parking_sessions) sessions,
    (SELECT coalesce(jsonb_agg(data ORDER BY (data->>'exit')::bigint DESC),'[]') FROM parking_payments) transactions,
    (SELECT coalesce(jsonb_agg(data ORDER BY id),'[]') FROM parking_staff) attendants,
    (SELECT coalesce(jsonb_agg(data ORDER BY at DESC),'[]') FROM parking_audit) activity
    FROM parking_config WHERE id=1`)
  const row = result.rows[0]
  if (!row) throw new Error('Database not initialized. Run npm run db:setup.')
  return { ...row.data, slots: row.slots, sessions: row.sessions, transactions: row.transactions, attendants: row.attendants, activity: row.activity }
}

export async function saveState(client: PoolClient, before: State | null, next: State) {
  const { slots, sessions, transactions, attendants, activity, ...config } = next
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  for (const slot of slots) if (changed(before?.slots.find(s => s.id === slot.id), slot)) {
    await client.query(`INSERT INTO parking_slots(id,category,status,data) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET category=$2,status=$3,data=$4`, [slot.id,slot.category,slot.status,slot])
  }
  // Close old sessions before opening a replacement on the same space.
  for (const s of Object.values(sessions).sort((a,b) => Number(a.status==='active')-Number(b.status==='active'))) {
    if (changed(before?.sessions[s.ticketId], s)) await client.query(`INSERT INTO parking_sessions(id,slot_id,status,data) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET slot_id=$2,status=$3,data=$4`, [s.ticketId,s.slotId,s.status,s])
  }
  for (const tx of transactions) if(changed(before?.transactions.find(t=>t.id===tx.id),tx)) {
    await client.query('INSERT INTO parking_payments(id,ticket_id,data) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=$3',[tx.id,tx.ticketId,tx])
  }
  for (const staff of attendants) if(changed(before?.attendants.find(a=>a.id===staff.id),staff)) {
    await client.query('INSERT INTO parking_staff(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2',[staff.id,staff])
  }
  const known = new Set(before?.activity.map(a=>a.id))
  for(const event of activity) if(!known.has(event.id)) {
    await client.query('INSERT INTO parking_audit(id,at,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[event.id,event.at,event])
  }
  await client.query(`INSERT INTO parking_config(id,data) VALUES(1,$1)
    ON CONFLICT(id) DO UPDATE SET data=$1,revision=parking_config.revision+1`, [config])
}
