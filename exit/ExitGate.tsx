import { useEffect, useState, type ReactNode } from 'react'
import { KeyRound, Lock, Coffee } from 'lucide-react'
import ExitLayout, { initials } from './ExitLayout'
import PinPad, { authMessage } from '../components/PinPad'
import { Badge, Card, cx, Note, toast, type Tone } from '../components/ui'
import { navigate, useRoute } from '../lib/router'
import { getState, lockExit, setOwnPin, signInExit, TERMINAL, touchExit, unlockExit, useExitAttendant, useExitSession, useStore } from '../store/store'
import { isValidPin, isWeakPin } from '../lib/pin'
import type { Attendant, AttendantStatus } from '../store/types'

const TONE: Record<AttendantStatus, Tone> = { Active: 'ok', 'On break': 'warn', Offline: 'neutral', Pending: 'brand', Disabled: 'bad' }

/**
 * Guards every exit route: sign-in, forced PIN change, and lock screens come
 * before the terminal. Also auto-locks the shared terminal after inactivity.
 */
export default function ExitGate({ children }: { children: ReactNode }) {
  const { params } = useRoute()
  const session = useExitSession()
  const a = useExitAttendant()
  const lockMin = useStore((s) => s.settings.exitLockMin ?? 10)
  const switching = params.get('switch') === '1'
  const active = !!session && !session.locked

  useEffect(() => {
    if (!active) return
    const onActivity = async () => await touchExit()
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    const id = setInterval(async () => {
      const s = getState().exitSession
      if (s && !s.locked && Date.now() - s.lastActive > lockMin * 60000) await lockExit('idle')
    }, 15000)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      clearInterval(id)
    }
  }, [active, lockMin])

  if (!a || !session || switching) return <ExitSignIn switching={switching && !!a} from={params.get('from')} />
  if (a.mustChangePin) return <ExitChangePin attendant={a} />
  if (session.locked) return <ExitLocked attendant={a} reason={session.locked} lockMin={lockMin} />
  return <>{children}</>
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return <div className={cx('grid shrink-0 place-items-center rounded-full bg-brand-50 text-brand', size === 'lg' ? 'size-16 text-xl' : 'size-11 text-sm')}>{initials(name)}</div>
}

function OpenCheckoutNote() {
  const checkout = useStore((s) => s.checkout)
  if (!checkout) return null
  return (
    <Note tone="warn" className="mt-5">
      Checkout for …{checkout.ticketId.slice(-4)} is still open. It continues under whoever signs in.
    </Note>
  )
}


function ExitSignIn({ switching, from }: { switching: boolean; from: string | null }) {
  const attendants = useStore((s) => s.attendants)
  const current = useExitAttendant()
  const checkout = useStore((s) => s.checkout)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = attendants.find((x) => x.id === selectedId) ?? null

  const submit = async (pin: string) => {
    if (!selected) return null
    const r = await signInExit(selected.id, pin)
    if (!r.ok) return authMessage(r)
    toast(`Welcome, ${selected.name.split(' ')[0]}`, 'ok')
    if (switching || from) navigate(from && from.startsWith('/exit') ? from : '/exit')
    return null
  }

  return (
    <ExitLayout bare title={`Sign in to ${TERMINAL.name}`} sub="Choose your name, then enter your 4-digit PIN.">
      {switching && current && (
        <Note tone="warn" className="mb-6" title={`${current.name} is signed in`}>
          Signing in hands over {TERMINAL.name}.{checkout ? ` Checkout …${checkout.ticketId.slice(-4)} stays open.` : ''}{' '}
          <button onClick={() => navigate(from && from.startsWith('/exit') ? from : '/exit')} className="cursor-pointer underline underline-offset-4">
            Back to terminal
          </button>
        </Note>
      )}
      <div className="grid gap-7 lg:grid-cols-[1fr_420px]">
        <Card className="h-fit p-6">
          <div className="text-lg text-ink">Who's signing in?</div>
          <div className="mt-1 text-[13px] text-muted">Exit attendants · {TERMINAL.lane}</div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {attendants.map((x) => {
              const disabled = x.status === 'Disabled'
              const on = x.id === selectedId
              return (
                <button
                  key={x.id}
                  disabled={disabled}
                  onClick={() => setSelectedId(x.id)}
                  aria-pressed={on}
                  className={cx(
                    'flex items-center gap-4 rounded-xl border-2 px-4 py-4 text-left transition',
                    disabled ? 'cursor-not-allowed border-line opacity-50' : on ? 'cursor-pointer border-brand bg-brand-50' : 'cursor-pointer border-line bg-white hover:border-brand/40',
                  )}
                >
                  <Avatar name={x.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] text-ink">{x.name}</div>
                    <div className="mt-1 text-xs text-muted">{x.lane}</div>
                  </div>
                  <Badge tone={TONE[x.status]}>{disabled ? 'Deactivated' : x.id === current?.id ? 'Signed in' : x.status}</Badge>
                </button>
              )
            })}
          </div>
        </Card>
        <div>
          <Card className="flex min-h-[520px] flex-col items-center justify-center px-8 py-9">
            {selected ? (
              <>
                <Avatar name={selected.name} size="lg" />
                <PinPad key={selected.id} className="mt-2" title={selected.name} subtitle={selected.mustChangePin ? 'Enter your temporary PIN' : 'Enter your PIN'} disabledUntil={selected.lockedUntil} onSubmit={submit} />
              </>
            ) : (
              <div className="text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand-50 text-brand">
                  <KeyRound className="size-7" strokeWidth={1.5} />
                </span>
                <div className="mt-5 text-lg text-ink">Select your name</div>
                <p className="mt-2 text-sm text-muted">Your PIN keypad appears here.</p>
              </div>
            )}
          </Card>
          <OpenCheckoutNote />
          <p className="mt-5 text-xs text-muted">Use the PIN assigned by your administrator.</p>
        </div>
      </div>
    </ExitLayout>
  )
}

function ExitChangePin({ attendant }: { attendant: Attendant }) {
  const [first, setFirst] = useState<string | null>(null)
  const submit = async (pin: string) => {
    if (!first) {
      if (!isValidPin(pin) || isWeakPin(pin)) return authMessage({ ok: false, error: 'weak' })
      setFirst(pin)
      return null
    }
    if (pin !== first) {
      setFirst(null)
      return authMessage({ ok: false, error: 'mismatch' })
    }
    const r = await setOwnPin(pin)
    if (!r.ok) {
      setFirst(null)
      return authMessage(r)
    }
    toast('PIN updated · You are signed in', 'ok')
    return null
  }
  return (
    <ExitLayout bare title="Choose your personal PIN" sub={`${attendant.name.split(' ')[0]}, you signed in with a temporary PIN. Set your own 4-digit PIN to continue.`}>
      <div className="mx-auto max-w-[460px]">
        <Card className="flex flex-col items-center px-8 py-9">
          <Avatar name={attendant.name} size="lg" />
          <PinPad className="mt-2" title={first ? 'Confirm your new PIN' : 'Enter a new PIN'} subtitle={first ? 'Enter the same 4 digits again' : 'Avoid 1111, 1234 and your temporary PIN'} onSubmit={submit} />
          <button onClick={() => navigate('/exit?switch=1')} className="mt-6 cursor-pointer text-sm text-brand underline-offset-4 hover:underline">
            Not {attendant.name.split(' ')[0]}? Switch attendant
          </button>
        </Card>
        <OpenCheckoutNote />
      </div>
    </ExitLayout>
  )
}

function ExitLocked({ attendant, reason, lockMin }: { attendant: Attendant; reason: 'idle' | 'manual' | 'break'; lockMin: number }) {
  const first = attendant.name.split(' ')[0]
  const submit = async (pin: string) => {
    const r = await unlockExit(pin)
    if (!r.ok) return authMessage(r)
    if (reason === 'break') toast(`Welcome back, ${first}`, 'ok')
    return null
  }
  const Icon = reason === 'break' ? Coffee : Lock
  const sub = reason === 'break' ? 'Enter your PIN to end your break.' : reason === 'idle' ? `Locked after ${lockMin} minutes without activity.` : 'Locked by the attendant.'
  return (
    <ExitLayout bare title={reason === 'break' ? `${first} is on break` : 'Terminal locked'} sub={sub}>
      <div className="mx-auto max-w-[460px]">
        <Card className="flex flex-col items-center px-8 py-9">
          <div className="relative">
            <Avatar name={attendant.name} size="lg" />
            <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-navy text-white">
              <Icon className="size-3.5" strokeWidth={2} />
            </span>
          </div>
          <PinPad className="mt-2" title={attendant.name} subtitle="Enter your PIN to unlock" disabledUntil={attendant.lockedUntil} onSubmit={submit} />
          <button onClick={() => navigate('/exit?switch=1')} className="mt-6 cursor-pointer text-sm text-brand underline-offset-4 hover:underline">
            Switch attendant
          </button>
        </Card>
        <OpenCheckoutNote />
      </div>
    </ExitLayout>
  )
}
