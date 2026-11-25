import { useState } from 'react'
import AdminPinField, { ReasonFields } from './AdminPinField'
import { authMessage } from '../components/PinPad'
import { Button, Modal, Rows, toast } from '../components/ui'
import { reasonError, refundTransaction, voidTransaction } from '../store/store'
import { netAmount, refundedOf } from '../store/logic'
import { REFUND_REASONS, VOID_REASONS, type Transaction } from '../store/types'
import { fmtPHP } from '../lib/format'

/** Admin void or (partial) refund of a payment; requires the administrator PIN. */
export default function CorrectionModal({ tx, mode, onClose }: { tx: Transaction; mode: 'void' | 'refund'; onClose: () => void }) {
  const remaining = Math.round((tx.amount - refundedOf(tx)) * 100) / 100
  const [amount, setAmount] = useState(remaining.toFixed(2))
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isRefund = mode === 'refund'
  const value = Number(amount)
  const amountOk = !isRefund || (/^\d+(\.\d{1,2})?$/.test(amount) && value > 0 && value <= remaining && value <= 1_000_000)
  const reasons = isRefund ? REFUND_REASONS : VOID_REASONS
  const reasonErr = reasonError(reason, reasons, note)
  const after = isRefund ? Math.max(0, Math.round(netAmount(tx) * 100) - (amountOk ? Math.round(value * 100) : 0)) / 100 : 0
  const ready = amountOk && !reasonErr && pin.length === 4

  const submit = async () => {
    if (!ready) return
    const r = isRefund ? await refundTransaction(tx.id, value, reason, note, pin) : await voidTransaction(tx.id, reason, note, pin)
    setPin('')
    // The PIN field shows the lockout countdown itself.
    if (!r.ok) return setError(r.error === 'not-allowed' ? r.message : r.error === 'locked' ? null : authMessage(r))
    toast(isRefund ? `Refund of ${fmtPHP(value, true)} issued` : `Payment ${tx.id.slice(-4)} voided`, 'ok')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isRefund ? 'Issue refund' : 'Void payment'}
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={isRefund ? 'primary' : 'danger'} size="md" disabled={!ready} onClick={submit}>
            {isRefund ? 'Issue refund' : 'Void payment'}
          </Button>
        </>
      }
    >
      <Rows
        size="sm"
        labelWidth="w-[110px]"
        rows={[
          ['Transaction', <span className="tabular break-all">{tx.id}</span>],
          ['Paid', `${fmtPHP(tx.amount, true)} · ${tx.method === 'Digital' ? (tx.provider ?? 'Digital') : 'Cash'}`],
          ...(refundedOf(tx) ? ([['Already refunded', fmtPHP(refundedOf(tx), true)]] as [string, string][]) : []),
        ]}
      />
      {isRefund && (
        <label className="block">
          <span className="mb-2 block text-[13px]">Refund amount (PHP) · up to {fmtPHP(remaining, true)}</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => (setAmount(e.target.value.replace(/[^\d.]/g, '')), setError(null))}
            className="tabular h-11 w-full rounded-lg border border-line bg-white px-3.5 text-sm outline-none focus:border-brand focus:ring-3 focus:ring-brand/15"
          />
          {!amountOk && <span className="mt-1.5 block text-xs text-bad">Enter an amount between PHP 0.01 and {fmtPHP(remaining, true)}, using at most two decimal places.</span>}
          <span className="mt-1.5 block text-xs text-muted">{tx.method === 'Digital' ? `Return via ${tx.provider ?? 'the digital provider'} to ref ${tx.reference ?? '—'}.` : 'Return cash to the driver.'}</span>
        </label>
      )}
      <ReasonFields name={`${mode}-reason`} reasons={reasons} reason={reason} setReason={(r) => (setReason(r), setError(null))} note={note} setNote={setNote} />
      <div className="rounded-lg bg-canvas px-4 py-3 text-[13px]">
        Net after correction: <span className="tabular text-ink">{fmtPHP(after, true)}</span>
        {!isRefund && <span className="text-muted"> · removed from revenue</span>}
      </div>
      <AdminPinField value={pin} onChange={(v) => (setPin(v), setError(null))} />
      {(error || (reason && reasonErr)) && <p className="text-xs text-bad">{error ?? reasonErr}</p>}
    </Modal>
  )
}
