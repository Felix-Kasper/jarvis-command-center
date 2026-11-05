import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import { DEFAULT_SETTINGS } from './defaults'
import { buildDayPlan, checkFit, defaultPlannedDate, findFreeDate, orderTasks, upcomingDeadlines, type PlanContext } from './planner'

// Mittwoch, 28.10.2026, 07:30 Uhr (vor Arbeitsbeginn)
const WED_MORNING = new Date(2026, 9, 28, 7, 30)
const WED = '2026-10-28'
const THU = '2026-10-29'
const SAT = '2026-10-31'
const MON = '2026-11-02'

// Feste Test-Einstellungen (alte Tagesstruktur 08–16 Uhr), unabhängig von späteren Standardwerten
const LEGACY = { ...DEFAULT_SETTINGS, workStart: '08:00', workEnd: '16:00', lunchStart: '12:00', lunchEnd: '12:45', leisureBlocks: [] }

function ctx(over: Partial<PlanContext> = {}): PlanContext {
  return { settings: LEGACY, overrides: {}, ...over }
}

let n = 0
function task(p: Partial<Task> = {}): Task {
  n++
  return {
    id: `t${n}`,
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
  }
}

describe('Tagesplan', () => {
  it('Werktag: 08–16 Uhr minus 45 min Mittag = 435 freie Minuten', () => {
    const plan = buildDayPlan(WED, [], ctx(), WED_MORNING)
    expect(plan.locked).toBe(false)
    expect(plan.freeMin).toBe(435)
    expect(plan.blocks.some((b) => b.type === 'schlaf')).toBe(true)
    expect(plan.blocks.some((b) => b.type === 'feierabend')).toBe(true)
  })

  it('Wochenende ist gesperrt und hat keine Arbeitszeit', () => {
    const plan = buildDayPlan(SAT, [task({ plannedDate: SAT })], ctx(), WED_MORNING)
    expect(plan.locked).toBe('wochenende')
    expect(plan.freeMin).toBe(0)
    expect(plan.overflow).toHaveLength(1)
  })

  it('freigegebenes Wochenende hat Arbeitszeit', () => {
    const plan = buildDayPlan(SAT, [], ctx({ overrides: { [SAT]: { date: SAT, weekendReleased: true } } }), WED_MORNING)
    expect(plan.locked).toBe(false)
    expect(plan.freeMin).toBe(435)
  })

  it('nach 16 Uhr ist heute Feierabend', () => {
    const evening = new Date(2026, 9, 28, 18, 5)
    const plan = buildDayPlan(WED, [task()], ctx(), evening)
    expect(plan.locked).toBe('feierabend')
    expect(plan.overflow).toHaveLength(1)
  })

  it('freigegebener Abend: Arbeit bis 22:00 möglich, Schlaf bleibt geschützt', () => {
    const evening = new Date(2026, 9, 28, 18, 5)
    const c = ctx({ overrides: { [WED]: { date: WED, workEnd: '23:30' } } })
    const plan = buildDayPlan(WED, [task({ durationMin: 90 })], c, evening)
    expect(plan.locked).toBe(false)
    expect(plan.workEnd).toBe(22 * 60) // auf 22:00 begrenzt
    expect(plan.overflow).toHaveLength(0)
    expect(plan.freeMin).toBe(22 * 60 - (18 * 60 + 5)) // ab 18:05
  })

  it('setzt nach 90 min am Stück eine Pause', () => {
    const plan = buildDayPlan(WED, [task({ durationMin: 60 }), task({ durationMin: 60 })], ctx(), WED_MORNING)
    const types = plan.blocks.filter((b) => b.start >= 480 && b.end <= 720).map((b) => b.type)
    expect(types.slice(0, 3)).toEqual(['task', 'pause', 'task'])
  })

  it('teilt lange Aufgaben und respektiert die Mittagspause', () => {
    const plan = buildDayPlan(WED, [task({ durationMin: 240 })], ctx(), WED_MORNING)
    const parts = plan.blocks.filter((b) => b.type === 'task')
    expect(parts.length).toBeGreaterThan(1)
    const lunchStart = 12 * 60
    const lunchEnd = 12 * 60 + 45
    for (const p of parts) expect(p.end <= lunchStart || p.start >= lunchEnd).toBe(true)
    expect(plan.overflow).toHaveLength(0)
  })

  it('meldet Überbuchung', () => {
    const plan = buildDayPlan(WED, [task({ durationMin: 300 }), task({ durationMin: 200 })], ctx(), WED_MORNING)
    expect(plan.overflow.length).toBeGreaterThan(0)
  })

  it('Freizeitblöcke sind geschützt (auch an verlängerten Tagen)', () => {
    const settings = { ...LEGACY, leisureBlocks: [{ id: 'g', title: 'Spieleabend', fromDate: WED, toDate: WED, start: '19:00', end: '21:00' }] }
    const c: PlanContext = { settings, overrides: { [WED]: { date: WED, workEnd: '22:00' } } }
    const plan = buildDayPlan(WED, [task({ durationMin: 600 })], c, WED_MORNING)
    const taskBlocks = plan.blocks.filter((b) => b.type === 'task')
    for (const b of taskBlocks) expect(b.end <= 19 * 60 || b.start >= 21 * 60).toBe(true)
    expect(plan.blocks.some((b) => b.type === 'freizeit' && b.label === 'Spieleabend')).toBe(true)
  })

  it('überträgt offene Aufgaben aus Vortagen auf heute', () => {
    const old = task({ plannedDate: '2026-10-27' })
    const done = task({ plannedDate: '2026-10-27', status: 'erledigt' })
    const plan = buildDayPlan(WED, [old, done], ctx(), WED_MORNING)
    expect(plan.dayTasks.map((t) => t.id)).toEqual([old.id])
    expect(plan.carriedIds.has(old.id)).toBe(true)
  })
})

describe('Reihenfolge', () => {
  it('harte Deadline vor Priorität, Abhängigkeit vor abhängiger Aufgabe', () => {
    const a = task({ priority: 1 })
    const b = task({ priority: 3, deadline: THU, deadlineType: 'hart' })
    const c = task({ priority: 1, dependsOn: [] })
    const d = task({ priority: 1 })
    c.dependsOn = [d.id]
    const order = orderTasks([a, b, c, d]).map((t) => t.id)
    expect(order[0]).toBe(b.id)
    expect(order.indexOf(d.id)).toBeLessThan(order.indexOf(c.id))
  })
})

describe('Gesundheit zuerst', () => {
  it('Gym wird bei Überbuchung nicht als Erstes verdrängt', () => {
    const work = [task({ durationMin: 150 }), task({ durationMin: 150 }), task({ durationMin: 90 })]
    const gym = task({ category: 'Gesundheit/Gym', priority: 2, durationMin: 60, title: 'Gym' })
    const plan = buildDayPlan(WED, [...work, gym], ctx(), WED_MORNING)
    expect(plan.overflow.length).toBeGreaterThan(0)
    expect(plan.overflow.some((o) => o.taskId === gym.id)).toBe(false)
  })
})

describe('Konflikterkennung', () => {
  it('passende Aufgabe ist ok', () => {
    const t = task()
    expect(checkFit(t, [], ctx(), WED_MORNING).ok).toBe(true)
  })

  it('Wochenende: Konflikt + Vorschläge (Montag oder freigeben)', () => {
    const t = task({ plannedDate: SAT })
    const r = checkFit(t, [], ctx(), WED_MORNING)
    expect(r.ok).toBe(false)
    expect(r.issues[0].kind).toBe('wochenende')
    expect(r.suggestions).toContainEqual(expect.objectContaining({ kind: 'move', date: MON }))
    expect(r.suggestions).toContainEqual(expect.objectContaining({ kind: 'release_weekend', date: SAT }))
  })

  it('Überbuchung: schlägt nächsten freien Tag vor und verschiebt nichts selbst', () => {
    const existing = [task({ durationMin: 400 })]
    const t = task({ durationMin: 120 })
    const r = checkFit(t, existing, ctx(), WED_MORNING)
    expect(r.issues.some((i) => i.kind === 'ueberbucht')).toBe(true)
    expect(r.suggestions).toContainEqual(expect.objectContaining({ kind: 'move', taskId: t.id, date: THU }))
    expect(existing[0].plannedDate).toBe(WED)
  })

  it('warnt, wenn eine Aufgabe mit harter Deadline verdrängt würde', () => {
    const important = task({ durationMin: 300, deadline: WED, deadlineType: 'hart', priority: 3 })
    const t = task({ durationMin: 200, priority: 1 })
    const r = checkFit(t, [important], ctx(), WED_MORNING)
    // Harte Deadline wird zuerst eingeplant, daher passt die neue Aufgabe nicht
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.kind === 'ueberbucht')).toBe(true)
  })

  it('schlägt das Verschieben anderer Aufgaben nur vor, wenn es den Konflikt wirklich löst', () => {
    const configs = [
      [60, 60, 60, 120, 90],
      [30, 200, 60],
      [120, 120, 120],
    ]
    for (const durations of configs) {
      const existing = durations.map((d, i) => task({ durationMin: d, priority: (i % 2 ? 2 : 3) as 2 | 3 }))
      const t = task({ durationMin: 180, priority: 1 })
      const r = checkFit(t, existing, ctx(), WED_MORNING)
      for (const s of r.suggestions) {
        if (s.kind !== 'move' || s.taskId === t.id) continue
        const applied = [...existing.map((x) => (x.id === s.taskId ? { ...x, plannedDate: s.date } : x)), t]
        const plan = buildDayPlan(WED, applied, ctx(), WED_MORNING)
        expect(plan.overflow).toEqual([])
      }
    }
  })

  it('geplant nach harter Deadline = Konflikt', () => {
    const t = task({ plannedDate: MON, deadline: THU, deadlineType: 'hart' })
    const r = checkFit(t, [], ctx(), WED_MORNING)
    expect(r.issues.some((i) => i.kind === 'deadline_verpasst')).toBe(true)
    expect(r.suggestions).toContainEqual(expect.objectContaining({ kind: 'move', date: WED }))
  })

  it('Feierabend heute: Vorschlag morgen oder ausnahmsweise länger', () => {
    const evening = new Date(2026, 9, 28, 18, 5)
    const t = task({ plannedDate: WED })
    const r = checkFit(t, [], ctx(), evening)
    expect(r.issues[0].kind).toBe('feierabend')
    expect(r.suggestions).toContainEqual(expect.objectContaining({ kind: 'move', date: THU }))
    expect(r.suggestions).toContainEqual(expect.objectContaining({ kind: 'extend_day', workEnd: '22:00' }))
  })

  it('Abhängigkeit, die später geplant ist, ergibt einen Hinweis', () => {
    const dep = task({ plannedDate: THU })
    const t = task({ dependsOn: [dep.id] })
    const r = checkFit(t, [dep], ctx(), WED_MORNING)
    expect(r.issues.some((i) => i.kind === 'abhaengigkeit')).toBe(true)
  })

  it('findFreeDate überspringt das Wochenende', () => {
    const fri = '2026-10-30'
    const full = task({ plannedDate: fri, durationMin: 430 })
    const t = task({ plannedDate: undefined, durationMin: 60 })
    expect(findFreeDate(t, [full], ctx(), WED_MORNING, fri)).toBe(MON)
  })

  it('Standarddatum: heute vor Feierabend, sonst nächster Arbeitstag', () => {
    expect(defaultPlannedDate(ctx(), WED_MORNING)).toBe(WED)
    expect(defaultPlannedDate(ctx(), new Date(2026, 9, 30, 17, 0))).toBe(MON) // Freitagabend → Montag
  })
})

describe('Deadlines', () => {
  it('markiert Risiken', () => {
    const notPlanned = task({ plannedDate: undefined, deadline: THU, deadlineType: 'hart' })
    const fine = task({ deadline: THU })
    const list = upcomingDeadlines([notPlanned, fine], ctx(), WED_MORNING)
    expect(list.find((e) => e.task.id === notPlanned.id)?.risk).toBe('nicht eingeplant')
    expect(list.find((e) => e.task.id === fine.id)?.risk).toBeUndefined()
  })
})

describe('Feste Zeitblöcke (Blocker)', () => {
  const at = (plan: ReturnType<typeof buildDayPlan>, id: string) => plan.blocks.filter((b) => b.taskId === id)

  it('Block liegt genau zur festen Uhrzeit, andere Aufgaben planen sich darum herum', () => {
    const blocker = task({ title: 'Bewerbungen abschicken', fixedStart: '15:00', durationMin: 60, priority: 3, energy: 'niedrig' })
    const lernen = task({ title: 'Lernen', durationMin: 300, priority: 1, energy: 'hoch' })
    const plan = buildDayPlan(WED, [lernen, blocker], ctx(), WED_MORNING)
    const b = at(plan, blocker.id)
    expect(b).toHaveLength(1)
    expect([b[0].start, b[0].end]).toEqual([15 * 60, 16 * 60])
    // Lernblöcke überschneiden den festen Block nicht
    for (const l of at(plan, lernen.id)) expect(l.end <= 15 * 60 || l.start >= 16 * 60).toBe(true)
    expect(plan.overflow).toHaveLength(0)
  })

  it('zu volle Tage: der Block bleibt, flexible Aufgaben laufen über', () => {
    const blocker = task({ fixedStart: '13:00', durationMin: 120 })
    const gross = task({ durationMin: 400, priority: 1 })
    const plan = buildDayPlan(WED, [gross, blocker], ctx(), WED_MORNING)
    expect(at(plan, blocker.id).map((x) => [x.start, x.end])).toEqual([[13 * 60, 15 * 60]])
    expect(plan.overflow.map((o) => o.taskId)).toEqual([gross.id])
  })

  it('Überschneidung mit der Mittagspause: Rest wird als fehlende Zeit gemeldet', () => {
    const blocker = task({ fixedStart: '11:30', durationMin: 60 })
    const plan = buildDayPlan(WED, [blocker], ctx(), WED_MORNING)
    expect(at(plan, blocker.id).map((x) => [x.start, x.end])).toEqual([[11 * 60 + 30, 12 * 60]])
    expect(plan.overflow).toEqual([{ taskId: blocker.id, missingMin: 30 }])
  })

  it('Uhrzeit nach Feierabend: Aufgabe wird normal eingeplant (Feierabend bleibt geschützt)', () => {
    const blocker = task({ fixedStart: '17:00', durationMin: 30 })
    const plan = buildDayPlan(WED, [blocker], ctx(), WED_MORNING)
    const b = at(plan, blocker.id)
    expect(b).toHaveLength(1)
    expect(b[0].end <= 16 * 60).toBe(true)
  })

  it('heute schon vorbei: Aufgabe rutscht in die nächste freie Zeit', () => {
    const blocker = task({ fixedStart: '09:00', durationMin: 30 })
    const plan = buildDayPlan(WED, [blocker], ctx(), new Date(2026, 9, 28, 10, 0))
    const b = at(plan, blocker.id)
    expect(b).toHaveLength(1)
    expect(b[0].start >= 10 * 60).toBe(true)
  })
})

describe('Wochenstruktur: Gym-Tage und Puffer (ab 30.10.2026)', () => {
  const WEEK: PlanContext = {
    settings: {
      ...LEGACY,
      workEnd: '18:00',
      lunchStart: '11:30',
      lunchEnd: '12:30',
      leisureBlocks: [
        { id: 'gym', title: 'Gym', fromDate: '2026-10-26', toDate: '2099-12-31', start: '08:00', end: '11:30', weekdays: [1, 2, 4, 5] },
        { id: 'rest', title: 'Restday · Puffer', fromDate: '2026-10-26', toDate: '2099-12-31', start: '08:00', end: '11:30', weekdays: [3], kind: 'puffer' },
      ],
    },
    overrides: {},
  }
  const MON_MORNING = new Date(2026, 10, 2, 7, 30)

  it('Gym-Tag: Gym 08–11:30, Mittag, Arbeit 12:30–18:00 = 330 min', () => {
    const plan = buildDayPlan(MON, [task({ plannedDate: MON })], WEEK, MON_MORNING)
    expect(plan.freeMin).toBe(330)
    expect(plan.blocks.find((b) => b.label === 'Gym')).toMatchObject({ start: 480, end: 690, type: 'freizeit' })
    expect(plan.blocks.find((b) => b.type === 'mittag')).toMatchObject({ start: 690, end: 750 })
    expect(plan.blocks.find((b) => b.type === 'task')?.start).toBe(750)
  })

  it('Gym nur an Mo/Di/Do/Fr, nicht am Wochenende', () => {
    expect(buildDayPlan(THU, [], WEEK, WED_MORNING).blocks.some((b) => b.label === 'Gym')).toBe(true)
    expect(buildDayPlan(SAT, [], WEEK, WED_MORNING).blocks.some((b) => b.label === 'Gym')).toBe(false)
    expect(buildDayPlan(WED, [], WEEK, WED_MORNING).blocks.some((b) => b.label === 'Gym')).toBe(false)
  })

  it('Mittwoch: Vormittag bleibt Puffer, Aufgaben starten 12:30', () => {
    const plan = buildDayPlan(WED, [task(), task()], WEEK, WED_MORNING)
    expect(plan.freeMin).toBe(330)
    expect(plan.blocks.filter((b) => b.type === 'task').every((b) => b.start >= 750)).toBe(true)
    expect(plan.blocks.find((b) => b.label === 'Restday · Puffer')).toMatchObject({ start: 480, end: 690, type: 'puffer' })
    expect(plan.overflow).toEqual([])
  })

  it('Mittwoch: Überhang nutzt den Puffer statt überzulaufen', () => {
    const plan = buildDayPlan(WED, [task({ durationMin: 240 }), task({ durationMin: 150 })], WEEK, WED_MORNING)
    expect(plan.overflow).toEqual([])
    expect(plan.blocks.some((b) => b.type === 'task' && b.start < 690)).toBe(true)
    const gymDay = buildDayPlan(THU, [task({ plannedDate: THU, durationMin: 240 }), task({ plannedDate: THU, durationMin: 150 })], WEEK, WED_MORNING)
    expect(gymDay.overflow.length).toBeGreaterThan(0)
  })

  it('Fester Termin darf im Puffer liegen', () => {
    const t = task({ fixedStart: '09:00', durationMin: 60 })
    const plan = buildDayPlan(WED, [t], WEEK, WED_MORNING)
    expect(plan.blocks.find((b) => b.taskId === t.id)).toMatchObject({ start: 540, end: 600 })
  })
})
