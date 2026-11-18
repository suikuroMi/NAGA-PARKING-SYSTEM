import { useMemo, useState } from 'react'
import { CircleSlash, Download, FileText, Printer, Search, Undo2 } from 'lucide-react'
import CorrectionModal from './CorrectionModal'
import AdminLayout from './AdminLayout'
import { downloadCsv as download } from '../lib/csv'
import { paymentTime, TIME_SOURCE_LABEL } from '../store/reporting'
import { ActivityTable, Stat } from './widgets'
import { printReceipt, receiptJob } from '../lib/printer'
import { Badge, Button, Card, CardHead, cx, Rows, Select, toast } from '../components/ui'
import { useNow, useStore } from '../store/store'
import { computeStats, netAmount, parseSlotId, refundedOf, slotLabel, TX_TONE, txStatus, type TxStatus } from '../store/logic'
import { CATEGORIES, type Category } from '../store/types'
import { fmtLong, fmtDay, fmtDayShort, fmtDurationShort, fmtPHP, fmtTime } from '../lib/format'

const PAGE = 10

export default function TransactionsPage({ params }: { params: URLSearchParams }) {
  const state = useStore((s) => s)
  const t = useNow()
  const stats = computeStats(state)
  const focus = params.get('ticket')
  const [q, setQ] = useState(focus ?? '')
  const [cat, setCat] = useState<'all' | Category>('all')
  const [method, setMethod] = useState<'all' | 'Cash' | 'Digital'>('all')
  const [att, setAtt] = useState('all')
  const [status, setStatus] = useState<'all' | TxStatus>('all')
  const [correcting, setCorrecting] = useState<'void' | 'refund' | null>(null)
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const attendants = [...new Set(state.transactions.map((x) => x.attendant))]
  const rows = useMemo(() => {
    const needle = q.trim().toUpperCase()
    return state.transactions.filter(
      (x) => (!needle || x.ticketId.includes(needle) || x.id.includes(needle)) && (cat === 'all' || x.category === cat) && (method === 'all' || x.method === method) && (att === 'all' || x.attendant === att) && (status === 'all' || txStatus(x) === status),
    ).sort((a,b)=>paymentTime(b,state).at-paymentTime(a,state).at)
  }, [state.transactions, state.sessions, q, cat, method, att, status])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const p = Math.min(page, pages - 1)
  const view = rows.slice(p * PAGE, p * PAGE + PAGE)
  const tx = rows.find((x) => x.id === sel) ?? rows[0]
  const reset = () => setPage(0)

  const exportCsv = () => {
    download(`nsp-transactions-${fmtDayShort(t).replace(/ /g, '-')}.csv`, [
      ['Transaction ID', 'Ticket ID', 'Category', 'Slot', 'Entry (Asia/Manila)', 'Checkout (Asia/Manila)', 'Payment time (Asia/Manila)', 'Payment time source', 'Minutes', 'Amount (PHP)', 'Method', 'Provider', 'Reference', 'Tender', 'Change', 'Attendant', 'Status', 'Lost-ticket fee', 'Refunded', 'Net (PHP)', 'Correction reason'],
      ...rows.map((x) => [
        x.id,
        x.ticketId,
        x.category,
        x.slotId,
        fmtLong(x.entry),
        fmtLong(x.exit),
        fmtLong(paymentTime(x,state).at),
        TIME_SOURCE_LABEL[paymentTime(x,state).source],
        x.minutes,
        x.amount,
        x.method,
        x.provider ?? '',
        x.reference ?? '',
        x.tender,
        x.change,
        x.attendant,
        txStatus(x),
        x.lostTicketFee ?? 0,
        refundedOf(x),
        netAmount(x),
        x.voided ? `${fmtLong(x.voided.at)}: ${x.voided.reason}` : (x.refunds ?? []).map(r=>`${fmtLong(r.at)}: ${r.reason}`).join('; '),
      ]),
    ])
    toast(`Exported ${rows.length} transactions`, 'ok')
  }

  return (
    <AdminLayout active="transactions" title="Transaction history" sub={`${fmtDay(t)} · ${fmtTime(t)} · All payment records · including voids`} right={<Badge tone="ok" className="py-2">{stats.paymentRecords} payment records</Badge>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Stat label="Payment records" value={stats.paymentRecords} note="All recorded dates" />
        <Stat label="Net revenue recorded" value={fmtPHP(stats.revenue,true)} tone="ok" note="After voids and refunds" />
        <Stat label="Corrections" value={stats.voids.count + stats.refunds.count} note={`${fmtPHP(stats.voids.amount,true)} voided · ${fmtPHP(stats.refunds.amount,true)} refunded`} />
        <Stat label="Cash records" value={stats.cash} note={`${Math.round((stats.cash / Math.max(1, stats.paymentRecords)) * 100)}% of payment records`} />
        <Stat label="Digital records" value={stats.digital} tone="ok" note={`${Math.round((stats.digital / Math.max(1, stats.paymentRecords)) * 100)}% of payment records`} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="h-fit min-w-0 p-5">
          <CardHead title="Payment records" sub="Search by ticket or transaction ID. Completed paid tickets cannot be charged twice." />
          <div className="mt-5 flex flex-wrap gap-3">
            <label className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  reset()
                }}
                placeholder="Search ticket / transaction ID"
                className="h-11 w-full rounded-lg border border-line bg-white pr-3 pl-10 text-sm outline-none placeholder:text-muted focus:border-brand focus:ring-3 focus:ring-brand/15"
              />
            </label>
            <Select label="Category" className="w-[150px]" value={cat} onChange={(v) => (setCat(v), reset())} options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
            <Select label="Method" className="w-[140px]" value={method} onChange={(v) => (setMethod(v), reset())} options={[{ value: 'all', label: 'All methods' }, { value: 'Cash', label: 'Cash' }, { value: 'Digital', label: 'Digital' }]} />
            <Select label="Attendant" className="w-[160px]" value={att} onChange={(v) => (setAtt(v), reset())} options={[{ value: 'all', label: 'All attendants' }, ...attendants.map((a) => ({ value: a, label: a }))]} />
            <Select
              label="Status"
              className="w-[170px]"
              value={status}
              onChange={(v) => (setStatus(v), reset())}
              options={[{ value: 'all', label: 'All statuses' }, ...(['Paid', 'Partially refunded', 'Refunded', 'Voided'] as TxStatus[]).map((v) => ({ value: v, label: v }))]}
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">{rows.length} payment records</span>
            <div className="flex gap-2.5">
              <Button variant="secondary" size="md" icon={Download} onClick={exportCsv}>
                Export CSV
              </Button>
              <Button size="md" icon={Download} onClick={() => (window.location.hash = "/admin/reports")}>
                Print report
              </Button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[860px] text-left text-xs [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="bg-canvas text-[11px] text-muted">
                <tr>
                  {['Ticket ID', 'Vehicle category', 'Entry time', 'Checkout time', 'Payment time', 'Duration', 'Net amount', 'Payment status', 'Attendant'].map((h) => (
                    <th key={h} className="px-3 py-3.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.map((x) => (
                  <tr key={x.id} onClick={() => setSel(x.id)} className={cx('cursor-pointer border-t border-line transition hover:bg-canvas', tx?.id === x.id && 'bg-brand-50/60 hover:bg-brand-50/60')}>
                    <td className="tabular px-3 py-4">{x.ticketId}</td>
                    <td className="px-3">{x.category}</td>
                    <td className="tabular px-3">{fmtLong(x.entry)}</td>
                    <td className="tabular px-3">{fmtLong(x.exit)}</td>
                    <td className="px-3" title={TIME_SOURCE_LABEL[paymentTime(x,state).source]}>{fmtLong(paymentTime(x,state).at)}{paymentTime(x,state).source==='estimated-checkout'?' (estimated)':''}</td>
                    <td className="tabular px-3">{fmtDurationShort(x.minutes)}</td>
                    <td className="tabular px-3">
                      {netAmount(x) !== x.amount && <span className="mr-1.5 text-muted line-through">{fmtPHP(x.amount,true)}</span>}
                      {fmtPHP(netAmount(x),true)}
                    </td>
                    <td className="px-3">
                      <span className="flex items-center gap-1.5">
                        <Badge tone={TX_TONE[txStatus(x)]}>
                          {txStatus(x)} · {x.provider ?? x.method}
                        </Badge>
                        {!!x.lostTicketFee && (
                          <Badge tone="warn" dot={false}>
                            Lost ticket
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-3">{x.attendant}</td>
                  </tr>
                ))}
                {!view.length && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-sm text-muted">
                      No transactions match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            <span>
              Page {p + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={p === 0} onClick={() => setPage(p - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
        {tx && (
          <Card className="h-fit min-w-0 p-5">
            <CardHead title="Transaction detail" sub={tx.id === state.transactions[0]?.id ? 'Payment record' : 'Selected payment record'} />
            <Badge tone={TX_TONE[txStatus(tx)]} className="mt-4 py-1.5">
              {txStatus(tx)} · Payment record
            </Badge>
            <Rows
              size="sm"
              labelWidth="w-[112px]"
              className="mt-5"
              rows={[
                ['Ticket ID', <span className="tabular">{tx.ticketId}</span>],
                ['Transaction ID', <span className="tabular break-all">{tx.id}</span>],
                ['Vehicle category', tx.category],
                ['Entry time', `${fmtDayShort(tx.entry)} · ${fmtTime(tx.entry)}`],
                ['Checkout time', fmtLong(tx.exit)],
                ['Payment time', fmtLong(paymentTime(tx,state).at)],
                ['Time source', TIME_SOURCE_LABEL[paymentTime(tx,state).source]],
                ['Total duration', fmtDurationShort(tx.minutes)],
                ['Amount paid', fmtPHP(tx.amount, true)],
                ...(tx.lostTicketFee ? ([['Lost-ticket fee', fmtPHP(tx.lostTicketFee, true)]] as [string, string][]) : []),
                ...(refundedOf(tx) ? ([['Refunded', fmtPHP(refundedOf(tx), true)]] as [string, string][]) : []),
                ['Net revenue', fmtPHP(netAmount(tx), true)],
                ['Payment method', tx.method === 'Digital' ? `${tx.provider ?? 'Digital'} · Ref ${tx.reference ?? '—'}` : 'Cash'],
                ['Tender', fmtPHP(tx.tender)],
                ['Change', fmtPHP(tx.change)],
                ['Attendant', tx.attendant],
                ['Slot', slotLabel(parseSlotId(tx.slotId))],
                ['Payment status', txStatus(tx)],
                ['Session status', state.sessions[tx.ticketId]?.status ?? 'Unavailable'],
              ]}
            />
            {(tx.voided || !!tx.refunds?.length) && (
              <div className="mt-5 rounded-xl border border-line p-3">
                <div className="text-[13px]">Corrections</div>
                <ul className="mt-2 space-y-2 text-xs">
                  {tx.voided && (
                    <li className="rounded-lg bg-bad-50 px-3 py-2 text-bad">
                      Voided · {fmtLong(tx.voided.at)} · {tx.voided.reason}
                      {tx.voided.note ? ` · ${tx.voided.note}` : ''}
                      <div className="mt-0.5 text-[11px] opacity-80">By {tx.voided.by}</div>
                    </li>
                  )}
                  {(tx.refunds ?? []).map((r) => (
                    <li key={r.id} className="rounded-lg bg-warn-50 px-3 py-2 text-warn">
                      Refund {fmtPHP(r.amount, true)} · {fmtLong(r.at)} · {r.reason}
                      {r.note ? ` · ${r.note}` : ''}
                      <div className="mt-0.5 text-[11px] opacity-80">By {r.by}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Undo2}
                className="min-w-0 flex-1"
                disabled={!!tx.voided || netAmount(tx) <= 0}
                title={tx.voided ? 'Voided payments cannot be refunded' : netAmount(tx) <= 0 ? 'Fully refunded' : undefined}
                onClick={() => setCorrecting('refund')}
              >
                Refund
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={CircleSlash}
                className="min-w-0 flex-1"
                disabled={!!tx.voided || !!tx.refunds?.length}
                title={tx.voided ? 'Already voided' : tx.refunds?.length ? 'Refunded payments cannot be voided' : undefined}
                onClick={() => setCorrecting('void')}
              >
                Void
              </Button>
            </div>
            {correcting && <CorrectionModal key={tx.id + correcting} tx={tx} mode={correcting} onClose={() => setCorrecting(null)} />}
            <div className="mt-5 flex gap-2">
              <Button variant="secondary" size="sm" icon={Printer} className="min-w-0 flex-1" onClick={async () => {
                  const session = state.sessions[tx.ticketId]
                  const slot = state.slots.find((x) => x.id === tx.slotId)
                  if (!session?.payment || session.payment.transactionId !== tx.id || !slot) return toast('This payment is no longer the session’s current receipt', 'warn')
                  const r = await printReceipt(receiptJob(session, slot, true))
                  toast(r.ok ? `${r.message} · Reprint ${tx.id.slice(-4)}` : `${r.message} · No new charge`, r.ok ? 'ok' : 'warn')
                }}
              >
                Reprint
              </Button>
              <Button variant="soft" size="sm" icon={FileText} className="min-w-0 flex-1" onClick={() => (window.location.hash = `/exit/paid/${tx.ticketId}`)}>
                View record
              </Button>
            </div>
            <div className="mt-5 rounded-xl border border-line bg-canvas p-3">
              <div className="text-[13px]">Receipt preview</div>
              <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-white p-3 text-[10px] text-muted">
                <div className="text-ink">Naga Smart Park</div>
                <div>
                  {fmtDayShort(tx.exit)} · {fmtTime(tx.exit)}
                </div>
                {[
                  ['Ticket ID', tx.ticketId],
                  ['Transaction', tx.id.slice(-9)],
                  ['Slot', tx.slotId],
                  ['Entry', fmtTime(tx.entry)],
                  ['Checkout', fmtLong(tx.exit)],
                  ['Payment time', fmtLong(paymentTime(tx,state).at)],
                  ['Time source', TIME_SOURCE_LABEL[paymentTime(tx,state).source]],
                  ['Duration', fmtDurationShort(tx.minutes)],
                  ['Amount paid', fmtPHP(tx.amount, true)],
                  ['Payment method', tx.method === 'Digital' ? `${tx.provider ?? 'Digital'} · Ref ${tx.reference ?? '—'}` : 'Cash'],
                  ['Attendant', tx.attendant],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span>{k}</span>
                    <span className="tabular text-ink">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className={tx.voided ? 'text-bad' : refundedOf(tx) ? 'text-warn' : 'text-ok'}>
                    {txStatus(tx)} · Net {fmtPHP(netAmount(tx), true)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
      <div className="mt-5">
        <ActivityTable events={state.activity} />
      </div>
    </AdminLayout>
  )
}
