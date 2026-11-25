import { useState } from 'react'
import { KeyRound, LogOut, Plus, RefreshCw, Search, UserRoundX, UserRoundCheck } from 'lucide-react'
import AdminLayout from './AdminLayout'
import { Stat } from './widgets'
import { Badge, Button, Card, CardHead, Input, Modal, Rows, Select, toast, type Tone } from '../components/ui'
import { addAttendant, forceSignOutExit, resetAttendantPin, setAttendantDisabled, TERMINAL, updateAttendant, useExitAttendant, useExitSession, useNow, useStore } from '../store/store'
import { isValidPin, randomPin } from '../lib/pin'
import type { Attendant, AttendantStatus } from '../store/types'
import { paymentTime } from '../store/reporting'
import { fmtLong, fmtDay, fmtPHP, fmtTime } from '../lib/format'

const TONE: Record<AttendantStatus, Tone> = { Active: 'ok', 'On break': 'warn', Offline: 'neutral', Pending: 'brand', Disabled: 'bad' }
const statusLabel = (st: AttendantStatus) => (st === 'Disabled' ? 'Deactivated' : st)
const initials = (n: string) =>
  n
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')

export default function AttendantsPage() {
  const attendants = useStore((s) => s.attendants)
  const state = useStore(s=>s)
  const transactions = [...state.transactions].sort((a,b)=>paymentTime(b,state).at-paymentTime(a,state).at)
  const t = useNow()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState<Attendant | null>(null)
  const list = attendants.filter((a) => !q.trim() || `${a.name} ${a.email} ${a.id}`.toLowerCase().includes(q.trim().toLowerCase()))
  const active = useExitAttendant()
  const session = useExitSession()
  const checkout = useStore((s) => s.checkout)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const lanes = new Set(attendants.filter((a) => a.status === 'Active' || a.status === 'On break').map((a) => a.lane))
  const recentPaid = transactions.filter(x=>{const age=t-paymentTime(x,state).at;return age>=0&&age<60*60000}).length
  const lastTx = transactions[0]
  const activeLast = active ? transactions.find((x) => x.attendant === active.name) : undefined
  return (
    <AdminLayout active="attendants" crumb="Attendant operations" title="Attendant accounts" sub={`${fmtDay(t)} · ${fmtTime(t)} · Exit-only staff management`} right={<Badge className="py-2">Exit-only accounts</Badge>}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Active exit attendants" value={attendants.filter((a) => a.status !== 'Pending' && a.status !== 'Disabled').length} note={`${attendants.filter((a) => a.status === 'Active').length} currently signed in`} />
        <Stat label="Exit lanes covered" value={`${lanes.size} / 2`} tone="ok" note={[...lanes].sort().join(' and ') + ' assigned'} />
        <Stat label="Recent payment records" value={recentPaid} note="Last 60 minutes · includes voids" />
        <Stat label="Last payment confirmed" value={lastTx ? fmtTime(paymentTime(lastTx,state).at) : '—'} tone="ok" note={lastTx ? `${lastTx.id}${paymentTime(lastTx,state).source==='estimated-checkout'?' · estimated time':''}` : '—'} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_292px]">
        <Card className="h-fit p-6">
          <CardHead title="Staff table" sub="Exit-only attendants · no entrance attendants assigned" />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <label className="relative w-full max-w-[312px]">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or ID" className="h-10 w-full rounded-lg border border-line bg-canvas pr-3 pl-10 text-sm outline-none placeholder:text-muted focus:border-brand focus:bg-white" />
            </label>
            <Button size="md" icon={Plus} onClick={() => setAdding(true)}>
              Add account
            </Button>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-[13px]">
              <thead className="bg-canvas text-[11px] text-muted">
                <tr>
                  {['Attendant', 'Role', 'Status', 'Exit lane', 'Last access', 'Actions'].map((h) => (
                    <th key={h} className="px-3.5 py-3.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="border-b border-line">
                    <td className="px-3.5 py-3.5">
                      <div className="text-sm">{a.name}</div>
                      <div className="mt-1 text-[11px] text-muted">{a.email}</div>
                    </td>
                    <td className="px-3.5">Exit attendant</td>
                    <td className="px-3.5">
                      <Badge tone={TONE[a.status]} className="py-1.5">
                        {statusLabel(a.status)}
                      </Badge>
                    </td>
                    <td className="px-3.5">{a.lane}</td>
                    <td className="tabular px-3.5">{a.lastAccess ? fmtTime(a.lastAccess) : '—'}</td>
                    <td className="px-3.5">
                      <Button variant="soft" size="sm" onClick={() => setManaging(a)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-6">
            {active && session ? (
              <>
                <CardHead title={`On duty · ${TERMINAL.name}`} sub={`Signed in since ${fmtTime(session.since)} · ${TERMINAL.lane}`} />
                <div className="mt-5 flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-full bg-brand-50 text-brand">{initials(active.name)}</div>
                  <div className="min-w-0">
                    <div className="text-base">{active.name}</div>
                    <div className="truncate text-xs text-muted">{active.email}</div>
                  </div>
                </div>
                <Badge tone={session.locked === 'break' ? 'warn' : session.locked ? 'neutral' : 'ok'} className="mt-4 py-1.5">
                  {session.locked === 'break' ? 'On break' : session.locked ? 'Terminal locked' : active.mustChangePin ? 'Setting personal PIN' : 'Active'}
                </Badge>
                <Rows
                  size="sm"
                  labelWidth="w-[110px]"
                  className="mt-5"
                  rows={[
                    ['Last session', <span className="tabular break-all">{activeLast?.ticketId ?? '—'}</span>],
                    ['Last payment', activeLast ? fmtPHP(activeLast.amount, true) : '—'],
                    ['Last payment at', activeLast ? fmtLong(paymentTime(activeLast,state).at)+(paymentTime(activeLast,state).source==='estimated-checkout'?' (estimated)':'') : '—'],
                    ['Open checkout', checkout ? <span className="tabular">…{checkout.ticketId.slice(-4)}</span> : 'None'],
                  ]}
                />
                <Button variant="danger" size="md" icon={LogOut} className="mt-5 w-full" onClick={() => setConfirmSignOut(true)}>
                  Sign out from terminal
                </Button>
              </>
            ) : (
              <>
                <CardHead title={TERMINAL.name} sub={`Exit terminal · ${TERMINAL.lane}`} />
                <Badge tone="neutral" className="mt-5 py-1.5">
                  Nobody signed in
                </Badge>
                <p className="mt-4 text-[13px] leading-relaxed text-muted">Attendants sign in at the exit terminal with their personal PIN.</p>
              </>
            )}
          </Card>
          <Card className="p-6">
            <CardHead title="Recent activity" sub="Latest exit actions by staff" />
            <ul className="mt-5 space-y-3">
              {transactions.slice(0, 3).map((x) => (
                <li key={x.id} className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-3">
                  <div className="grid size-8 place-items-center rounded-full bg-brand-50 text-[11px] text-brand">{initials(x.attendant)}</div>
                  <div className="flex-1">
                    <div className="text-[13px]">{x.attendant}</div>
                    <div className="text-[11px] text-muted">
                      {fmtLong(paymentTime(x,state).at)} · {attendants.find((a) => a.name === x.attendant)?.lane}
                    </div>
                  </div>
                  <span className="text-xs text-ok">Paid</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <Card className="mt-6 p-6">
        <CardHead title="Role permissions" sub="Exit attendants sign in with a personal PIN, review session details, confirm received payments, and reprint receipts. They cannot change rates or override fees." />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[
            ['Exit attendant', 'bg-ok', ['Sign in with a personal 4-digit PIN', 'Scan QR or enter ticket ID', 'Review session details', 'Confirm received payment', 'Reprint receipts']],
            ['Restricted actions', 'bg-bad', ['Change configured parking rates', 'Arbitrarily override calculated fees', 'Charge paid tickets again', 'Manage entrance access or plate records']],
          ].map(([title, dot, items]) => (
            <div key={title as string} className="rounded-xl bg-canvas p-5">
              <div className="text-base">{title as string}</div>
              <ul className="mt-4 space-y-3 text-[13px]">
                {(items as string[]).map((i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className={`size-1.5 rounded-full ${dot}`} />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
      <AddAttendant open={adding} onClose={() => setAdding(false)} />
      <ManageAttendant key={managing?.id ?? 'none'} id={managing?.id ?? null} onClose={() => setManaging(null)} />
      <Modal
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out from terminal?"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setConfirmSignOut(false)}>
              Cancel
            </Button>
            <Button
              size="md"
              onClick={async () => {
                await forceSignOutExit()
                setConfirmSignOut(false)
                toast(`${active?.name ?? 'Attendant'} signed out of ${TERMINAL.name}`, 'ok')
              }}
            >
              Sign out
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {active?.name} will be signed out of {TERMINAL.name}.{checkout ? ` Checkout …${checkout.ticketId.slice(-4)} stays open for the next attendant.` : ''}
        </p>
      </Modal>
    </AdminLayout>
  )
}

function TempPinField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-2 block text-[13px]">Temporary PIN</span>
      <div className="flex gap-2.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          aria-label="Temporary PIN"
          className="tabular h-12 w-full rounded-lg border border-line bg-white px-3.5 text-lg tracking-[0.3em] outline-none focus:border-brand focus:ring-3 focus:ring-brand/15"
        />
        <Button variant="secondary" size="lg" icon={RefreshCw} onClick={() => onChange(randomPin())}>
          Generate
        </Button>
      </div>
      {value && !isValidPin(value) && <span className="mt-1.5 block text-xs text-bad">Enter exactly 4 digits.</span>}
    </div>
  )
}

function AddAttendant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [lane, setLane] = useState<'Lane A' | 'Lane B'>('Lane A')
  const [tempPin, setTempPin] = useState(randomPin)
  const valid = name.trim().length > 2 && /^\S+@\S+\.\S+$/.test(email) && isValidPin(tempPin)
  const close = () => {
    setName('')
    setEmail('')
    setTempPin(randomPin())
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Add exit attendant"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={close}>
            Cancel
          </Button>
          <Button
            size="md"
            disabled={!valid}
            onClick={async () => {
              await addAttendant({ name: name.trim(), email: email.trim(), lane, tempPin })
              toast(`Account created · temporary PIN ${tempPin}`, 'ok')
              close()
            }}
          >
            Create account
          </Button>
        </>
      }
    >
      <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Liza Bautista" autoFocus />
      <Input label="Work email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@nsp.gov" />
      <div>
        <span className="mb-2 block text-[13px]">Exit lane</span>
        <Select label="Exit lane" value={lane} onChange={setLane} options={[{ value: 'Lane A', label: 'Lane A' }, { value: 'Lane B', label: 'Lane B' }]} />
      </div>
      <TempPinField value={tempPin} onChange={setTempPin} />
      <p className="text-xs text-muted">Share this PIN with the attendant. They'll choose their own PIN at first sign-in. New accounts start as Pending with exit-only permissions.</p>
    </Modal>
  )
}

function ManageAttendant({ id, onClose }: { id: string | null; onClose: () => void }) {
  const a = useStore((s) => s.attendants.find((x) => x.id === id) ?? null)
  const signedInId = useExitAttendant()?.id
  const [lane, setLane] = useState<'Lane A' | 'Lane B'>(a?.lane ?? 'Lane A')
  const [tempPin, setTempPin] = useState(randomPin)
  const [confirmDisable, setConfirmDisable] = useState(false)
  if (!a) return null
  const disabled = a.status === 'Disabled'
  const signedIn = signedInId === a.id
  return (
    <Modal
      open={!!a}
      onClose={onClose}
      title={`Manage ${a.name}`}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
          <Button
            size="md"
            disabled={lane === a.lane}
            onClick={async () => {
              await updateAttendant(a.id, { lane })
              toast(`${a.name} · ${lane}`, 'ok')
              onClose()
            }}
          >
            Save lane
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-between rounded-lg bg-canvas px-4 py-3 text-sm">
        <span className="text-muted">Status</span>
        <Badge tone={TONE[a.status]}>
          {statusLabel(a.status)}
          {signedIn ? ` · signed in at ${TERMINAL.name}` : ''}
        </Badge>
      </div>
      <div>
        <span className="mb-2 block text-[13px]">Exit lane</span>
        <Select label="Exit lane" value={lane} onChange={setLane} options={[{ value: 'Lane A', label: 'Lane A' }, { value: 'Lane B', label: 'Lane B' }]} />
      </div>
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-center gap-2 text-sm">
          <KeyRound className="size-4 text-brand" strokeWidth={1.6} />
          Reset PIN
        </div>
        <p className="mt-1 mb-3 text-xs text-muted">Sets a temporary PIN. {a.name.split(' ')[0]} must choose a new PIN at the next sign-in{signedIn ? ' (immediately, since they are signed in)' : ''}.</p>
        <TempPinField value={tempPin} onChange={setTempPin} />
        <Button
          variant="soft"
          size="md"
          className="mt-3 w-full"
          disabled={!isValidPin(tempPin)}
          onClick={async () => {
            if (await resetAttendantPin(a.id, tempPin)) toast(`PIN reset · temporary PIN ${tempPin}`, 'ok')
            setTempPin(randomPin())
          }}
        >
          Reset PIN
        </Button>
      </div>
      {confirmDisable ? (
        <div className="rounded-xl bg-bad-50 p-4 text-sm text-bad">
          <div>Deactivate {a.name}?</div>
          <p className="mt-1 text-xs">{signedIn ? `They are signed in now and will be signed out of ${TERMINAL.name}. ` : ''}They won't be able to sign in until reactivated.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDisable(false)}>
              Keep active
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await setAttendantDisabled(a.id, true)
                setConfirmDisable(false)
                toast(`${a.name} deactivated`)
              }}
            >
              Deactivate
            </Button>
          </div>
        </div>
      ) : disabled ? (
        <Button
          variant="secondary"
          size="md"
          icon={UserRoundCheck}
          onClick={async () => {
            await setAttendantDisabled(a.id, false)
            toast(`${a.name} reactivated`, 'ok')
          }}
        >
          Reactivate account
        </Button>
      ) : (
        <Button variant="danger" size="md" icon={UserRoundX} onClick={() => setConfirmDisable(true)}>
          Deactivate account
        </Button>
      )}
      <p className="text-xs text-muted">Role is fixed to Exit attendant. Permissions cannot include rate editing or fee overrides.</p>
    </Modal>
  )
}
