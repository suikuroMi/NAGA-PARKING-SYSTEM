import { useEffect, useState } from 'react'
import { useStore } from '../store/store'

/** Masked 4-digit administrator PIN input with the shared lockout countdown. */
export default function AdminPinField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const lockedUntil = useStore((s) => s.admin.lockedUntil)
  const [t, setT] = useState(Date.now())
  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => setT(Date.now()), 500)
    return () => clearInterval(id)
  }, [lockedUntil])
  const left = lockedUntil && lockedUntil > t ? Math.ceil((lockedUntil - t) / 1000) : 0
  return (
    <label className="block">
      <span className="mb-2 block text-[13px]">Administrator PIN</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        disabled={left > 0}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="tabular h-11 w-full rounded-lg border border-line bg-white px-3.5 text-lg tracking-[0.3em] outline-none focus:border-brand focus:ring-3 focus:ring-brand/15 disabled:bg-slate-50"
      />
      {left > 0 && (
        <span className="tabular mt-1.5 block text-xs text-warn">
          Too many attempts · try again in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
      )}
    </label>
  )
}

/** Reason picker + note shared by correction and end-session modals. */
export function ReasonFields({ reasons, reason, setReason, note, setNote, name }: { reasons: readonly string[]; reason: string; setReason: (r: string) => void; note: string; setNote: (n: string) => void; name: string }) {
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-[13px]">Reason</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {reasons.map((r) => (
            <label key={r} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] transition ${reason === r ? 'border-brand bg-brand-50 text-brand' : 'border-line hover:border-brand/40'}`}>
              <input type="radio" name={name} value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-brand" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-2 block text-[13px]">Note {reason === 'Other' ? '(required)' : '(optional)'}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/15" />
      </label>
    </>
  )
}
