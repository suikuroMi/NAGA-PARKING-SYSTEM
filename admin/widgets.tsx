import { buildReport, completionTime, localDate, paymentTime } from '../store/reporting'
import type { ReactNode } from 'react'
import { Badge, Card, CardHead, cx } from '../components/ui'
import { blockLabel, blocks, computeStats, quoteForSession } from './adminLogic'
import type { ActivityEvent, Slot, State } from '../store/types'
import { useStore, useNow } from '../store/store'
import { netAmount, txStatus } from '../store/logic'
import { fmtLong, fmtDurationShort, fmtPHP, fmtTime, pad2 } from '../lib/format'

type Stats = ReturnType<typeof computeStats>

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note: ReactNode; tone?: 'ok' | 'bad' | 'brand' }) {
  return (
    <Card className="px-4 py-5">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('tabular mt-3 break-words text-[24px] leading-tight sm:text-[28px]', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad', tone === 'brand' && 'text-brand')}>{value}</div>
      <div className="mt-4 text-[11px] text-muted">{note}</div>
    </Card>
  )
}

export function StatGrid({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Stat label="Total capacity" value={stats.total} note={`${stats.blockCount} blocks · 4 categories`} />
      <Stat label="Available spaces" value={stats.available} tone="ok" note="Eligible spaces only" />
      <Stat label="Occupied spaces" value={stats.occupied + stats.claimed} tone="bad" note={`${stats.occupancy.toFixed(1)}% occupancy`} />
      <Stat label="Active sessions" value={stats.active} note="Issued, not completed" />
      <Stat label="Held / out of service" value={`${stats.reserved} / ${stats.unavailable}`} note="Reserved / unavailable" />
    </div>
  )
}

export const TILE: Record<Slot['status'], string> = {
  available: 'border-ok/50 bg-ok-50 text-ok',
  occupied: 'border-bad/45 bg-bad-50 text-bad',
  reserved: 'border-warn/45 bg-warn-50 text-warn',
  unavailable: 'border-slate-400/70 bg-slate-100 text-muted bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(100,116,139,0.12)_6px_7px)]',
  claimed: 'border-dashed border-warn bg-warn-50 text-warn',
}

export function Legend() {
  const items: [string, string][] = [
    ['Available', 'border-ok bg-ok-50'],
    ['Occupied', 'border-bad bg-bad-50'],
    ['Reserved', 'border-warn bg-warn-50'],
    ['Unavailable', 'border-slate-400 bg-slate-100'],
  ]
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
      {items.map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={cx('size-3 rounded-[3px] border', c)} />
          {l}
        </span>
      ))}
    </div>
  )
}

export function FacilityMap({ slots, selected, onSelect, dim }: { slots: Slot[]; selected?: string | null; onSelect?: (s: Slot) => void; dim?: (s: Slot) => boolean }) {
  return (
    <div>
      <Legend />
      <div className="mt-5 space-y-5">
        {blocks(slots).map((b) => {
          const occ = b.slots.filter((s) => s.status === 'occupied' || s.status === 'claimed').length
          const av = b.slots.filter((s) => s.status === 'available').length
          const res = b.slots.filter((s) => s.status === 'reserved').length
          const un = b.slots.filter((s) => s.status === 'unavailable').length
          const parts = [`${occ} occupied`, `${av} available`]
          if (res) parts.push(`${res} reserved`)
          if (un) parts.push(`${un} unavailable`)
          return (
            <div key={b.id}>
              <div className="mb-2.5 flex flex-wrap justify-between gap-2 text-[13px]">
                <span>
                  Block {b.id} · {blockLabel(b.slots)}
                </span>
                <span className="text-xs text-muted">{parts.join(' · ')}</span>
              </div>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                {b.slots.map((s) => {
                  const faded = dim?.(s)
                  return (
                    <button
                      key={s.id}
                      title={`${s.id} · ${s.category} · ${s.status}`}
                      onClick={() => onSelect?.(s)}
                      className={cx(
                        'tabular h-10 rounded-md border text-[13px] transition',
                        TILE[s.status],
                        onSelect ? 'cursor-pointer hover:brightness-[0.97] hover:-translate-y-px' : 'cursor-default',
                        selected === s.id && 'border-brand ring-2 ring-brand',
                        faded && 'opacity-25',
                      )}
                    >
                      {pad2(s.number)}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-5 flex justify-between rounded-md bg-canvas px-3 py-2.5 text-[11px] text-muted">
        <span>↑ Entrance · Block A nearest entry</span>
        <span>Exit → Payment terminal</span>
      </div>
    </div>
  )
}

export function CheckoutPanel() {
  const state = useStore((s) => s)
  const c = state.checkout
  if (c) {
    const s = state.sessions[c.ticketId]
    const q = quoteForSession(s, c.exitAt)
    return (
      <Card className="p-5">
        <CardHead title="Checkout in progress" />
        <Badge className="mt-5 py-1.5">Active · Unpaid</Badge>
        <div className="mt-5 text-xl">
          {s.category} · {s.slotId}
        </div>
        <div className="tabular mt-4 text-xs text-muted">{s.ticketId}</div>
        <dl className="mt-5 space-y-4 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-muted">Fee due</dt>
            <dd className="tabular">{fmtPHP(q.total, true)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Duration</dt>
            <dd className="tabular">{fmtDurationShort(q.minutes)}</dd>
          </div>
        </dl>
        <p className="mt-5 text-[11px] leading-relaxed text-muted">{s.slotId} remains occupied until payment is confirmed at {c.terminal}.</p>
      </Card>
    )
  }
  const last = state.lastCompleted ? state.sessions[state.lastCompleted] : null
  const tx = last ? state.transactions.find((t) => t.ticketId === last.ticketId) : state.transactions[0]
  if (!tx) return null
  return (
    <Card className="p-5">
      <CardHead title="Latest payment record" />
      <Badge tone="ok" className="mt-5 py-1.5">
        {txStatus(tx)}
      </Badge>
      <div className="mt-5 text-xl">
        {tx.category} · {tx.slotId}
      </div>
      <div className="tabular mt-4 text-xs text-muted">{tx.ticketId}</div>
      <dl className="mt-5 space-y-4 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">Net collected</dt>
          <dd className="tabular">{fmtPHP(netAmount(tx), true)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Duration</dt>
          <dd className="tabular">{fmtDurationShort(tx.minutes)}</dd>
        </div>
      </dl>
      <p className="mt-5 text-[11px] leading-relaxed text-muted">
        Payment time: {fmtLong(paymentTime(tx,state).at)}{paymentTime(tx,state).source==='estimated-checkout'?' (estimated)':''}. Session: {state.sessions[tx.ticketId]?.status ?? 'unavailable'}.
      </p>
    </Card>
  )
}

export function SafeguardsPanel({ stats }: { stats: Stats }) {
  return (
    <Card className="p-5">
      <CardHead title="Assignment safeguards" />
      <div className="mt-5 flex flex-col items-start gap-3">
        <Badge tone="warn" className="py-1.5">
          {stats.reserved} reserved
        </Badge>
        <Badge tone="neutral" className="py-1.5">
          {stats.unavailable} unavailable
        </Badge>
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted">These spaces are excluded from self-service assignment.</p>
      <p className="tabular mt-4 text-xs leading-relaxed text-muted">
        Capacity check: {stats.available} available + {stats.occupied + stats.claimed} occupied + {stats.reserved} reserved + {stats.unavailable} unavailable = {stats.total}.
      </p>
    </Card>
  )
}

export function OccupancyCard({ stats }: { stats: Stats }) {
  const r = 44
  const c = 2 * Math.PI * r
  const pct = stats.occupancy
  return (
    <Card className="p-5">
      <CardHead title="Occupancy" sub={`Current snapshot · ${stats.total} spaces`} />
      <div className="mt-5 flex items-center gap-5">
        <svg viewBox="0 0 110 110" className="size-[110px] shrink-0 -rotate-90">
          <circle cx="55" cy="55" r={r} fill="none" stroke="#eef2f7" strokeWidth="12" />
          <circle cx="55" cy="55" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="12" strokeDasharray={`${(pct / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-700" />
          <text x="55" y="55" transform="rotate(90 55 55)" textAnchor="middle" dominantBaseline="central" className="fill-ink text-[19px]">
            {pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%
          </text>
        </svg>
        <div className="tabular space-y-2 text-xs">
          <div>{stats.occupied + stats.claimed} occupied</div>
          <div>{stats.available} available</div>
          <div className="text-muted">
            {stats.reserved} reserved · {stats.unavailable} unavailable
          </div>
        </div>
      </div>
    </Card>
  )
}

const HOUR = 3600000
/** "6p" / "10a" in Asia/Manila (UTC+8, whole-hour offset). */
const hourLabel = (t: number) => {
  const h = new Date(t + 8 * HOUR).getUTCHours()
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`
}

/** Eight 2-hour buckets ending with the current hour. */
export function hourlyFlow(state: State, t = Date.now()) {
  const end = Math.floor(t / HOUR) * HOUR + HOUR
  return Array.from({ length: 8 }, (_, i) => {
    const a = end - (8 - i) * 2 * HOUR
    const b = a + 2 * HOUR
    return {
      label: hourLabel(a),
      range: `${hourLabel(a)}–${hourLabel(b)}`,
      entries: Object.values(state.sessions).filter((s) => s.entry >= a && s.entry < b).length,
      exits: Object.values(state.sessions).filter(s=>{const at=completionTime(s,state);return at!==null&&at>=a&&at<b}).length,
    }
  })
}

export function FlowCard({ state, stats }: { state: State; stats: Stats }) {
  const data = hourlyFlow(state)
  const max = Math.max(...data.flatMap((d) => [d.entries, d.exits]), 1)
  return (
    <Card className="p-5">
      <CardHead title="Arrivals & completed sessions" sub="Last 16 hours · completed sessions use current status and completion time" />
      <div className="mt-4 flex gap-4 text-[11px]">
        <span className="flex items-center gap-1.5 text-brand">
          <span className="size-2 bg-brand" />
          Entries
        </span>
        <span className="flex items-center gap-1.5 text-ok">
          <span className="size-2 bg-ok" />
          Completed sessions
        </span>
      </div>
      <div className="mt-3 flex h-[104px] items-end justify-between gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5" title={`${d.range}: ${d.entries} in / ${d.exits} out`}>
            <div className="flex h-[84px] items-end gap-1">
              <div className="w-2.5 rounded-t-sm bg-brand transition-[height] duration-500" style={{ height: `${(d.entries / max) * 100}%` }} />
              <div className="w-2.5 rounded-t-sm bg-ok transition-[height] duration-500" style={{ height: `${(d.exits / max) * 100}%` }} />
            </div>
            <span className="text-[10px] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function RevenueCard({ stats }: { stats: Stats }) {
  const source=useStore(s=>s)
  const now=useNow()
  const days=Array.from({length:7},(_,i)=>localDate(now-(6-i)*86400000))
  const reports=days.map(day=>buildReport(source,day,day,now))
  const vals=reports.map(r=>r.totals.net)
  const min = Math.min(...vals) * 0.96
  const max = Math.max(...vals) * 1.02
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 260},${70 - ((v - min) / Math.max(1, max - min)) * 60}`)
  return (
    <Card className="p-5">
      <CardHead title="Seven-day net revenue" sub="PHP · payment dates · current corrections" />
      <div className="mt-5 flex items-baseline justify-between">
        <span className="tabular text-xl">{vals[6].toLocaleString()}</span>
        <span className="text-[11px] text-ok">Today</span>
      </div>
      <svg viewBox="-4 -4 268 80" className="mt-2 h-[72px] w-full overflow-visible">
        <polyline points={pts.join(' ')} fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="3.5" fill="var(--color-brand)" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{days[0]}</span>
        <span>{days[6]}</span>
      </div>
      <p className="mt-4 text-[11px] text-muted">Later corrections update the original payment day. {reports.reduce((n,r)=>n+r.estimatedRecords,0)} records use estimated payment times.</p>
    </Card>
  )
}

export function ActivityTable({ events, limit = 6 }: { events: ActivityEvent[]; limit?: number }) {
  return (
    <Card className="p-5">
      <CardHead title="Operational activity" sub="Stored event log · latest first" />
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-canvas text-[11px] text-muted">
            <tr>
              {['Time', 'Event', 'By', 'Ticket / reference', 'Result'].map((h) => (
                <th key={h} className="px-3 py-3.5 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.slice(0, limit).map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="tabular px-3 py-4">{fmtTime(e.at)}</td>
                <td className="px-3">{e.event}</td>
                <td className="px-3 text-muted">{e.actor ?? '—'}</td>
                <td className="tabular px-3">{e.ref}</td>
                <td className="px-3">{e.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function Overview({ state }: { state: State }) {
  const stats = computeStats(state)
  const now=useNow(),today=localDate(now),report=buildReport(state,today,today,now)
  return (
    <div className="space-y-5">
      <h2 className="text-lg">Live occupancy</h2>
      <StatGrid stats={stats} />
      <h2 className="text-lg">Today’s activity · {today} · Asia/Manila</h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Arrivals today" value={report.arrivals} note="By entry time" />
        <Stat label="Completed sessions today" value={report.completedSessions} note="Currently completed · by completion time" />
        <Stat label="Administrative closures today" value={report.closures.length} note={`${fmtPHP(report.uncollected,true)} uncollected · by closure time`} />
        <Stat label="Net from today’s payments" value={fmtPHP(report.totals.net,true)} note={`${report.paymentRecords} payment records · current corrections`} />
      </div>
      {report.estimatedRecords>0&&<p className="text-sm text-warn">{report.estimatedRecords} of today’s payment records use estimated checkout times.</p>}
      <div className="grid gap-5 xl:grid-cols-[1fr_264px]">
        <Card className="p-5">
          <CardHead title="Facility parking map" sub={`${stats.total} spaces · Numbered in each block · Select a bay to open it on the map`} />
          <div className="mt-5">
            <FacilityMap slots={state.slots} onSelect={(s) => (window.location.hash = `/admin/map?slot=${s.id}`)} />
          </div>
        </Card>
        <div className="grid content-start gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <CheckoutPanel />
          <SafeguardsPanel stats={stats} />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <OccupancyCard stats={stats} />
        <FlowCard state={state} stats={stats} />
        <RevenueCard stats={stats} />
      </div>
    </div>
  )
}
