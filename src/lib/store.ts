// Datenspeicher: lokal im Browser (sofort, offline-fähig) + Synchronisation mit Supabase.

import { useSyncExternalStore } from 'react'
import type { DayGoals, DayOverride, RecordKind, Settings, StoredRecord, SyncInfo, Task } from '../types'
import { DEFAULT_SETTINGS } from './defaults'
import { fromRow, mergeRemote, toRow, validateRecord, type RemoteRow } from './sync'
import { makeBackup, type BackupFile } from './backup'
import { normalizeTask } from './validate'
import { supabase, syncConfigured } from './supabase'
import { toDateStr } from './time'

const LS_RECORDS = 'jarvis:v1:records'
const LS_PENDING = 'jarvis:v1:pending'
const LS_LASTPULL = 'jarvis:v1:lastPull'
const LS_SNAPSHOTS = 'jarvis:v1:snapshots'
const LS_LASTEXPORT = 'jarvis:v1:lastExport'
const MAX_SNAPSHOTS = 7

export interface AppState {
  tasks: Task[]
  settings: Settings
  goals: Record<string, DayGoals>
  days: Record<string, DayOverride>
  sync: SyncInfo
  storageOk: boolean
  lastExport?: string
}

export interface Snapshot {
  date: string
  createdAt: string
  records: StoredRecord[]
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

class JarvisStore {
  private records = new Map<string, StoredRecord>()
  private pending = new Set<string>()
  private listeners = new Set<() => void>()
  private syncInfo: SyncInfo = { state: syncConfigured ? 'abgemeldet' : 'lokal', pendingCount: 0 }
  private storageOk = true
  private syncing = false
  private syncAgain = false
  private syncTimer: ReturnType<typeof setTimeout> | undefined
  private state: AppState

  constructor() {
    this.load()
    this.state = this.buildState()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getState = () => this.state

  private emit() {
    this.state = this.buildState()
    this.listeners.forEach((fn) => fn())
  }

  private buildState(): AppState {
    const tasks: Task[] = []
    const goals: Record<string, DayGoals> = {}
    const days: Record<string, DayOverride> = {}
    let settings: Settings = DEFAULT_SETTINGS
    for (const r of this.records.values()) {
      if (r.deleted) continue
      if (r.kind === 'task') tasks.push(normalizeTask(r.data as Task))
      else if (r.kind === 'goals') {
        const g = r.data as DayGoals
        goals[g.date] = g
      } else if (r.kind === 'day') {
        const d = r.data as DayOverride
        days[d.date] = d
      } else if (r.kind === 'settings') settings = { ...DEFAULT_SETTINGS, ...(r.data as Partial<Settings>) }
    }
    tasks.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    return {
      tasks,
      goals,
      days,
      settings,
      sync: { ...this.syncInfo, pendingCount: this.pending.size },
      storageOk: this.storageOk,
      lastExport: lsGet(LS_LASTEXPORT) ?? undefined,
    }
  }

  // ---------- lokale Persistenz ----------

  private load() {
    const raw = lsGet(LS_RECORDS)
    if (raw === null) {
      // Prüfen, ob localStorage überhaupt verfügbar ist
      this.storageOk = lsSet('jarvis:v1:probe', '1')
      return
    }
    try {
      const arr = JSON.parse(raw) as unknown[]
      for (const r of arr) if (!validateRecord(r)) this.records.set((r as StoredRecord).id, r as StoredRecord)
      const pend = JSON.parse(lsGet(LS_PENDING) ?? '[]') as string[]
      this.pending = new Set(pend.filter((id) => this.records.has(id)))
    } catch {
      this.syncInfo = { ...this.syncInfo, message: 'Lokale Daten waren beschädigt. Bitte Backup wiederherstellen.' }
    }
  }

  private persist() {
    const ok1 = lsSet(LS_RECORDS, JSON.stringify([...this.records.values()]))
    const ok2 = lsSet(LS_PENDING, JSON.stringify([...this.pending]))
    this.storageOk = ok1 && ok2
  }

  private stamp(prev?: string): string {
    let now = new Date()
    if (prev && now.toISOString() <= prev) now = new Date(new Date(prev).getTime() + 1)
    return now.toISOString()
  }

  private put(kind: RecordKind, id: string, data: unknown) {
    const prev = this.records.get(id)
    this.records.set(id, { id, kind, data, updatedAt: this.stamp(prev?.updatedAt), deleted: false })
    this.pending.add(id)
    this.commit()
  }

  private commit() {
    this.persist()
    this.emit()
    this.scheduleSync()
  }

  // ---------- Fachliche Aktionen ----------

  saveTask(task: Task) {
    this.put('task', task.id, task)
  }

  saveTasks(tasks: Task[]) {
    for (const t of tasks) {
      const prev = this.records.get(t.id)
      this.records.set(t.id, { id: t.id, kind: 'task', data: t, updatedAt: this.stamp(prev?.updatedAt), deleted: false })
      this.pending.add(t.id)
    }
    this.commit()
  }

  deleteTask(id: string) {
    const prev = this.records.get(id)
    if (!prev) return
    this.records.set(id, { ...prev, deleted: true, updatedAt: this.stamp(prev.updatedAt) })
    this.pending.add(id)
    // Abhängigkeiten anderer Aufgaben bereinigen
    for (const r of this.records.values()) {
      if (r.kind !== 'task' || r.deleted) continue
      const t = r.data as Task
      if (t.dependsOn?.includes(id)) {
        this.records.set(t.id, { ...r, data: { ...t, dependsOn: t.dependsOn.filter((d) => d !== id) }, updatedAt: this.stamp(r.updatedAt) })
        this.pending.add(t.id)
      }
    }
    this.commit()
  }

  setGoals(date: string, goals: DayGoals['goals']) {
    this.put('goals', `goals:${date}`, { date, goals })
  }

  setDay(date: string, patch: Partial<DayOverride>) {
    const prev = this.state.days[date] ?? { date }
    this.put('day', `day:${date}`, { ...prev, ...patch, date })
  }

  setSettings(settings: Settings) {
    this.put('settings', 'settings', settings)
  }

  // ---------- Backups ----------

  exportBackup(): BackupFile {
    lsSet(LS_LASTEXPORT, new Date().toISOString())
    const backup = makeBackup([...this.records.values()])
    this.emit()
    return backup
  }

  /** Ersetzt alle Daten durch die Sicherung. Vorher wird ein Sicherungspunkt angelegt. */
  restoreRecords(records: StoredRecord[]) {
    this.snapshot(true)
    const incoming = new Map(records.map((r) => [r.id, r]))
    // Alles, was nicht in der Sicherung ist, wird gelöscht (auch auf anderen Geräten)
    for (const r of this.records.values()) {
      if (!incoming.has(r.id) && !r.deleted) {
        this.records.set(r.id, { ...r, deleted: true, updatedAt: this.stamp(r.updatedAt) })
        this.pending.add(r.id)
      }
    }
    for (const r of incoming.values()) {
      const prev = this.records.get(r.id)
      const later = prev && prev.updatedAt > r.updatedAt ? prev.updatedAt : r.updatedAt
      this.records.set(r.id, { ...r, updatedAt: this.stamp(later) })
      this.pending.add(r.id)
    }
    this.commit()
  }

  listSnapshots(): Snapshot[] {
    try {
      return JSON.parse(lsGet(LS_SNAPSHOTS) ?? '[]') as Snapshot[]
    } catch {
      return []
    }
  }

  /** Täglicher automatischer Sicherungspunkt auf diesem Gerät (die letzten 7 bleiben erhalten). */
  snapshot(force = false) {
    if (this.records.size === 0) return
    const today = toDateStr(new Date())
    const list = this.listSnapshots()
    if (!force && list.some((s) => s.date === today)) return
    list.unshift({ date: today, createdAt: new Date().toISOString(), records: [...this.records.values()] })
    lsSet(LS_SNAPSHOTS, JSON.stringify(list.slice(0, MAX_SNAPSHOTS)))
  }

  // ---------- Synchronisation ----------

  private setSync(patch: Partial<SyncInfo>) {
    this.syncInfo = { ...this.syncInfo, ...patch }
    this.emit()
  }

  scheduleSync(delay = 1200) {
    if (!supabase) return
    clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => void this.sync(), delay)
  }

  async init() {
    this.snapshot()
    if (!supabase) return
    const { data } = await supabase.auth.getSession()
    this.setSync({ email: data.session?.user.email, state: data.session ? 'synchronisiere' : 'abgemeldet', authReady: true })
    supabase.auth.onAuthStateChange((_event, session) => {
      this.setSync({ email: session?.user.email, state: session ? this.syncInfo.state : 'abgemeldet' })
      if (session) this.scheduleSync(100)
    })
    window.addEventListener('online', () => this.scheduleSync(100))
    window.addEventListener('offline', () => this.setSync({ state: 'offline' }))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.scheduleSync(100)
    })
    setInterval(() => this.scheduleSync(0), 60_000)
    await this.sync()
  }

  async signIn(email: string, password: string): Promise<string | null> {
    if (!supabase) return 'Synchronisation ist nicht eingerichtet.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? translateAuthError(error.message) : null
  }

  // Kein Registrieren aus der App: Neue Konten sind in Supabase gesperrt (nur der Besitzer hat Zugang).

  async signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    this.setSync({ state: 'abgemeldet', email: undefined })
  }

  async sync(): Promise<void> {
    if (!supabase) return
    if (this.syncing) {
      this.syncAgain = true
      return
    }
    const { data } = await supabase.auth.getSession()
    const session = data.session
    if (!session) {
      this.setSync({ state: 'abgemeldet' })
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.setSync({ state: 'offline' })
      return
    }
    this.syncing = true
    this.setSync({ state: 'synchronisiere', message: undefined })
    try {
      await this.pull()
      await this.push(session.user.id)
      this.setSync({ state: 'synchronisiert', lastSyncAt: new Date().toISOString() })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.setSync({ state: navigator.onLine === false ? 'offline' : 'fehler', message: msg })
    } finally {
      this.syncing = false
      if (this.syncAgain) {
        this.syncAgain = false
        this.scheduleSync(300)
      }
    }
  }

  private async pull() {
    const since = lsGet(LS_LASTPULL) ?? '1970-01-01T00:00:00Z'
    let maxSeen = since
    const pageSize = 500
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase!
        .from('items')
        .select('id, kind, data, updated_at, deleted, server_updated_at')
        .gt('server_updated_at', since)
        .order('server_updated_at', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as RemoteRow[]
      const remote: StoredRecord[] = []
      for (const row of rows) {
        const rec = fromRow(row)
        if (rec) remote.push(rec)
        if (row.server_updated_at && row.server_updated_at > maxSeen) maxSeen = row.server_updated_at
      }
      const merged = mergeRemote(this.records, this.pending, remote)
      this.records = merged.records
      this.pending = merged.pending
      if (merged.changed) {
        this.persist()
        this.emit()
      }
      if (rows.length < pageSize) break
    }
    lsSet(LS_LASTPULL, maxSeen)
  }

  private async push(userId: string) {
    if (this.pending.size === 0) return
    const ids = [...this.pending]
    const rows = ids.map((id) => this.records.get(id)).filter((r): r is StoredRecord => !!r).map((r) => toRow(r, userId))
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200)
      const { error } = await supabase!.from('items').upsert(batch, { onConflict: 'user_id,id' })
      if (error) throw new Error(error.message)
      for (const row of batch) {
        // Nur entfernen, wenn sich der Datensatz seitdem nicht erneut geändert hat
        if (this.records.get(row.id)?.updatedAt === row.updated_at) this.pending.delete(row.id)
      }
    }
    this.persist()
    this.emit()
  }

  /** Alle Daten auf diesem Gerät löschen (z. B. vor Neuanmeldung). Server bleibt unverändert. */
  clearLocal() {
    this.records.clear()
    this.pending.clear()
    try {
      localStorage.removeItem(LS_RECORDS)
      localStorage.removeItem(LS_PENDING)
      localStorage.removeItem(LS_LASTPULL)
    } catch {
      /* ignorieren */
    }
    this.emit()
  }
}

function translateAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort falsch.'
  if (/email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail-Adresse.'
  if (/signups not allowed|signup is disabled/i.test(msg)) return 'Neue Konten sind deaktiviert. Bitte anmelden.'
  if (/password/i.test(msg) && /at least/i.test(msg)) return 'Das Passwort ist zu kurz.'
  return msg
}

export const store = new JarvisStore()

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
