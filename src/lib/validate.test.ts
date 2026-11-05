import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import { normalizeTask, validateTask } from './validate'

const base: Task = {
  id: 'a',
  title: 'Bewerbungen abschicken',
  category: 'Jobsuche',
  priority: 2,
  durationMin: 60,
  deadlineType: 'weich',
  status: 'offen',
  energy: 'mittel',
  dependsOn: [],
  createdAt: '2026-10-29T10:00:00.000Z',
  plannedDate: '2026-10-30',
}

describe('Feste Uhrzeit', () => {
  it('gültige Uhrzeit mit Datum ist ok', () => {
    expect(validateTask({ ...base, fixedStart: '15:00' }, [])).toEqual({})
  })
  it('ohne Datum, ungültig oder über Mitternacht wird abgelehnt', () => {
    expect(validateTask({ ...base, plannedDate: undefined, fixedStart: '15:00' }, []).fixedStart).toBeTruthy()
    expect(validateTask({ ...base, fixedStart: '25:00' }, []).fixedStart).toBeTruthy()
    expect(validateTask({ ...base, fixedStart: '23:30' }, []).fixedStart).toBeTruthy()
  })
  it('normalizeTask entfernt ungültige Uhrzeiten', () => {
    expect(normalizeTask({ ...base, fixedStart: 'abc' }).fixedStart).toBeUndefined()
    expect(normalizeTask({ ...base, plannedDate: undefined, fixedStart: '15:00' }).fixedStart).toBeUndefined()
    expect(normalizeTask({ ...base, fixedStart: '15:00' }).fixedStart).toBe('15:00')
  })
})
