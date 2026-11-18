import { useEffect, useRef, useState } from 'react'
import { Delete } from 'lucide-react'
import { cx } from './ui'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const

/**
 * Four-digit PIN entry with an on-screen keypad and keyboard support.
 * `onSubmit` runs on the fourth digit and returns an error message, or null on success.
 */
export default function PinPad({ title, subtitle, disabledUntil, onSubmit, className }: { title?: string; subtitle?: string; disabledUntil?: number; onSubmit: (pin: string) => string | null | Promise<string | null>; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [t, setT] = useState(Date.now())
  const locked = !!disabledUntil && disabledUntil > t
  const submit = useRef(onSubmit)
  submit.current = onSubmit

  useEffect(() => {
    if (!disabledUntil) return
    const id = setInterval(() => setT(Date.now()), 500)
    return () => clearInterval(id)
  }, [disabledUntil])

  const press = (k: (typeof KEYS)[number]) => {
    if (locked || busy) return
    if (k === 'clear') return setPin('')
    if (k === 'back') return setPin((p) => p.slice(0, -1))
    setError(null)
    setPin((p) => (p.length >= 4 ? p : p + k))
  }

  useEffect(() => {
    if (pin.length !== 4) return
    setBusy(true)
    Promise.resolve(submit.current(pin)).then(err => {
      if (err) { setError(err); setShake(n => n + 1) }
    }).catch(err => setError(err instanceof Error ? err.message : 'Unable to sign in. Try again.'))
      .finally(() => { setPin(''); setBusy(false) })
  }, [pin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      if (/^\d$/.test(e.key)) press(e.key as (typeof KEYS)[number])
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Escape') press('clear')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const left = locked ? Math.ceil((disabledUntil! - t) / 1000) : 0
  return (
    <div className={cx('w-full max-w-[340px]', className)}>
      {title && <div className="text-center text-xl text-ink">{title}</div>}
      {subtitle && <div className="mt-1.5 text-center text-sm text-muted">{subtitle}</div>}
      <div key={shake} className={cx('mt-6 flex justify-center gap-4', shake > 0 && 'animate-shake')} aria-live="polite" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx('size-4 rounded-full border-2 transition', i < pin.length ? 'border-brand bg-brand' : error ? 'border-bad' : 'border-slate-300')} />
        ))}
      </div>
      <div className="mt-3 min-h-5 text-center text-[13px]" aria-live="assertive">
        {locked ? (
          <span className="tabular text-warn">
            Too many attempts · try again in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
          </span>
        ) : (
          error && <span className="text-bad">{error}</span>
        )}
      </div>
      <div role="group" aria-label="PIN keypad" className="mt-3 grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={locked || busy}
            onClick={() => press(k)}
            aria-label={k === 'back' ? 'Delete last digit' : k === 'clear' ? 'Clear PIN' : k}
            className={cx(
              'grid h-16 cursor-pointer place-items-center rounded-xl border border-line bg-white transition select-none hover:border-brand/50 active:translate-y-px active:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40',
              /\d/.test(k) ? 'tabular text-2xl text-ink' : 'text-sm text-muted',
            )}
          >
            {k === 'back' ? <Delete className="size-5" strokeWidth={1.6} /> : k === 'clear' ? 'Clear' : k}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Maps a store AuthResult to PinPad copy. */
export function authMessage(r: { ok: boolean; error?: string; attemptsLeft?: number }): string | null {
  if (r.ok) return null
  switch (r.error) {
    case 'locked':
      return 'Too many attempts. Sign-in is locked for 60 seconds.'
    case 'disabled':
      return 'This account has been deactivated.'
    case 'weak':
      return 'Choose a less predictable PIN (no 1111 or 1234).'
    case 'same':
      return 'Choose a PIN different from your temporary PIN.'
    case 'mismatch':
      return "PINs don't match. Try again."
    default:
      return r.attemptsLeft != null ? `Incorrect PIN · ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left` : 'Incorrect PIN'
  }
}
