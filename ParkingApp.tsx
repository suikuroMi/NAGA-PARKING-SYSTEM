import { useEffect, useRef, useState } from 'react'
import { ArrowRight, LayoutDashboard, MonitorSmartphone, RotateCcw, ScanLine, X, Waypoints } from 'lucide-react'
import Kiosk from './kiosk/Kiosk'
import Exit from './exit/Exit'
import Admin from './admin/Admin'
import { cx, Logo, Toaster, toast } from './components/ui'
import { navigate, useRoute } from './lib/router'
import { syncFromBackend, useAuth, useConnection, exitAttendant, resetDemo, useNow, useStore } from './store/store'
import { computeStats } from './store/logic'
import { fmtDay, fmtTime } from './lib/format'

const STATIONS = [
  { key: 'kiosk', href: '/kiosk', label: 'Entrance kiosk', icon: MonitorSmartphone, desc: 'Drivers pick a vehicle type, receive an assigned bay and a QR ticket. No attendant, no plate details.' },
  { key: 'exit', href: '/exit', label: 'Exit terminal', icon: ScanLine, desc: 'Attendants sign in with a PIN, scan the ticket, review the automatic fee, confirm payment and release the space.' },
  { key: 'admin', href: '/admin', label: 'Administration', icon: LayoutDashboard, desc: 'Live facility map, slots, sessions, rates, transactions, reports, staff and settings.' },
] as const

export default function App() {
  const { path, params } = useRoute()
  const connection = useConnection()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const refresh = () => { void syncFromBackend().then(ok => { if(ok) setReady(true) }) }
    refresh()
    const timer = setInterval(refresh, 2500)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])
  if (!ready) return <div className="grid min-h-screen place-items-center bg-canvas p-8"><div className="max-w-md rounded-2xl bg-white p-8"><h1 className="text-2xl">{connection==='offline'?'Parking system unavailable':'Connecting to parking system…'}</h1><p className="mt-4 text-muted">{connection==='offline'?'Check that the parking server and database are running. Reconnecting automatically; no parking action has been saved.':'Loading the facility’s saved records.'}</p><button className="mt-6 text-brand underline" onClick={()=>void syncFromBackend().then(ok=>{if(ok)setReady(true)})}>Retry connection</button></div></div>
  const station = path.startsWith('/kiosk') ? 'kiosk' : path.startsWith('/exit') ? 'exit' : path.startsWith('/admin') ? 'admin' : null
  return (
    <>
      <a href="#main-content" onClick={event=>{event.preventDefault();document.getElementById('main-content')?.focus()}} className="skip-link">Skip to main content</a>
      <div role="status" className={cx('border-b border-line px-6 py-2 text-sm text-ink',connection==='connected'?'bg-ok-50':'bg-warn-50')}>
        {connection==='connected' ? 'Connected · Shared facility records' : 'Connection lost · Actions require server confirmation. Reconnecting…'}
      </div>
      {station === 'kiosk' && <Kiosk />}
      {station === 'exit' && <Exit path={path} />}
      {station === 'admin' && <Admin path={path} params={params} />}
      {!station && <Landing />}
      {station && <StationSwitcher current={station} />}
      <Toaster />
    </>
  )
}

function Landing() {
  const auth = useAuth()
  const state = useStore((s) => s)
  const stats = computeStats(state)
  const onDuty = exitAttendant(state)
  const t = useNow()
  const live: Record<string, string> = {
    kiosk: `${stats.available} spaces available now`,
    exit: state.checkout ? `Checkout open · …${state.checkout.ticketId.slice(-4)}` : onDuty ? `${onDuty.name} on duty · ${stats.active} active sessions` : `Signed out · ${stats.active} active sessions`,
    admin: auth.role==='admin' ? `${stats.completedSessions} completed sessions · PHP ${stats.revenue.toLocaleString()} recorded` : 'Sign in to view reports and manage the facility',
  }
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[1120px] px-6 py-14 md:py-20">
        <div className="flex items-center gap-3.5">
          <Logo />
          <div>
            <div className="text-2xl">Naga Smart Park</div>
            <div className="mt-1 text-sm tracking-[0.02em] text-muted uppercase">Naga City People's Mall</div>
          </div>
        </div>
        <h1 className="mt-14 max-w-[760px] text-[44px] leading-[1.15] tracking-[-0.015em] md:text-[56px]">QR-based parking, from entrance to exit.</h1>
        <p className="mt-6 max-w-[620px] text-lg leading-relaxed text-muted">
          One shared parking facility with {stats.total} spaces. Issue a ticket at the kiosk, check it out at the exit terminal, and watch the administration dashboard update.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STATIONS.map(({ key, href, label, icon: Icon, desc }, i) => (
            <button key={key} onClick={() => navigate(href)} className="group flex cursor-pointer flex-col rounded-2xl border border-line bg-white p-7 text-left transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-xl hover:shadow-brand/5">
              <div className="flex items-center justify-between">
                <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand">
                  <Icon className="size-6" strokeWidth={1.5} />
                </span>
                <span className="tabular text-xs text-faint">0{i + 1}</span>
              </div>
              <div className="mt-7 text-xl">{label}</div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{desc}</p>
              <div className="mt-6 flex items-center justify-between border-t border-line pt-5 text-[13px]">
                <span className="text-ok">{live[key]}</span>
                <ArrowRight className="size-4 text-brand transition group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-white px-7 py-5 text-[13px] text-muted">
          <Waypoints className="size-5 text-brand" strokeWidth={1.5} />
          <span>Try it: open the kiosk and exit terminal in separate tabs, issue a ticket, then scan its QR at the exit.</span>
          <span className="tabular ml-auto">
            Asia/Manila · {fmtDay(t)} · {fmtTime(t)}
          </span>
        </div>
      </div>
    </main>
  )
}

function StationSwitcher({ current }: { current: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if(!open)return
    const items=()=>Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')??[])
    items()[0]?.focus()
    const close=()=>{setOpen(false);trigger.current?.focus()}
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close();return}
      if(event.key==='Tab'){setOpen(false);return}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return
      event.preventDefault()
      const buttons=items(),index=buttons.indexOf(document.activeElement as HTMLButtonElement)
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length
      buttons[next]?.focus()
    }
    const onDown=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)}
    window.addEventListener('keydown',onKey);window.addEventListener('pointerdown',onDown)
    return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('pointerdown',onDown)}
  },[open])
  return (
    <div ref={root} className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div role="menu" aria-label="Switch station" className="w-[260px] rounded-2xl border border-line bg-white p-2 shadow-2xl shadow-slate-900/15 animate-fade-up">
          <div className="flex items-center justify-between px-3 pt-2 pb-3">
            <span className="text-xs tracking-[0.04em] text-muted uppercase">Switch station</span>
            <button role="menuitem" onClick={() => {setOpen(false);trigger.current?.focus()}} className="grid size-11 cursor-pointer place-items-center rounded-md text-muted hover:bg-slate-100" aria-label="Close station menu">
              <X className="size-4" />
            </button>
          </div>
          {STATIONS.map(({ key, href, label, icon: Icon }) => (
            <button
              key={key}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate(href)
              }}
              className={cx('flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition', current === key ? 'bg-brand-50 text-brand' : 'hover:bg-canvas')}
            >
              <Icon className="size-[18px]" strokeWidth={1.6} />
              {label}
            </button>
          ))}

        </div>
      )}
        <button ref={trigger} aria-label="Switch station" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value=>!value)} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] text-white shadow-lg shadow-slate-900/20 transition hover:bg-navy">
          <Waypoints className="size-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Stations</span>
        </button>
    </div>
  )
}
