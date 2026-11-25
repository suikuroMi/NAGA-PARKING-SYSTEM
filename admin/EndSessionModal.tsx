import { useState } from 'react'
import AdminPinField, { ReasonFields } from './AdminPinField'
import { authMessage } from '../components/PinPad'
import { Button, Modal, Note, Rows, toast } from '../components/ui'
import { endSession, quoteFor, reasonError, useNow } from '../store/store'
import { END_REASONS, type Session } from '../store/types'
import { fmtDayShort, fmtDurationShort, fmtPHP, fmtTime } from '../lib/format'

/** Ends a stuck active session without payment (administrator PIN + reason). */
export default function EndSessionModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const t = useNow(10000)
  const q = quoteFor(session, t)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const reasonErr = reasonError(reason, END_REASONS, note)
  const ready = !reasonErr && pin.length === 4

  const submit = async () => {
    const r = await endSession(session.ticketId, reason, note, pin)
    setPin('')
    // The PIN field shows the lockout countdown itself.
    if (!r.ok) return setError(r.error === 'not-allowed' ? r.message : r.error === 'locked' ? null : authMessage(r))
    toast(`Session ended · ${session.slotId} released`, 'ok')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="End session without payment"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="md" disabled={!ready} onClick={submit}>
            End session
          </Button>
        </>
      }
    >
      <Rows
        size="sm"
        labelWidth="w-[110px]"
        rows={[
          ['Ticket', <span className="tabular break-all">{session.ticketId}</span>],
          ['Slot', `${session.category} · ${session.slotId}`],
          ['Entry', `${fmtDayShort(session.entry)} · ${fmtTime(session.entry)}`],
          ['Elapsed', fmtDurationShort(q.minutes)],
          ['Fee so far', fmtPHP(q.total, true)],
        ]}
      />
      <ReasonFields name="end-reason" reasons={END_REASONS} reason={reason} setReason={(r) => (setReason(r), setError(null))} note={note} setNote={setNote} />
      <Note tone="warn">
        {session.slotId} is released now. {fmtPHP(q.total, true)} will be recorded as uncollected.
      </Note>
      <AdminPinField value={pin} onChange={(v) => (setPin(v), setError(null))} />
      {(error || (reason && reasonErr)) && <p className="text-xs text-bad">{error ?? reasonErr}</p>}
    </Modal>
  )
}
