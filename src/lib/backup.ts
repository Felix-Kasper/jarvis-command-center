// Backup-Format (JSON) und Prüfung beim Wiederherstellen.

import type { StoredRecord } from '../types'
import { validateRecord } from './sync'

export interface BackupFile {
  app: 'jarvis'
  version: 1
  exportedAt: string
  records: StoredRecord[]
}

export function makeBackup(records: StoredRecord[], now = new Date()): BackupFile {
  return { app: 'jarvis', version: 1, exportedAt: now.toISOString(), records }
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string }

export function parseBackup(text: string): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' }
  }
  if (!json || typeof json !== 'object') return { ok: false, error: 'Unbekanntes Dateiformat.' }
  const b = json as Record<string, unknown>
  if (b.app !== 'jarvis') return { ok: false, error: 'Das ist keine JARVIS-Sicherung.' }
  if (b.version !== 1) return { ok: false, error: `Nicht unterstützte Version (${String(b.version)}).` }
  if (!Array.isArray(b.records)) return { ok: false, error: 'Die Sicherung enthält keine Datensätze.' }
  const errors: string[] = []
  b.records.forEach((r, i) => {
    const err = validateRecord(r)
    if (err) errors.push(`Datensatz ${i + 1}: ${err}`)
  })
  if (errors.length) return { ok: false, error: `Sicherung beschädigt – ${errors.length} Fehler. ${errors.slice(0, 3).join('; ')}` }
  return { ok: true, backup: b as unknown as BackupFile }
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `jarvis-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`
}
