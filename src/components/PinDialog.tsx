import { useEffect, useState } from 'react'
import { pinLength, tryPin } from '../lib/privacy'
import { Modal } from './ui'

/** PIN-Abfrage für den Depot-Sichtschutz. Prüft automatisch nach 4 Ziffern. */
export function PinDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [len, setLen] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    void pinLength().then((n) => alive && setLen(n))
    return () => {
      alive = false
    }
  }, [])

  const check = async (value: string) => {
    if (busy || !value) return
    setBusy(true)
    const r = await tryPin(value)
    setBusy(false)
    if (r === 'ok') return onUnlocked()
    setPin('')
    setMsg(r === 'gesperrt' ? 'Zu viele Versuche – bitte 30 Sekunden warten.' : r === 'fehlt' ? 'Keine PIN eingerichtet.' : 'Falsche PIN.')
  }

  return (
    <Modal title="Depot entsperren" onClose={onClose}>
      <form
        className="pin-form"
        onSubmit={(e) => {
          e.preventDefault()
          void check(pin)
        }}
      >
        <input
          data-autofocus
          className={`pin-input ${msg ? 'pin-wrong' : ''}`}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={8}
          aria-label="PIN"
          value={pin}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            setPin(v)
            setMsg(null)
            if (len && v.length === len) void check(v)
          }}
        />
        {msg && (
          <p className="error" role="alert">
            {msg}
          </p>
        )}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || !pin}>
            Entsperren
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </form>
    </Modal>
  )
}
