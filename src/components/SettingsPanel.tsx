import { useRef, useState } from 'react'
import type { LeisureBlock, Settings } from '../types'
import { store, type AppState } from '../lib/store'
import { syncConfigured } from '../lib/supabase'
import { parseBackup } from '../lib/backup'
import { downloadBackup } from '../lib/download'
import { isValidDateStr, isValidTimeStr, relativeDay, toDateStr } from '../lib/time'
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../lib/defaults'
import { newId } from '../lib/validate'
import { changePin } from '../lib/privacy'
import { Modal } from './ui'

export function SettingsPanel({ state, today, onClose, notify }: { state: AppState; today: string; onClose: () => void; notify: (t: string) => void }) {
  return (
    <Modal title="Einstellungen" onClose={onClose} wide>
      <SyncSection state={state} notify={notify} />
      <BackupSection state={state} today={today} notify={notify} />
      <TimesSection settings={state.settings} notify={notify} />
      <LeisureSection settings={state.settings} today={today} notify={notify} />
      <CategorySection state={state} notify={notify} />
      {syncConfigured && state.sync.email && <DepotPinSection notify={notify} />}
      <section className="settings-section">
        <h4>Gerät</h4>
        <button
          className="danger-ghost"
          onClick={() => {
            if (confirm('Wirklich alle lokalen Daten auf diesem Gerät löschen?')) {
              store.snapshot(true)
              store.clearLocal()
              notify('Lokale Daten gelöscht (Sicherungspunkt wurde angelegt).')
            }
          }}
        >
          Lokale Daten löschen
        </button>
      </section>
    </Modal>
  )
}

function SyncSection({ state, notify }: { state: AppState; notify: (t: string) => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const s = state.sync

  if (!syncConfigured) {
    return (
      <section className="settings-section">
        <h4>Synchronisation</h4>
        <div className="banner banner-warn">
          <div>
            <strong>Lokaler Modus:</strong> Daten liegen nur in diesem Browser. Geräteübergreifender Sync wird aktiv, sobald Supabase eingerichtet ist (siehe README, Abschnitt „Sync einrichten“).
          </div>
        </div>
      </section>
    )
  }

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    setMsg(null)
    const err = await fn()
    setBusy(false)
    if (err) setMsg(err)
    else notify('Angemeldet.')
  }

  return (
    <section className="settings-section">
      <h4>Synchronisation</h4>
      {s.email ? (
        <>
          <p>
            Angemeldet als <strong>{s.email}</strong>
          </p>
          <p className="muted small">
            Status: {s.state}
            {s.lastSyncAt && ` · zuletzt ${new Date(s.lastSyncAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
            {s.pendingCount > 0 && ` · ${s.pendingCount} Änderungen warten`}
          </p>
          {s.message && <p className="error">{s.message}</p>}
          <div className="row">
            <button className="secondary" onClick={() => void store.sync()}>
              Jetzt synchronisieren
            </button>
            <button className="ghost" onClick={() => void store.signOut()}>
              Abmelden
            </button>
          </div>
        </>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => store.signIn(email, pw))
          }}
        >
          <label className="field">
            <span>E-Mail</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Passwort</span>
            <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          {msg && <p className="error">{msg}</p>}
          <div className="row">
            <button type="submit" className="primary" disabled={busy || !email || pw.length < 8}>
              Anmelden
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function BackupSection({ state, today, notify }: { state: AppState; today: string; notify: (t: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const snapshots = store.listSnapshots()

  const download = () => {
    downloadBackup()
    notify('Backup heruntergeladen.')
  }

  const restoreFile = async (file: File) => {
    const parsed = parseBackup(await file.text())
    if (!parsed.ok) {
      notify(parsed.error)
      return
    }
    const n = parsed.backup.records.filter((r) => !r.deleted && r.kind === 'task').length
    if (!confirm(`Backup vom ${new Date(parsed.backup.exportedAt).toLocaleString('de-DE')} mit ${n} Aufgaben wiederherstellen? Aktuelle Daten werden ersetzt (vorher wird ein Sicherungspunkt angelegt).`)) return
    store.restoreRecords(parsed.backup.records)
    notify('Backup wiederhergestellt.')
  }

  return (
    <section className="settings-section">
      <h4>Backup & Wiederherstellung</h4>
      <p className="muted small">
        Letztes Backup: {state.lastExport ? relativeDay(toDateStr(new Date(state.lastExport)), today) : 'noch keins'}
      </p>
      <div className="row">
        <button className="secondary" onClick={download}>
          Backup herunterladen
        </button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>
          Backup wiederherstellen …
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void restoreFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {snapshots.length > 0 && (
        <>
          <p className="muted small">Sicherungspunkte</p>
          <ul className="snapshots">
            {snapshots.map((s) => (
              <li key={s.createdAt}>
                <span>
                  {new Date(s.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · {s.records.filter((r) => r.kind === 'task' && !r.deleted).length} Aufgaben
                </span>
                <button
                  className="chip"
                  onClick={() => {
                    if (confirm('Diesen Sicherungspunkt wiederherstellen? Aktuelle Daten werden ersetzt.')) {
                      store.restoreRecords(s.records)
                      notify('Sicherungspunkt wiederhergestellt.')
                    }
                  }}
                >
                  Wiederherstellen
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const TIME_FIELDS: { key: keyof Settings; label: string }[] = [
  { key: 'wake', label: 'Aufstehen' },
  { key: 'workStart', label: 'Arbeitsbeginn' },
  { key: 'workEnd', label: 'Feierabend' },
  { key: 'lunchStart', label: 'Mittag von' },
  { key: 'lunchEnd', label: 'Mittag bis' },
  { key: 'sleep', label: 'Schlafen' },
  { key: 'latestExtendedEnd', label: 'Spätestes Ende bei Freigabe' },
]

function TimesSection({ settings, notify }: { settings: Settings; notify: (t: string) => void }) {
  const [draft, setDraft] = useState<Settings>(settings)
  const [error, setError] = useState<string | null>(null)
  const save = () => {
    for (const f of TIME_FIELDS) if (!isValidTimeStr(draft[f.key])) return setError(`Ungültige Uhrzeit bei „${f.label}“.`)
    if (!(draft.wake <= draft.workStart && draft.workStart < draft.workEnd && draft.workEnd <= draft.sleep)) return setError('Reihenfolge prüfen: Aufstehen ≤ Arbeitsbeginn < Feierabend ≤ Schlafen.')
    if (draft.lunchStart >= draft.lunchEnd) return setError('Mittagspause: Beginn muss vor Ende liegen.')
    if (draft.latestExtendedEnd > draft.sleep) return setError('Das späteste Ende darf nicht nach der Schlafenszeit liegen.')
    if (draft.focusMaxMin < 25 || draft.focusMaxMin > 240 || draft.breakMin < 5 || draft.breakMin > 60) return setError('Fokus 25–240 min, Pause 5–60 min.')
    setError(null)
    store.setSettings(draft)
    notify('Einstellungen gespeichert.')
  }
  return (
    <section className="settings-section">
      <h4>Tagesrhythmus</h4>
      <div className="grid-3">
        {TIME_FIELDS.map((f) => (
          <label className="field" key={f.key}>
            <span>{f.label}</span>
            <input type="time" value={draft[f.key] as string} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
          </label>
        ))}
        <label className="field">
          <span>Max. am Stück (min)</span>
          <input type="number" value={draft.focusMaxMin} onChange={(e) => setDraft({ ...draft, focusMaxMin: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Pause (min)</span>
          <input type="number" value={draft.breakMin} onChange={(e) => setDraft({ ...draft, breakMin: Number(e.target.value) })} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={draft.weekendLocked} onChange={(e) => setDraft({ ...draft, weekendLocked: e.target.checked })} />
        Wochenenden standardmäßig sperren
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="primary" onClick={save}>
          Speichern
        </button>
        <button className="ghost" onClick={() => setDraft({ ...DEFAULT_SETTINGS, categories: draft.categories, leisureBlocks: draft.leisureBlocks })}>
          Standard
        </button>
      </div>
    </section>
  )
}

function DepotPinSection({ notify }: { notify: (t: string) => void }) {
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (newPin !== repeat) return setError('Die neue PIN stimmt nicht überein.')
    setBusy(true)
    try {
      const r = await changePin(oldPin, newPin)
      const msg: Record<string, string> = {
        falsch: 'Aktuelle PIN ist falsch.',
        gesperrt: 'Zu viele Versuche – bitte 30 Sekunden warten.',
        fehlt: 'Nicht angemeldet.',
        ungueltig: 'Neue PIN: 4–8 Ziffern.',
      }
      if (r !== 'ok') return setError(msg[r])
      setError(null)
      setOldPin('')
      setNewPin('')
      setRepeat('')
      notify('Depot-PIN geändert.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const pinInput = (label: string, value: string, set: (v: string) => void) => (
    <label className="field">
      <span>{label}</span>
      <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={value} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} />
    </label>
  )
  return (
    <section className="settings-section">
      <h4>Depot-PIN</h4>
      <div className="grid-3">
        {pinInput('Aktuelle PIN', oldPin, setOldPin)}
        {pinInput('Neue PIN (4–8 Ziffern)', newPin, setNewPin)}
        {pinInput('Neue PIN wiederholen', repeat, setRepeat)}
      </div>
      <div className="row">
        <button className="secondary" disabled={busy || !newPin} onClick={() => void save()}>
          PIN ändern
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const FOREVER = '2099-12-31'

function LeisureSection({ settings, today, notify }: { settings: Settings; today: string; notify: (t: string) => void }) {
  const [draft, setDraft] = useState<LeisureBlock>({ id: '', title: '', fromDate: today, toDate: today, start: '19:00', end: '21:00', weekdays: [], kind: 'freizeit' })
  const [error, setError] = useState<string | null>(null)
  const recurring = (draft.weekdays ?? []).length > 0
  const toggleDay = (d: number) => {
    const cur = draft.weekdays ?? []
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()
    // Wiederkehrend ohne Enddatum = unbefristet
    setDraft({ ...draft, weekdays: next, toDate: next.length && draft.toDate === draft.fromDate ? FOREVER : !next.length && draft.toDate === FOREVER ? draft.fromDate : draft.toDate })
  }
  const add = () => {
    if (!draft.title.trim()) return setError('Bitte einen Titel eingeben.')
    if (!isValidDateStr(draft.fromDate) || !isValidDateStr(draft.toDate) || draft.fromDate > draft.toDate) return setError('Zeitraum prüfen.')
    if (!isValidTimeStr(draft.start) || !isValidTimeStr(draft.end) || draft.start >= draft.end) return setError('Uhrzeiten prüfen.')
    setError(null)
    const block: LeisureBlock = { ...draft, id: newId(), title: draft.title.trim() }
    if (!block.weekdays?.length) delete block.weekdays
    if (block.kind !== 'puffer') delete block.kind
    store.setSettings({ ...settings, leisureBlocks: [...settings.leisureBlocks, block] })
    setDraft({ ...draft, title: '' })
    notify('Freizeitblock gespeichert.')
  }
  return (
    <section className="settings-section">
      <h4>Geschützte Freizeitblöcke</h4>
      <ul className="snapshots">
        {settings.leisureBlocks.map((b) => (
          <li key={b.id}>
            <span>
              <strong>{b.title}</strong>
              {b.kind === 'puffer' ? ' (Puffer)' : ''} · {b.weekdays?.length ? `jeden ${b.weekdays.map((d) => WD_SHORT[d]).join(', ')}` : ''}
              {b.weekdays?.length ? (b.toDate >= FOREVER ? ` · ab ${b.fromDate}` : ` · ${b.fromDate} bis ${b.toDate}`) : `${b.fromDate} bis ${b.toDate}`} · {b.start}–{b.end}
            </span>
            <button className="chip" onClick={() => store.setSettings({ ...settings, leisureBlocks: settings.leisureBlocks.filter((x) => x.id !== b.id) })}>
              Entfernen
            </button>
          </li>
        ))}
      </ul>
      <div className="grid-3">
        <label className="field">
          <span>Titel</span>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="z. B. Filmabend" />
        </label>
        <label className="field">
          <span>Von</span>
          <input type="date" value={draft.fromDate} onChange={(e) => setDraft({ ...draft, fromDate: e.target.value })} />
        </label>
        <label className="field">
          <span>Bis{recurring ? ' (leer = unbefristet)' : ''}</span>
          <input type="date" value={draft.toDate >= FOREVER ? '' : draft.toDate} onChange={(e) => setDraft({ ...draft, toDate: e.target.value || (recurring ? FOREVER : draft.fromDate) })} />
        </label>
        <label className="field">
          <span>Beginn</span>
          <input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
        </label>
        <label className="field">
          <span>Ende</span>
          <input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
        </label>
        <div className="field">
          <span>&nbsp;</span>
          <button className="secondary" onClick={add}>
            Hinzufügen
          </button>
        </div>
      </div>
      <div className="row leisure-opts">
        <span className="muted small">Wöchentlich:</span>
        <div className="chips">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} type="button" className={`chip ${draft.weekdays?.includes(d) ? 'active' : ''}`} aria-pressed={!!draft.weekdays?.includes(d)} onClick={() => toggleDay(d)}>
              {WD_SHORT[d]}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={draft.kind === 'puffer'} onChange={(e) => setDraft({ ...draft, kind: e.target.checked ? 'puffer' : 'freizeit' })} />
          <span>Puffer (nur bei Überhang verplanen)</span>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function CategorySection({ state, notify }: { state: AppState; notify: (t: string) => void }) {
  const [name, setName] = useState('')
  const { settings, tasks } = state
  const add = () => {
    const n = name.trim()
    if (!n || n.length > 40 || settings.categories.includes(n)) return
    store.setSettings({ ...settings, categories: [...settings.categories, n] })
    setName('')
    notify('Kategorie hinzugefügt.')
  }
  return (
    <section className="settings-section">
      <h4>Kategorien</h4>
      <div className="chips">
        {settings.categories.map((c) => {
          const inUse = tasks.some((t) => t.category === c)
          const removable = !DEFAULT_CATEGORIES.includes(c) && !inUse
          return (
            <span key={c} className="chip static">
              {c}
              {removable && (
                <button className="link-btn" aria-label={`${c} entfernen`} onClick={() => store.setSettings({ ...settings, categories: settings.categories.filter((x) => x !== c) })}>
                  ✕
                </button>
              )}
            </span>
          )
        })}
      </div>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Neue Kategorie" maxLength={40} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="secondary" onClick={add}>
          Hinzufügen
        </button>
      </div>
    </section>
  )
}
