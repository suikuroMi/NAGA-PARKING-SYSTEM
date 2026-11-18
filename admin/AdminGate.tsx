import { useEffect, type ReactNode } from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import PinPad, { authMessage } from '../components/PinPad'
import { Logo, toast } from '../components/ui'
import { navigate } from '../lib/router'
import { useStore, verifyAdminPin } from '../store/store'

import { adminSignIn, touchAdmin, useAdminSignedIn } from './adminSession'

/** Requires the administrator PIN before any admin page renders. */
export default function AdminGate({ children }: { children: ReactNode }) {
  const signedIn = useAdminSignedIn()
  useEffect(() => {
    if (!signedIn) return
    const onActivity = () => touchAdmin()
    window.addEventListener('pointerdown', onActivity, { passive: true })
    window.addEventListener('keydown', onActivity)
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [signedIn])
  return signedIn ? <>{children}</> : <AdminSignIn />
}

function AdminSignIn() {
  const lockedUntil = useStore((s) => s.admin.lockedUntil)
  const submit = async (pin: string) => {
    const r = await verifyAdminPin(pin)
    if (!r.ok) return authMessage(r)
    adminSignIn()
    toast('Signed in as administrator', 'ok')
    return null
  }
  return (
    <div className="grid min-h-screen place-items-center bg-navy px-6 py-12">
      <div className="w-full max-w-[460px] animate-fade-up">
        <div className="rounded-[28px] bg-white px-10 pt-10 pb-9 shadow-2xl shadow-slate-950/40">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div>
              <div className="text-lg leading-tight">Naga Smart Park</div>
              <div className="text-[11px] tracking-[0.02em] text-muted uppercase">Administration</div>
            </div>
          </div>
          <div className="mt-8 flex items-center gap-2.5 text-brand">
            <ShieldCheck className="size-5" strokeWidth={1.6} />
            <span className="text-xs tracking-[0.04em] uppercase">Authorized access</span>
          </div>
          <h1 className="mt-3 text-[28px] leading-tight tracking-[-0.01em] text-ink">Administrator sign-in</h1>
          <p className="mt-2 text-sm text-muted">Enter the administrator PIN to open the management console. Attendant PINs do not work here.</p>
          <div className="mt-4 flex justify-center">
            <PinPad disabledUntil={lockedUntil} onSubmit={submit} />
          </div>
          <p className="mt-6 text-xs text-muted">Use the administrator PIN provided during installation.</p>
        </div>
        <button onClick={() => navigate('/')} className="mx-auto mt-6 flex cursor-pointer items-center gap-2 text-sm text-slate-300 hover:text-white">
          <ArrowLeft className="size-4" />
          Back to overview
        </button>
      </div>
    </div>
  )
}
