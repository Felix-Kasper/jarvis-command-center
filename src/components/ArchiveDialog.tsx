import { useState, type FormEvent } from 'react'
import { ARCHIVE_REASONS, type JobLead } from '../lib/jobs'
import { Modal } from './ui'

interface Props {
  lead: JobLead
  onClose: () => void
  onSave: (reason: string) => Promise<void>
}

export function ArchiveDialog({ lead, onClose, onSave }: Props) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const clean = reason.trim()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!clean || busy) return
    setBusy(true)
    await onSave(clean)
    setBusy(false)
  }

  return (
    <Modal title="Warum ins Archiv?" onClose={onClose}>
      <p className="muted small">
        {lead.company} · {lead.title}
      </p>
      <form className="archive-form" onSubmit={submit}>
        <div className="chips">
          {ARCHIVE_REASONS.map((r) => (
            <button type="button" key={r} className={`chip ${clean === r ? 'active' : ''}`} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Oder eigener Grund" aria-label="Grund" maxLength={200} />
        <button type="submit" className="primary" disabled={!clean || busy}>
          Ins Archiv
        </button>
      </form>
    </Modal>
  )
}
