// Reine Sync-Logik (ohne Netzwerk), damit sie testbar ist.
// Konfliktregel: Pro Datensatz gewinnt die neueste Änderung (updatedAt).

import type { RecordKind, StoredRecord } from '../types'
import { isTaskLike } from './validate'

export const KINDS: RecordKind[] = ['task', 'goals', 'day', 'settings']

export interface RemoteRow {
  user_id?: string
  id: string
  kind: string
  data: unknown
  updated_at: string
  deleted: boolean
  server_updated_at?: string
}

export function toRow(r: StoredRecord, userId: string): RemoteRow {
  return { user_id: userId, id: r.id, kind: r.kind, data: r.data, updated_at: r.updatedAt, deleted: r.deleted }
}

export function fromRow(row: RemoteRow): StoredRecord | null {
  const rec = {
    id: row.id,
    kind: row.kind as RecordKind,
    data: row.data,
    updatedAt: normalizeIso(row.updated_at),
    deleted: !!row.deleted,
  }
  return validateRecord(rec) ? null : rec
}

/** Postgres liefert z. B. „…+00:00“, der Browser „…Z“. Einheitliches Format für Vergleiche. */
export function normalizeIso(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toISOString()
}

/** Gibt eine Fehlermeldung zurück oder null, wenn der Datensatz gültig ist. */
export function validateRecord(r: unknown): string | null {
  if (!r || typeof r !== 'object') return 'kein Objekt'
  const x = r as Record<string, unknown>
  if (typeof x.id !== 'string' || !x.id || x.id.length > 200) return 'ungültige ID'
  if (typeof x.kind !== 'string' || !KINDS.includes(x.kind as RecordKind)) return `ungültiger Typ (${String(x.kind)})`
  if (typeof x.updatedAt !== 'string' || Number.isNaN(new Date(x.updatedAt).getTime())) return 'ungültiger Zeitstempel'
  if (typeof x.deleted !== 'boolean') return 'ungültiges Lösch-Flag'
  if (!x.deleted) {
    if (!x.data || typeof x.data !== 'object') return 'fehlende Daten'
    if (x.kind === 'task' && !isTaskLike(x.data)) return 'ungültige Aufgabe'
  }
  return null
}

export interface MergeResult {
  records: Map<string, StoredRecord>
  pending: Set<string>
  changed: boolean
}

export function mergeRemote(local: Map<string, StoredRecord>, pending: Set<string>, remote: StoredRecord[]): MergeResult {
  const records = new Map(local)
  const pend = new Set(pending)
  let changed = false
  for (const r of remote) {
    const l = records.get(r.id)
    if (!l || r.updatedAt > l.updatedAt) {
      records.set(r.id, r)
      pend.delete(r.id)
      changed = true
    } else if (r.updatedAt === l.updatedAt) {
      pend.delete(r.id) // identisch, bereits synchron
    } else {
      pend.add(r.id) // lokal neuer → hochladen
    }
  }
  return { records, pending: pend, changed }
}
