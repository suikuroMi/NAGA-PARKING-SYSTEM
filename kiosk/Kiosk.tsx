import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Hand, House, LogIn, MapPin, MousePointerClick, Printer, QrCode, ShieldCheck, Info } from 'lucide-react'
import { Badge, Button, cx, Logo, QRCode, toast } from '../components/ui'
import { printTicket, ticketJob } from '../lib/printer'
import { VEHICLE_ICON } from '../components/vehicle'
import { availableFor, claimSlot, issueTicket, now, releaseClaim, useMyClaim, useNow, useStore } from '../store/store'
import { categoryLocation, directions, slotLabel } from '../store/logic'
import { CATEGORIES, type Category, type Session } from '../store/types'
import { fmtDay, fmtLong, fmtTime, ordinal, pad2 } from '../lib/format'

type Screen = 'welcome' | 'select' | 'assigned' | 'ticket' | 'ready' | 'full'
const STEP_OF: Record<Screen, number> = { welcome: 0, select: 1, full: 1, assigned: 2, ticket: 3, ready: 3 }
const STEPS = ['Welcome', 'Select Vehicle Type', 'Assigned Parking Location', 'QR Ticket']

export default function Kiosk() {
  const issuing = useRef(false)
  const pendingTicket = useRef<string | null>(null)
  const [screen, setScreen] = useState<Screen>('welcome')
  const [fullCat, setFullCat] = useState<Category>('Car')
  const [issued, setIssued] = useState<Session | null>(null)
  const claim = useMyClaim()
  const sessions = useStore((s) => s.sessions)
  const idleSec = useStore((s) => s.settings.idleTimeoutSec ?? 60)
  const autoWelcome = useStore((s) => s.settings.autoWelcome)
  const idleEnabled = autoWelcome && (screen === 'select' || screen === 'assigned' || screen === 'full' || screen === 'ticket')
  const idle = useIdle(idleSec, idleEnabled, screen)

  // A claim left behind by a previous visit is released back to the pool.
  useEffect(() => {
    void releaseClaim().catch(()=>{})
  }, [])

  const choose = async (cat: Category) => {
    const c = await claimSlot(cat).catch(()=>undefined)
    if(c===undefined)return
    if (!c) {
      setFullCat(cat)
      setScreen('full')
    } else setScreen('assigned')
  }

  const reset = async () => {
    await releaseClaim()
    pendingTicket.current = null
    setIssued(null)
    setScreen('welcome')
  }

  const expire = () => {
    idle.dismiss()
    if (screen === 'ticket' && issued) setScreen('ready')
    else reset()
  }

  // If another tab or the stale-claim sweep released this kiosk's claim, start over.
  useEffect(() => {
    if (screen !== 'assigned' || claim) return
    const recovered = pendingTicket.current ? sessions[pendingTicket.current] : null
    if (recovered) {
      setIssued(recovered)
      setScreen('ticket')
      pendingTicket.current = null
    } else if (!issuing.current) {
      pendingTicket.current = null
      setScreen('select')
    }
  }, [screen, claim, sessions])

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <KioskHeader step={STEP_OF[screen]} />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <div key={screen} className="mx-auto w-full max-w-[1200px] px-6 py-12 md:px-12 animate-fade-up">
          {screen === 'welcome' && <Welcome onStart={() => setScreen('select')} />}
          {screen === 'select' && <SelectVehicle onPick={choose} onBack={() => setScreen('welcome')} />}
          {screen === 'full' && <Full category={fullCat} onReview={() => setScreen('select')} onHome={reset} />}
          {screen === 'assigned' && claim && (
            <Assigned
              onContinue={async () => {
                if (issuing.current) return
                issuing.current = true
                pendingTicket.current = claim.ticketId
                const s = await issueTicket().finally(() => { issuing.current = false })
                if (s) {
                  pendingTicket.current = null
                  setIssued(s)
                  setScreen('ticket')
                } else {
                  pendingTicket.current = null
                  toast('That space was released. Please choose your vehicle type again.', 'warn')
                  setScreen('select')
                }
              }}
              onCancel={async () => {
                await releaseClaim()
                setScreen('select')
              }}
            />
          )}
          {screen === 'ticket' && issued && <Ticket session={issued} onDone={() => setScreen('ready')} />}
          {screen === 'ready' && issued && <Ready session={issued} onHome={reset} />}
        </div>
      </main>
      {idle.idle && idleEnabled && <IdlePrompt screen={screen} slotId={claim?.slotId} onStay={idle.dismiss} onExpire={expire} />}
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-6 text-sm text-muted md:px-12">
          <span className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-ok" strokeWidth={1.6} />
            Self-service entrance · No personal information required
          </span>
          <span className="hidden text-xs sm:block">Entrance kiosk · Terminal E1</span>
        </div>
      </footer>
    </div>
  )
}

function KioskHeader({ step }: { step: number }) {
  const t = useNow()
  return (
    <header className="bg-white">
      <div className="mx-auto max-w-[1200px] px-6 pt-7 md:px-12">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <Logo />
            <div>
              <div className="text-2xl leading-tight text-ink">Naga Smart Park</div>
              <div className="mt-1 text-sm tracking-[0.02em] text-muted uppercase">Naga City People's Mall</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2.5 text-right">
            <Badge tone="ok" upper>
              Self-service entrance
            </Badge>
            <span className="tabular text-sm text-muted">
              {fmtDay(t)} · {fmtTime(t)}
            </span>
          </div>
        </div>
        <ol className="flex flex-wrap gap-x-6 gap-y-3 py-[42px]">
          {STEPS.map((label, i) => {
            const done = i < step
            const cur = i === step
            return (
              <li key={label} className={cx('flex items-center gap-2.5 text-[13px]', cur ? 'text-brand' : 'text-muted')}>
                <span className={cx('grid size-7 place-items-center rounded-full text-xs', done || cur ? 'bg-brand text-white' : 'bg-slate-100 text-muted')}>
                  {done ? <Check className="size-3.5" strokeWidth={2} /> : i + 1}
                </span>
                {label}
              </li>
            )
          })}
        </ol>
      </div>
    </header>
  )
}

function Welcome({ onStart }: { onStart: () => void }) {
  const steps = [
    { icon: MousePointerClick, n: '01', label: 'Select vehicle type' },
    { icon: MapPin, n: '02', label: 'Receive your location' },
    { icon: QrCode, n: '03', label: 'Keep your QR ticket' },
  ]
  return (
    <div>
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_466px]">
        <div>
          <Badge upper className="py-2">
            Park simply. Keep Naga moving.
          </Badge>
          <h1 className="mt-10 text-5xl leading-[1.3] tracking-[-0.01em] text-ink md:text-[60px]">Welcome to Naga Smart Park.</h1>
          <p className="mt-10 max-w-[540px] text-2xl leading-[1.45] text-muted">Select your vehicle type to get your parking ticket.</p>
          <Button size="xl" icon={ArrowRight} className="mt-8 w-full max-w-[590px]" onClick={onStart}>
            Start parking
          </Button>
          <p className="mt-7 text-base text-muted">Choose your vehicle. Get your space. Keep your QR ticket.</p>
        </div>
        <div className="flex aspect-[466/400] flex-col items-center justify-center rounded-[28px] bg-brand-50">
          <Logo size="lg" />
          <div className="mt-7 flex gap-8 text-brand">
            {(['Motorcycle', 'Car', 'Van'] as Category[]).map((c) => {
              const Icon = VEHICLE_ICON[c]
              return <Icon key={c} className="size-9" strokeWidth={1.4} />
            })}
          </div>
          <p className="mt-6 text-lg text-ink">One ticket. One assigned space.</p>
        </div>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map(({ icon: Icon, n, label }) => (
          <div key={n} className="flex items-center gap-5 rounded-xl bg-white px-6 py-6">
            <Icon className="size-6 text-brand" strokeWidth={1.6} />
            <div>
              <div className="text-xs tracking-[0.04em] text-muted">STEP {n}</div>
              <div className="mt-1 text-lg text-ink">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SelectVehicle({ onPick, onBack }: { onPick: (c: Category) => void; onBack: () => void }) {
  const slots = useStore((s) => s.slots)
  const state = useStore((s) => s)
  const total = CATEGORIES.reduce((n, c) => n + availableFor(c, state).length, 0)
  return (
    <div>
      <h1 className="text-[46px] leading-tight tracking-[-0.01em] text-ink">Select your vehicle type</h1>
      <p className="mt-3 text-2xl text-muted">Tap the category that matches your vehicle.</p>
      <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {CATEGORIES.map((c) => {
          const Icon = VEHICLE_ICON[c]
          const n = availableFor(c, state).length
          return (
            <button
              key={c}
              onClick={() => onPick(c)}
              className="group flex cursor-pointer flex-col items-center rounded-2xl border-2 border-line bg-white px-4 pt-8 pb-11 text-center transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg hover:shadow-brand/10 focus-visible:border-brand focus-visible:outline-none active:translate-y-0"
            >
              <Icon className="size-16 text-brand" strokeWidth={1.2} />
              <span className="mt-8 text-[28px] text-ink">{c}</span>
              <span className="mt-6 text-lg text-muted">{categoryLocation(slots, c)}</span>
              <span className={cx('mt-5 rounded-lg px-3 py-2.5 text-lg', n ? 'bg-ok-50 text-ok' : 'bg-warn-50 text-warn')}>
                {n ? `${n} space${n === 1 ? '' : 's'} available` : 'Currently full'}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-8 flex gap-3.5 rounded-xl bg-brand-50 px-5 py-5 text-brand">
        <Info className="mt-0.5 size-5 shrink-0" strokeWidth={1.6} />
        <div className="text-[13px] leading-relaxed">
          <div className="text-sm">Only compatible, available spaces can be assigned</div>
          {fmtTime(now())} selection snapshot · {total} available spaces. Reserved, occupied and unavailable spaces are excluded. Your space is claimed safely when you continue.
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
        <Button variant="secondary" size="lg" icon={ArrowLeft} className="h-[78px] px-8 text-[22px]" onClick={onBack}>
          Back to welcome
        </Button>
        <p className="text-lg text-muted">No plate number, name or phone number needed.</p>
      </div>
    </div>
  )
}

function Assigned({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  const claim = useMyClaim()!
  const slots = useStore((s) => s.slots)
  const slot = slots.find((s) => s.id === claim.slotId)!
  const blockSlots = slots.filter((s) => s.block === slot.block).sort((a, b) => a.number - b.number)
  const idx = blockSlots.findIndex((s) => s.id === slot.id)
  const start = Math.max(0, Math.min(idx - 1, blockSlots.length - 4))
  const strip = blockSlots.slice(start, start + 4)
  const col = strip.findIndex((s) => s.id === slot.id)
  const d = directions(slot)
  const cx0 = col * 118.5 + 53
  return (
    <div>
      <div className="text-lg tracking-[0.02em] text-brand uppercase">Your parking location</div>
      <h1 className="mt-6 text-5xl tracking-[-0.01em] text-ink uppercase md:text-[60px]">{slotLabel(slot)}</h1>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Badge tone="warn">Temporarily claimed · Issuing ticket</Badge>
        <span className="text-lg text-muted">{claim.category}</span>
      </div>
      <div className="mt-8 grid gap-7 lg:grid-cols-[510px_1fr]">
        <div className="rounded-2xl border border-line bg-white px-6 pt-6 pb-10">
          <div className="text-lg text-ink">From entrance to Block {slot.block}</div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {strip.map((s) => (
              <div key={s.id} className={cx('grid h-16 place-items-center rounded-lg text-sm', s.id === slot.id ? 'bg-brand text-white' : 'bg-slate-100 text-muted')}>
                {s.id}
              </div>
            ))}
          </div>
          <div className="relative mt-2 h-[78px]">
            <svg viewBox="0 0 462 78" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
              <path d={`M 100 70 H ${cx0} V 10`} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand" />
              <path d={`M ${cx0 - 12} 22 L ${cx0} 9 L ${cx0 + 12} 22`} fill="none" strokeWidth="2.5" stroke="currentColor" className="text-brand" />
              <path d="M 100 70 L 108 62" stroke="currentColor" strokeWidth="2.5" className="text-brand" />
            </svg>
            <div className="absolute top-3 left-0 flex flex-col items-start gap-2 text-brand">
              <LogIn className="size-7" strokeWidth={1.5} />
              <span className="text-xs text-ink">ENTRANCE</span>
            </div>
          </div>
          <p className="mt-5 text-sm text-muted">
            Enter, {d.way}. Use the {ordinal(d.bay)} bay.
          </p>
        </div>
        <div className="rounded-2xl bg-white px-6 py-7">
          <dl className="space-y-5 text-sm">
            {[
              ['Ticket ID', claim.ticketId],
              ['Entry time', fmtLong(claim.at)],
              ['Category', claim.category],
            ].map(([k, v]) => (
              <div key={k} className="flex">
                <dt className="w-[175px] text-muted">{k}</dt>
                <dd className="tabular text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm leading-relaxed text-muted">This compatible space is claimed atomically during ticket issuance. It cannot be assigned to another session.</p>
          <button onClick={onCancel} className="mt-5 cursor-pointer text-sm text-brand underline-offset-4 hover:underline">
            Cancel and release this space
          </button>
        </div>
      </div>
      <Button size="xl" icon={ArrowRight} className="mt-8 w-full" onClick={onContinue}>
        Continue to QR ticket
      </Button>
      <p className="mt-10 text-center text-base text-muted">Your space becomes active / occupied when the ticket is issued.</p>
    </div>
  )
}

function TicketStub({ session }: { session: Session }) {
  const slot = useStore((s) => s.slots.find((x) => x.id === session.slotId))!
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white px-4 pt-7 pb-8 text-center sm:px-7">
      <div className="text-2xl text-ink">Naga Smart Park</div>
      <div className="mt-4 text-[13px] text-muted">Naga City People's Mall · ENTRY TICKET</div>
      <div className="mt-6 flex justify-center">
        <QRCode value={session.ticketId} />
      </div>
      <div className="tabular mt-7 break-all text-lg text-ink">{session.ticketId}</div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-line pt-4 text-base text-ink sm:justify-between">
        <span>{session.category}</span>
        <span className="uppercase">{slotLabel(slot)}</span>
      </div>
      <div className="tabular mt-4 text-sm text-ink">{fmtLong(session.entry)}</div>
      <div className="mt-5 text-[11px] text-muted">Scan at exit terminal · Session identification only</div>
    </div>
  )
}

function Ticket({ session, onDone }: { session: Session; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const slot = useStore((s) => s.slots.find((x) => x.id === session.slotId))!
  const print = async () => {
    setBusy(true)
    const r = await printTicket(ticketJob(session, slot))
    toast(r.ok ? r.message : `${r.message} · Ticket is still active`, r.ok ? 'ok' : 'warn')
    onDone()
  }
  return (
    <div>
      <h1 className="text-[32px] leading-tight tracking-[-0.01em] text-ink sm:text-[46px]">Your parking ticket is ready</h1>
      <p className="mt-3 text-2xl text-muted">Keep this QR ticket. You will need it when exiting the parking area.</p>
      <div className="mt-10 grid min-w-0 grid-cols-1 gap-10 lg:grid-cols-[460px_1fr]">
        <TicketStub session={session} />
        <div className="min-w-0 pt-9">
          <Badge tone="ok">Space secured · {slot.id} occupied</Badge>
          <h2 className="mt-8 text-[32px] text-ink">Print. Keep. Park.</h2>
          <p className="mt-7 text-xl leading-normal text-muted">
            Follow signs to Block {slot.block} and park only in Slot {pad2(slot.number)}. Present this ticket at the exit terminal.
          </p>
          <Button size="xl" icon={Printer} className="mt-6 w-full" onClick={print} disabled={busy}>
            {busy ? 'Sending to printer…' : 'Print parking ticket'}
          </Button>
          <Button size="xl" variant="secondary" className="mt-6 w-full" onClick={onDone} disabled={busy}>
            Done
          </Button>
          <p className="mt-9 text-sm leading-relaxed text-muted">
            The QR identifies your stored session. Exit staff retrieve the authoritative entry time, location, rate version and payment status.
          </p>
        </div>
      </div>
    </div>
  )
}

function Ready({ session, onHome }: { session: Session; onHome: () => void }) {
  const resetSec = useStore((s) => s.settings.welcomeResetSec)
  const slot = useStore((s) => s.slots.find((x) => x.id === session.slotId))!
  const [left, setLeft] = useState(resetSec)
  useEffect(() => {
    const id = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (left <= 0) onHome()
  }, [left, onHome])
  const d = directions(slot)
  return (
    <div className="flex flex-col items-center text-center">
      <div className="grid size-[100px] place-items-center rounded-full bg-ok-50 text-ok">
        <Check className="size-11" strokeWidth={1.4} />
      </div>
      <h1 className="mt-8 text-5xl tracking-[-0.01em] text-ink">You're ready to park.</h1>
      <p className="mt-8 text-2xl text-muted">Keep your QR ticket. You'll need it at the exit.</p>
      <div className="mt-10 flex w-full flex-col items-start gap-4 rounded-2xl border border-line bg-white px-5 py-6 text-left sm:flex-row sm:items-center sm:gap-8 sm:px-9 sm:py-9">
        <MapPin className="size-10 shrink-0 text-brand" strokeWidth={1.4} />
        <div className="min-w-0 flex-1">
          <div className="text-[40px] leading-none text-ink uppercase">{slotLabel(slot)}</div>
          <div className="mt-5 break-words text-lg text-muted">
            {session.category} · {session.ticketId}
          </div>
        </div>
        <Badge tone="ok" className="hidden sm:inline-flex">
          Active · Occupied
        </Badge>
      </div>
      <p className="mt-9 text-[22px] text-ink">
        Enter, {d.way}, then use the {ordinal(d.bay)} bay.
      </p>
      <Button size="xl" icon={House} className="mt-6 w-full max-w-[620px]" onClick={onHome}>
        Return to welcome
      </Button>
      <div className="mt-6 w-full max-w-[620px] rounded-xl bg-brand-50 px-6 py-5">
        <div className="text-base text-brand">Next screen: Welcome</div>
        <div className="tabular mt-1.5 text-sm text-muted">Automatic kiosk reset in {Math.max(0, left)} seconds · Ticket stays active.</div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-brand-100">
          <div className="h-full bg-brand transition-[width] duration-1000 ease-linear" style={{ width: `${(Math.max(0, left) / resetSec) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

function Full({ category, onReview, onHome }: { category: Category; onReview: () => void; onHome: () => void }) {
  const Icon = VEHICLE_ICON[category]
  return (
    <div className="flex flex-col items-center text-center">
      <div className="grid size-[104px] place-items-center rounded-full bg-warn-50 text-warn">
        <Icon className="size-11" strokeWidth={1.3} />
      </div>
      <Badge tone="warn" upper className="mt-6 py-2">
        {category} · No available compatible spaces
      </Badge>
      <h1 className="mt-8 text-5xl tracking-[-0.01em] text-ink">{category} parking is currently full.</h1>
      <p className="mt-8 text-2xl text-muted">No space has been assigned. No ticket has been issued.</p>
      <div className="mt-8 w-full max-w-[800px] rounded-2xl bg-white px-8 py-7">
        <div className="text-lg text-ink">Please wait for a compatible space or return later.</div>
        <p className="mt-3 text-base leading-normal text-muted">
          Occupied, reserved and unavailable bays cannot be assigned. Do not select another category unless it matches your actual vehicle.
        </p>
      </div>
      <div className="mt-7 flex flex-wrap justify-center gap-5">
        <Button size="xl" icon={ArrowLeft} onClick={onReview}>
          Review vehicle category
        </Button>
        <Button size="xl" variant="secondary" onClick={onHome}>
          Return to welcome
        </Button>
      </div>
      <p className="mt-9 text-sm text-muted">Live capacity check · {fmtTime(now())}</p>
    </div>
  )
}

/* ---------- Idle timeout ---------- */

const IDLE_PROMPT_SEC = 15

/** Flags the kiosk idle after `timeoutSec` without touch or key input. */
function useIdle(timeoutSec: number, enabled: boolean, resetKey: string) {
  const [idle, setIdle] = useState(false)
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    setIdle(false)
    if (!enabled) return
    let timer = 0
    const arm = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), timeoutSec * 1000)
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    arm()
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, arm))
    }
  }, [timeoutSec, enabled, resetKey, epoch])
  return { idle, dismiss: () => setEpoch((n) => n + 1) }
}

function IdlePrompt({ screen, slotId, onStay, onExpire }: { screen: Screen; slotId?: string; onStay: () => void; onExpire: () => void }) {
  const [left, setLeft] = useState(IDLE_PROMPT_SEC)
  const expire = useRef(onExpire)
  expire.current = onExpire
  useEffect(() => {
    const id = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (left <= 0) expire.current()
  }, [left])
  const message =
    screen === 'ticket'
      ? 'Your ticket stays active. The kiosk will show your parking location, then return to the welcome screen.'
      : screen === 'assigned' && slotId
        ? `Space ${slotId} will be released and no ticket will be issued.`
        : 'The kiosk will return to the welcome screen for the next driver.'
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/55 px-6 backdrop-blur-[2px] animate-fade-up" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-desc">
      <div className="w-full max-w-[560px] rounded-[28px] bg-white px-10 pt-10 pb-9 text-center shadow-2xl shadow-slate-900/30">
        <div className="mx-auto grid size-[88px] place-items-center rounded-full bg-brand-50 text-brand">
          <Hand className="size-10" strokeWidth={1.4} />
        </div>
        <h2 id="idle-title" className="mt-7 text-[40px] leading-tight tracking-[-0.01em] text-ink">
          Are you still there?
        </h2>
        <p id="idle-desc" className="mt-4 text-xl leading-normal text-muted">
          {message}
        </p>
        <div className="mt-8 flex items-baseline justify-center gap-2 text-brand">
          <span className="tabular text-[64px] leading-none">{Math.max(0, left)}</span>
          <span className="text-lg">seconds</span>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-brand-100">
          <div className="h-full bg-brand transition-[width] duration-1000 ease-linear" style={{ width: `${(Math.max(0, left - 1) / IDLE_PROMPT_SEC) * 100}%` }} />
        </div>
        <Button size="xl" className="mt-8 w-full" onClick={onStay} autoFocus>
          I'm still here
        </Button>
      </div>
    </div>
  )
}
