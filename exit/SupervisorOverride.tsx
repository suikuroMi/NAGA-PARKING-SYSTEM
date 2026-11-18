import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import PinPad, { authMessage } from '../components/PinPad'
import { Modal, Rows, cx, toast } from '../components/ui'
import { navigate } from '../lib/router'
import { reasonError, useStore, voidAndReopen } from '../store/store'
import { EXIT_VOID_REASONS, type Transaction } from '../store/types'
import { fmtPHP, fmtLong } from '../lib/format'
import { paymentTime } from '../store/reporting'

/** Supervisor (administrator PIN) voids a just-made payment and reopens the checkout. */
export default function SupervisorOverride({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const lockedUntil = useStore((s) => s.admin.lockedUntil)
  const sessions = useStore((s) => s.sessions)
  const paid = paymentTime(tx, { sessions })
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')
  const invalid = reasonError(reason, EXIT_VOID_REASONS, note)

  const submit = async (pin: string) => {
    if (invalid) return invalid
    const r = await voidAndReopen(tx.id, reason, note, pin)
    if (!r.ok) return r.error === 'not-allowed' ? r.message : authMessage(r)
    toast('Payment voided · checkout reopened', 'ok')
    onClose()
    navigate(`/exit/payment/${tx.ticketId}`)
    return null
  }

  return (
    <Modal open onClose={onClose} title="Supervisor override">
      <div className="flex items-start gap-3 rounded-xl bg-warn-50 px-4 py-3 text-[13px] text-warn">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.6} />
        Voids this payment and reopens the checkout at the same exit time so it can be redone. Requires the administrator PIN.
      </div>
      <Rows
        size="sm"
        labelWidth="w-[110px]"
        rows={[
          ['Payment', `${fmtPHP(tx.amount, true)} · ${tx.method === 'Digital' ? (tx.provider ?? 'Digital') : 'Cash'}`],
          ['Paid at', `${fmtLong(paid.at)}${paid.source === 'estimated-checkout' ? ' · estimated from checkout' : ''}`],
          ['Transaction', <span className="tabular break-all">{tx.id}</span>],
        ]}
      />
      <fieldset>
        <legend className="mb-2 text-[13px]">Reason</legend>
        <div className="grid gap-2">
          {EXIT_VOID_REASONS.map((r) => (
            <label key={r} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition', reason === r ? 'border-brand bg-brand-50 text-brand' : 'border-line hover:border-brand/40')}>
              <input type="radio" name="void-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-brand" />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      {reason === 'Other' && (
        <label className="block">
          <span className="mb-2 block text-[13px]">Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-line px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/15" placeholder="What went wrong?" />
        </label>
      )}
      <div className={cx('flex flex-col items-center border-t border-line pt-4', invalid && 'opacity-60')}>
        {invalid && <p className="mb-1 text-xs text-muted">{reason ? invalid : 'Choose a reason first'}</p>}
        <PinPad title="Supervisor PIN" subtitle="Administrator PIN required" disabledUntil={lockedUntil} onSubmit={submit} />
      </div>
    </Modal>
  )
}
