import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, CircleCheck, CircleDot, Coffee, Lock, LogOut, UserRoundCog } from 'lucide-react'
import { Badge, cx, Logo, toast, type Tone } from '../components/ui'
import { navigate } from '../lib/router'
import { lockExit, signOutExit, startBreak, TERMINAL, useExitAttendant, useExitSession, useNow, useStore } from '../store/store'
import { fmtDay, fmtTime } from '../lib/format'

const TABS = ['Exit Dashboard', 'QR Scanner', 'Parking Fee', 'Payment Confirmation', 'Receipt']

export default function ExitLayout({
  stage = 0,
  links = {},
  title,
  sub,
  snapshot = 'brand',
  snapshotLabel,
  bare = false,
  children,
}: {
  stage?: number
  links?: Partial<Record<number, string>>
  title: ReactNode
  sub: ReactNode
  snapshot?: Tone
  snapshotLabel?: string
  /** Gate screens (sign-in, lock): no stage nav and no attendant menu. */
  bare?: boolean
  children: ReactNode
}) {
  const t = useNow()
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-6 lg:px-10">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div>
              <div className="text-lg leading-tight">Naga Smart Park</div>
              <div className="text-[11px] tracking-[0.02em] text-muted uppercase">Naga City People's Mall</div>
            </div>
          </div>
          <Badge upper className="hidden py-1.5 sm:inline-flex">
            Exit operations
          </Badge>
          {bare ? (
            <div className="text-right text-xs text-muted">
              <div className="text-sm text-ink">{TERMINAL.name}</div>
              Exit lane · {TERMINAL.lane}
            </div>
          ) : (
            <AttendantMenu />
          )}
        </div>
      </header>
      {!bare && <nav className="bg-navy">
        <div className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-4 lg:px-8">
          {TABS.map((label, i) => {
            const done = i < stage
            const cur = i === stage
            const href = links[i]
            const Icon = done ? CircleCheck : cur ? CircleDot : Lock
            const clickable = !!href && !cur
            return (
              <button
                key={label}
                disabled={!clickable}
                onClick={() => href && navigate(href)}
                className={cx(
                  'flex h-[66px] shrink-0 items-center gap-2.5 rounded-md px-3 text-sm whitespace-nowrap transition',
                  cur ? 'text-white' : done ? 'text-slate-300' : 'text-slate-500',
                  clickable ? 'cursor-pointer hover:text-white' : 'cursor-default',
                )}
              >
                <Icon className={cx('size-[18px]', cur && 'text-sky-300')} strokeWidth={1.6} />
                {label}
              </button>
            )
          })}
          <span className="ml-auto hidden shrink-0 pl-6 text-xs text-slate-300 xl:block">Later stages unlock after review</span>
        </div>
      </nav>}
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1440px] px-6 pt-7 pb-24 sm:pt-11 lg:px-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[32px] leading-tight tracking-[-0.01em] text-ink">{title}</h1>
            <p className="mt-2 text-[15px] text-muted">{sub}</p>
          </div>
          {!bare && (
            <Badge tone={snapshot} className="py-2">
              {snapshotLabel ?? `${fmtTime(t)} · Live terminal`}
            </Badge>
          )}
        </div>
        <div className="animate-fade-up">{children}</div>
        <footer className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-9 text-xs text-muted">
          <span>Stored session data is authoritative · Fees cannot be overridden</span>
          <span>
            {fmtDay(t)} · Asia/Manila · Exit terminal
          </span>
        </footer>
      </main>
    </div>
  )
}

export const initials = (n: string) =>
  n
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

function AttendantMenu() {
  const a = useExitAttendant()
  const session = useExitSession()
  const checkout = useStore((s) => s.checkout)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus()}
      if(e.key==='Tab'){setOpen(false);return}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return
      const items=Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')??[])
      if(!items.length)return
      e.preventDefault()
      const current=items.indexOf(document.activeElement as HTMLButtonElement)
      const next=e.key==='Home'?0:e.key==='End'?items.length-1:(current+(e.key==='ArrowDown'?1:-1)+items.length)%items.length
      items[next]?.focus()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (!a || !session) return null
  const first = a.name.split(' ')[0]
  const act = (fn: () => void) => () => {
    setOpen(false)
    Promise.resolve(fn()).catch(()=>{})
  }
  const items: { icon: typeof Lock; label: string; hint?: string; disabled?: boolean; onClick: () => void }[] = [
    { icon: Lock, label: 'Lock terminal', onClick: act(async () => (await lockExit('manual'), toast('Terminal locked'))) },
    { icon: Coffee, label: 'Take a break', onClick: act(async () => (await startBreak(), toast(`Break started · ${first}`))) },
    { icon: UserRoundCog, label: 'Switch attendant', onClick: act(() => navigate(`/exit?switch=1&from=${encodeURIComponent(window.location.hash.replace(/^#/, '').split('?')[0] || '/exit')}`)) },
    {
      icon: LogOut,
      label: 'Sign out',
      disabled: !!checkout,
      hint: checkout ? `Complete or cancel checkout …${checkout.ticketId.slice(-4)} first` : undefined,
      onClick: act(async () => {
        if (await signOutExit()) {
          toast('Signed out')
          navigate('/exit')
        }
      }),
    },
  ]
  return (
    <div ref={ref} className="relative">
      <button ref={trigger} aria-label="Attendant account menu" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-canvas">
        <div className="grid size-10 place-items-center rounded-full bg-ok-50 text-[15px] text-ok">{initials(a.name)}</div>
        <div className="hidden sm:block">
          <div className="text-sm">{a.name}</div>
          <div className="text-xs text-muted">Exit attendant · {TERMINAL.name}</div>
        </div>
        <ChevronDown className={cx('size-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute top-full left-0 z-40 mt-2 w-[280px] max-w-[calc(100vw-48px)] rounded-2xl border border-line bg-white p-2 shadow-2xl shadow-slate-900/15 animate-fade-up sm:right-0 sm:left-auto">
          <div className="px-3 pt-2 pb-3 text-xs text-muted">
            Signed in since <span className="tabular text-ink">{fmtTime(session.since)}</span> · {TERMINAL.lane}
          </div>
          {items.map(({ icon: Icon, label, hint, disabled, onClick }) => (
            <button
              key={label}
              role="menuitem"
              disabled={disabled}
              onClick={onClick}
              className="flex w-full cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-canvas disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
            >
              <Icon className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.6} />
              <span>
                {label}
                {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
