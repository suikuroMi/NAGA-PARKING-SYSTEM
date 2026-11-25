import { useMemo, useState } from 'react'
import { Check, Search, TicketX } from 'lucide-react'
import ExitLayout from './ExitLayout'
import { Badge, Button, Card, CardHead, cx, Note, Rows, toast } from '../components/ui'
import { VEHICLE_ICON } from '../components/vehicle'
import { navigate } from '../lib/router'
import { openLostCheckout, quoteFor, useNow, useStore } from '../store/store'
import { slotLabel } from '../store/logic'
import { CATEGORIES, type Category } from '../store/types'
import { fmtDayShort, fmtDurationShort, fmtPHP, fmtTime } from '../lib/format'

/** Finds a driver's session by where they parked when the ticket is lost. */
export default function LostTicket() {
  const t = useNow(10000)
  const sessions = useStore((s) => s.sessions)
  const slots = useStore((s) => s.slots)
  const checkout = useStore((s) => s.checkout)
  const [cat, setCat] = useState<Category | null>(null)
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const list = useMemo(() => {
    if (!cat) return []
    const needle = q.trim().toUpperCase().replace(/\s+/g, '')
    return Object.values(sessions)
      .filter((s) => s.status === 'active' && s.category === cat && (!needle || s.slotId.startsWith(needle)))
      .sort((a, b) => a.slotId.localeCompare(b.slotId))
  }, [sessions, cat, q])

  const sel = selId ? sessions[selId] : null
  const selValid = !!sel && sel.status === 'active' && list.some((s) => s.ticketId === sel.ticketId)
  const quote = sel ? quoteFor(sel, t, true) : null
  const slotOf = (id: string) => slots.find((x) => x.id === id)!

  const pick = (id: string) => {
    setSelId(id)
    setConfirmed(false)
  }

  const open = async () => {
    if (!sel) return
    const r = await openLostCheckout(sel.ticketId)
    if (r.kind === 'not-allowed') return toast(r.message, 'warn')
    navigate(`/exit/fee/${sel.ticketId}`)
  }

  return (
    <ExitLayout stage={1} links={{ 0: '/exit' }} title="Lost ticket" sub="Find the driver's session by where they parked. A lost-ticket fee applies.">
      <div className="grid gap-7 lg:grid-cols-[1fr_430px]">
        <Card className="p-6">
          <CardHead title="Find the session" sub="Ask the driver for their vehicle type and parking slot." />
          <div className="mt-6 text-[13px] text-ink">1 · Vehicle type</div>
          <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORIES.map((c) => {
              const Icon = VEHICLE_ICON[c]
              const on = cat === c
              return (
                <button
                  key={c}
                  onClick={() => {
                    setCat(c)
                    setSelId(null)
                    setConfirmed(false)
                  }}
                  aria-pressed={on}
                  className={cx('flex h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 text-sm transition', on ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-white text-body hover:border-brand/40')}
                >
                  <Icon className="size-6" strokeWidth={1.4} />
                  {c}
                </button>
              )
            })}
          </div>
          <label htmlFor="lost-slot" className="mt-7 block text-[13px] text-ink">
            2 · Where did they park?
          </label>
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input
              id="lost-slot"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={!cat}
              placeholder={cat ? 'Slot, e.g. B07' : 'Choose a vehicle type first'}
              className="tabular h-12 w-full rounded-lg border border-line bg-white pr-3 pl-10 text-sm uppercase outline-none placeholder:normal-case placeholder:text-faint focus:border-brand focus:ring-3 focus:ring-brand/15 disabled:bg-slate-50"
            />
          </div>
          {cat && (
            <div role="radiogroup" aria-label="Matching sessions" className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
              {list.map((s) => {
                const on = s.ticketId === selId
                const open = checkout?.ticketId === s.ticketId
                return (
                  <button
                    key={s.ticketId}
                    role="radio"
                    aria-checked={on}
                    onClick={() => pick(s.ticketId)}
                    className={cx('flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 px-4 py-3 text-left transition', on ? 'border-brand bg-brand-50' : 'border-line bg-white hover:border-brand/40')}
                  >
                    <span className={cx('grid size-5 shrink-0 place-items-center rounded-full border-2', on ? 'border-brand bg-brand text-white' : 'border-slate-300')}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                    <span className="w-[150px] shrink-0 text-[15px] text-ink">{slotLabel(slotOf(s.slotId))}</span>
                    <span className="tabular flex-1 text-[13px] text-muted">
                      In {fmtDayShort(s.entry)} · {fmtTime(s.entry)} · {fmtDurationShort(Math.floor((t - s.entry) / 60000))}
                    </span>
                    {open && <Badge>Checkout open</Badge>}
                    <span className="tabular text-xs text-faint">…{s.ticketId.slice(-4)}</span>
                  </button>
                )
              })}
              {!list.length && <p className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-muted">No active {cat} sessions match. Check the slot with the driver.</p>}
            </div>
          )}
        </Card>
        <div className="space-y-6">
          <Card className="p-6">
            <CardHead title="Confirm with the driver" />
            {sel && selValid && quote ? (
              <>
                <div className="mt-5 text-[26px] leading-tight text-ink uppercase">{slotLabel(slotOf(sel.slotId))}</div>
                <div className="mt-2 text-sm text-muted">
                  {sel.category} · entered {fmtDayShort(sel.entry)}, {fmtTime(sel.entry)}
                </div>
                <Rows
                  className="mt-6 border-t border-line pt-5"
                  rows={[
                    ['Time fee', <span className="tabular">{fmtPHP(quote.initial + quote.additional, true)}</span>],
                    ['Lost-ticket fee', <span className="tabular">{fmtPHP(quote.lostFee, true)}</span>],
                    ['Total so far', <span className="tabular text-lg">{fmtPHP(quote.total, true)}</span>],
                  ]}
                />
                <label className={cx('mt-6 flex cursor-pointer items-start gap-3.5 rounded-xl px-4 py-4 text-[14px] transition', confirmed ? 'bg-ok-50 text-ok' : 'bg-canvas text-body')}>
                  <input type="checkbox" className="peer sr-only" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span className={cx('mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-md border-2 transition peer-focus-visible:outline-2 peer-focus-visible:outline-brand', confirmed ? 'border-ok bg-ok text-white' : 'border-slate-400 bg-white')}>
                    {confirmed && <Check className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  The driver confirmed the parking location and their approximate entry time.
                </label>
                <Button icon={TicketX} className="mt-5 w-full uppercase" disabled={!confirmed} onClick={open}>
                  Open lost-ticket checkout
                </Button>
              </>
            ) : (
              <p className="mt-5 text-sm leading-relaxed text-muted">Select the matching session to preview the fee. Only active sessions can be matched.</p>
            )}
            <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate('/exit')}>
              Back to exit dashboard
            </Button>
          </Card>
          <Note title="Fee rules">The fee uses the stored entry time and the rate frozen at entry. Lost-ticket fees can't be waived at the terminal.</Note>
        </div>
      </div>
    </ExitLayout>
  )
}
