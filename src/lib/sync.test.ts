import { describe, expect, it } from 'vitest'
import type { StoredRecord } from '../types'
import { fromRow, mergeRemote, normalizeIso } from './sync'
import { makeBackup, parseBackup } from './backup'
import { hasCycle, validateTask } from './validate'

const task = (id: string) => ({ id, title: id, category: 'Bachelor', priority: 2, durationMin: 30, status: 'offen', createdAt: '2026-10-27T10:00:00.000Z', deadlineType: 'weich', energy: 'mittel', dependsOn: [] })
const rec = (id: string, updatedAt: string, deleted = false): StoredRecord => ({ id, kind: 'task', data: task(id), updatedAt, deleted })

describe('Sync-Merge (neueste Änderung gewinnt)', () => {
  it('übernimmt neuere Server-Daten', () => {
    const local = new Map([['a', rec('a', '2026-10-27T10:00:00.000Z')]])
    const r = mergeRemote(local, new Set(), [rec('a', '2026-10-27T11:00:00.000Z')])
    expect(r.records.get('a')!.updatedAt).toBe('2026-10-27T11:00:00.000Z')
    expect(r.changed).toBe(true)
  })

  it('behält lokale neuere Änderung und lädt sie hoch', () => {
    const local = new Map([['a', rec('a', '2026-10-27T12:00:00.000Z')]])
    const r = mergeRemote(local, new Set(['a']), [rec('a', '2026-10-27T11:00:00.000Z')])
    expect(r.records.get('a')!.updatedAt).toBe('2026-10-27T12:00:00.000Z')
    expect(r.pending.has('a')).toBe(true)
  })

  it('neuere Server-Änderung überschreibt ältere lokale, noch nicht hochgeladene', () => {
    const local = new Map([['a', rec('a', '2026-10-27T10:00:00.000Z')]])
    const r = mergeRemote(local, new Set(['a']), [rec('a', '2026-10-27T11:00:00.000Z')])
    expect(r.pending.has('a')).toBe(false)
  })

  it('übernimmt Löschungen anderer Geräte', () => {
    const local = new Map([['a', rec('a', '2026-10-27T10:00:00.000Z')]])
    const r = mergeRemote(local, new Set(), [rec('a', '2026-10-27T11:00:00.000Z', true)])
    expect(r.records.get('a')!.deleted).toBe(true)
  })

  it('normalisiert Postgres-Zeitstempel', () => {
    expect(normalizeIso('2026-10-27T11:00:00.123+00:00')).toBe('2026-10-27T11:00:00.123Z')
    const r = fromRow({ id: 'a', kind: 'task', data: task('a'), updated_at: '2026-10-27T11:00:00.123+00:00', deleted: false })
    expect(r?.updatedAt).toBe('2026-10-27T11:00:00.123Z')
  })

  it('verwirft ungültige Server-Daten', () => {
    expect(fromRow({ id: 'a', kind: 'quatsch', data: {}, updated_at: '2026-10-27T11:00:00Z', deleted: false })).toBeNull()
  })
})

describe('Backup', () => {
  it('Export → Import ergibt dieselben Daten', () => {
    const records = [rec('a', '2026-10-27T10:00:00.000Z'), rec('b', '2026-10-27T10:00:01.000Z', true)]
    const parsed = parseBackup(JSON.stringify(makeBackup(records)))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.backup.records).toEqual(records)
  })

  it('lehnt fremde oder kaputte Dateien ab', () => {
    expect(parseBackup('kein json').ok).toBe(false)
    expect(parseBackup('{"app":"other"}').ok).toBe(false)
    const broken = { app: 'jarvis', version: 1, exportedAt: '', records: [{ id: 'x', kind: 'task', data: { title: 1 }, updatedAt: '2026-10-27T10:00:00Z', deleted: false }] }
    const r = parseBackup(JSON.stringify(broken))
    expect(r.ok).toBe(false)
  })
})

describe('Validierung', () => {
  it('erkennt Pflichtfelder und ungültige Dauer', () => {
    const t = { ...task('a'), title: '  ', durationMin: 2 } as never
    const e = validateTask(t, [])
    expect(e.title).toBeDefined()
    expect(e.durationMin).toBeDefined()
  })

  it('erkennt Abhängigkeitskreise', () => {
    const a = { ...task('a'), dependsOn: ['b'] } as never
    const b = { ...task('b'), dependsOn: ['c'] } as never
    expect(hasCycle('c', ['a'], [a, b])).toBe(true)
    expect(hasCycle('c', [], [a, b])).toBe(false)
  })
})
