import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import QR from 'qrcode'
import { Info, LoaderCircle, Lock, X, type LucideIcon } from 'lucide-react'

export type Tone = 'brand' | 'ok' | 'warn' | 'bad' | 'neutral'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'size-9 text-lg rounded-lg', md: 'size-[58px] text-[32px] rounded-xl', lg: 'size-40 text-[110px] rounded-[28px]' }[size]
  return (
    <div className={cx('grid shrink-0 place-items-center bg-brand font-normal leading-none text-white', dims)} aria-hidden>
      P
    </div>
  )
}

const badgeTone: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand',
  ok: 'bg-ok-50 text-ok',
  warn: 'bg-warn-50 text-warn',
  bad: 'bg-bad-50 text-bad',
  neutral: 'bg-slate-100 text-muted',
}
const dotTone: Record<Tone, string> = {
  brand: 'bg-brand',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-muted',
}

export function Badge({ tone = 'brand', dot = true, upper, children, className }: { tone?: Tone; dot?: boolean; upper?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs leading-none whitespace-nowrap', upper && 'uppercase tracking-[0.02em]', badgeTone[tone], className)}>
      {dot && <span className={cx('size-1.5 rounded-full', dotTone[tone])} />}
      {children}
    </span>
  )
}

type Variant = 'primary' | 'secondary' | 'success' | 'muted' | 'soft' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-600 shadow-[0_1px_0_rgba(15,23,42,0.04)]',
  success: 'bg-ok text-white hover:brightness-95',
  secondary: 'bg-white text-brand border border-line hover:border-brand/40 hover:bg-brand-50/40',
  muted: 'bg-slate-100 text-muted border border-line',
  soft: 'bg-brand-50 text-brand hover:bg-brand-100',
  danger: 'bg-white text-bad border border-bad-200 hover:bg-bad-50',
}
const sizes = {
  xl: 'min-h-[64px] px-4 py-3 text-base sm:h-[78px] sm:px-8 sm:text-[22px] rounded-lg gap-3 uppercase tracking-[0.01em] whitespace-normal leading-tight',
  lg: 'h-12 px-6 text-[15px] rounded-lg gap-2.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  sm: 'h-8 px-3 text-[13px] rounded-md gap-1.5',
}

export function Button({
  variant = 'primary',
  size = 'lg',
  icon: Icon,
  children,
  className,
  disabled,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; icon?: LucideIcon }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy}
      onClick={async event => {
        if(busy || !onClick) return
        setBusy(true)
        try { await onClick(event) } catch { /* The API client displays the error; keep the form open. */ }
        finally { setBusy(false) }
      }}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center font-normal whitespace-nowrap transition-[background,border-color,filter,transform] duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed',
        disabled || busy ? variants.muted : variants[variant],
        sizes[size],
        className,
      )}
    >
      {busy ? <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden /> : Icon && <Icon className={size === 'xl' ? 'size-6' : size === 'sm' ? 'size-3.5' : 'size-[18px]'} strokeWidth={1.75} />}
      {children}
    </button>
  )
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section {...rest} className={cx('min-w-0 rounded-2xl border border-line bg-white', className)}>
      {children}
    </section>
  )
}

export function CardHead({ title, sub, right, className }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg leading-tight text-ink">{title}</h2>
        {sub && <p className="mt-1.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

const noteTone: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand',
  ok: 'bg-ok-50 text-ok',
  warn: 'bg-warn-50 text-warn',
  bad: 'bg-bad-50 text-bad',
  neutral: 'bg-slate-100 text-muted',
}
export function Note({ tone = 'brand', icon: Icon = Info, title, children, className }: { tone?: Tone; icon?: LucideIcon; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex gap-3 rounded-xl px-5 py-4', noteTone[tone], className)}>
      <Icon className="mt-px size-5 shrink-0" strokeWidth={1.6} />
      <div className="text-[13px] leading-[1.45]">
        {title && <div className="mb-0.5 text-sm">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function Rows({ rows, labelWidth = 'w-[175px]', className, size = 'md' }: { rows: [ReactNode, ReactNode][]; labelWidth?: string; className?: string; size?: 'sm' | 'md' }) {
  return (
    <dl className={cx(size === 'md' ? 'space-y-[18px] text-sm' : 'space-y-3 text-[13px]', className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex flex-col gap-1 sm:flex-row sm:gap-3">
          <dt className={cx('shrink-0 text-muted', labelWidth)}>{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const circleTone: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand',
  ok: 'bg-ok-50 text-ok',
  warn: 'bg-warn-50 text-warn',
  bad: 'bg-bad-50 text-bad',
  neutral: 'bg-slate-100 text-muted',
}
export function IconCircle({ icon: Icon, tone = 'ok', size = 'md' }: { icon: LucideIcon; tone?: Tone; size?: 'md' | 'lg' }) {
  return (
    <div className={cx('grid place-items-center rounded-full', circleTone[tone], size === 'lg' ? 'size-[104px]' : 'size-16 md:size-20')}>
      <Icon className={size === 'lg' ? 'size-10' : 'size-7'} strokeWidth={1.4} />
    </div>
  )
}

export function Input({ label, hint, locked, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; locked?: boolean }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-2 block text-[13px] text-ink">{label}</span>}
      <span className="relative block">
        <input
          {...rest}
          readOnly={locked || rest.readOnly}
          className={cx(
            'h-12 w-full rounded-lg border border-line px-3.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-brand focus:ring-3 focus:ring-brand/15',
            locked ? 'bg-slate-50 pr-10' : 'bg-white',
          )}
        />
        {locked && <Lock className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />}
      </span>
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Select<T extends string>({ value, onChange, options, className, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; label?: string }) {
  return (
    <label className={cx('relative block', className)}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-11 w-full cursor-pointer appearance-none rounded-lg border border-line bg-white pr-4 pl-10 text-sm text-body outline-none focus:border-brand focus:ring-3 focus:ring-brand/15"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  )
}

/* ---------------- Toasts ---------------- */

type ToastItem = { id: number; text: string; tone: Tone }
let toasts: ToastItem[] = []
const toastListeners = new Set<(t: ToastItem[]) => void>()
export function toast(text: string, tone: Tone = 'neutral') {
  const item = { id: Date.now() + Math.random(), text, tone }
  toasts = [...toasts, item]
  toastListeners.forEach((l) => l(toasts))
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id)
    toastListeners.forEach((l) => l(toasts))
  }, 3200)
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => {
    toastListeners.add(setItems)
    return () => void toastListeners.delete(setItems)
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-2.5 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-xl shadow-slate-900/20 [animation:toast-in_200ms_ease-out]">
          <span className={cx('size-2 rounded-full', t.tone === 'ok' ? 'bg-emerald-400' : t.tone === 'bad' ? 'bg-rose-400' : t.tone === 'warn' ? 'bg-amber-300' : 'bg-sky-300')} />
          {t.text}
        </div>
      ))}
    </div>
  )
}

/* ---------------- Modal ---------------- */

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open) return
    const dialog = ref.current
    const trigger = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (trigger?.isConnected) trigger.focus()
    }
  }, [open])
  if (!open) return null
  // Portal to <body> so animated (transformed) page wrappers can't trap the overlay under sticky headers.
  return createPortal(
      <dialog ref={ref} aria-label={title} onKeyDown={event => {
        if(event.key!=='Tab'||!event.currentTarget.contains(document.activeElement))return
        const fields=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')).filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden')
        const first=fields[0],last=fields.at(-1)
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }} onCancel={event => {event.preventDefault(); onClose()}} onMouseDown={event => {
        if(event.target!==event.currentTarget)return
        const rect=event.currentTarget.getBoundingClientRect()
        if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose()
      }} className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-white p-0 text-ink shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-lg">{title}</h3>
          <button onClick={onClose} className="grid size-8 cursor-pointer place-items-center rounded-md text-muted hover:bg-slate-100" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>}
      </dialog>,
    document.body,
  )
}

/* ---------------- QR-style code ---------------- */

const QUIET = 2

/** Real, scannable QR code rendered as crisp SVG modules. */
export function QRCode({ value, size = 226, color = '#15243b' }: { value: string; size?: number; color?: string }) {
  const path = useMemo(() => {
    const { modules } = QR.create(value, { errorCorrectionLevel: 'M' })
    const n = modules.size
    const d: string[] = []
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.get(y, x)) d.push(`M${x + QUIET} ${y + QUIET}h1v1h-1z`)
    return { d: d.join(''), n: n + QUIET * 2 }
  }, [value])
  return (
    <svg width={size} height={size} className="max-w-full h-auto" viewBox={`0 0 ${path.n} ${path.n}`} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${value}`}>
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill={color} />
    </svg>
  )
}
