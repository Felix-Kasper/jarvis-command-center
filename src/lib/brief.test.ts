import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import { DEFAULT_SETTINGS } from './defaults'
import { buildDayPlan } from './planner'
import { daysSinceBackup, suggestGoals } from './brief'

const WED = '2026-10-28'
const MORNING = new Date(2026, 9, 28, 7, 30)
const ctx = { settings: { ...DEFAULT_SETTINGS, workStart: '08:00', workEnd: '16:00', lunchStart: '12:00', lunchEnd: '12:45', leisureBlocks: [] }, overrides: {} }

let n = 0
const task = (p: Partial<Task>): Task => ({
  id: `b${++n}`,
  title: `Aufgabe ${n}`,
  category: 'Bachelor',
  priority: 2,
  durationMin: 60,
  deadlineType: 'weich',
  status: 'offen',
  energy: 'mittel',
  dependsOn: [],
  createdAt: new Date(2026, 9, 1, 0, 0, n).toISOString(),
  plannedDate: WED,
  ...p,
})

describe('Morgen-Briefing', () => {
  it('schlägt die 3 wichtigsten offenen Aufgaben als Tagesziele vor', () => {
    const tasks = [task({ title: 'Niedrig', priority: 3 }), task({ title: 'Hoch', priority: 1 }), task({ title: 'Erledigt', priority: 1, status: 'erledigt' }), task({ title: 'Mittel A' }), task({ title: 'Mittel B' })]
    const goals = suggestGoals(buildDayPlan(WED, tasks, ctx, MORNING))
    expect(goals.map((g) => g.text)).toEqual(['Hoch', 'Mittel A', 'Mittel B'])
    expect(goals.every((g) => !g.done)).toBe(true)
  })

  it('füllt bei weniger als 3 Aufgaben mit leeren Zielen auf', () => {
    const goals = suggestGoals(buildDayPlan(WED, [task({ title: 'Einzige' })], ctx, MORNING))
    expect(goals).toHaveLength(3)
    expect(goals[1].text).toBe('')
  })

  it('berechnet das Alter des letzten Backups', () => {
    expect(daysSinceBackup(undefined, WED)).toBeNull()
    expect(daysSinceBackup(new Date(2026, 9, 20, 10).toISOString(), WED)).toBe(8)
  })
})
