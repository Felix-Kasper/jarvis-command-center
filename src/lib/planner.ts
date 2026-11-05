// Planungslogik: Tagesplan, Kapazität, Konflikterkennung, Vorschläge.
// Grundsatz: Es wird nichts automatisch verschoben. Das System erkennt Konflikte
// und macht Vorschläge, die Entscheidung trifft der Nutzer.

import type { DayOverride, LeisureBlock, Settings, Task } from '../types'
import { addDays, daysBetween, isValidTimeStr, isWeekend, minutesOfDay, toDateStr, toMin, fromMin, formatDateShort, weekday } from './time'

export type BlockType =
  | 'schlaf'
  | 'routine'
  | 'task'
  | 'pause'
  | 'mittag'
  | 'puffer'
  | 'vergangen'
  | 'feierabend'
  | 'freizeit'
  | 'wochenende'

export interface PlanBlock {
  start: number // Minuten seit 00:00
  end: number
  type: BlockType
  label: string
  taskId?: string
  part?: { index: number; total: number }
}

export interface PlanContext {
  settings: Settings
  overrides: Record<string, DayOverride | undefined>
}

export type LockReason = false | 'wochenende' | 'feierabend' | 'vergangen'

export interface DayPlan {
  date: string
  locked: LockReason
  workStart: number
  workEnd: number
  extended: boolean
  blocks: PlanBlock[]
  overflow: { taskId: string; missingMin: number }[]
  freeMin: number // freie Arbeitsminuten (ab jetzt, falls heute)
  plannedMin: number // offene Aufgabenminuten
  dayTasks: Task[] // Aufgaben des Tages (inkl. erledigte und übertragene)
  carriedIds: Set<string> // aus Vortagen übertragene, noch offene Aufgaben
}

interface Interval {
  start: number
  end: number
}

const ENERGY_ORDER = { hoch: 0, mittel: 1, niedrig: 2 } as const
const MIN_CHUNK = 25 // kleinere Restlücken werden nicht mit Aufgabenteilen gefüllt

function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = []
  for (const iv of intervals) {
    if (cut.end <= iv.start || cut.start >= iv.end) {
      out.push(iv)
      continue
    }
    if (cut.start > iv.start) out.push({ start: iv.start, end: cut.start })
    if (cut.end < iv.end) out.push({ start: cut.end, end: iv.end })
  }
  return out
}

export function isDone(t: Task): boolean {
  return t.status === 'erledigt'
}

/** Ist der Tag gesperrt, weil Wochenende? */
export function isWeekendLocked(date: string, ctx: PlanContext): boolean {
  return ctx.settings.weekendLocked && isWeekend(date) && !ctx.overrides[date]?.weekendReleased
}

export function workEndFor(date: string, ctx: PlanContext): { end: number; extended: boolean } {
  const s = ctx.settings
  const ov = ctx.overrides[date]?.workEnd
  const cap = Math.min(toMin(s.latestExtendedEnd), toMin(s.sleep) - 30)
  if (ov) return { end: Math.min(toMin(ov), cap), extended: toMin(ov) > toMin(s.workEnd) }
  return { end: toMin(s.workEnd), extended: false }
}

/** Gilt ein (ggf. wiederkehrender) Block an diesem Tag? */
export function blockAppliesOn(b: LeisureBlock, date: string): boolean {
  if (date < b.fromDate || date > b.toDate) return false
  return !b.weekdays?.length || b.weekdays.includes(weekday(date))
}

/** Aufgaben, die an diesem Tag angezeigt werden. Heute: inkl. offener Aufgaben aus Vortagen. */
export function tasksForDay(date: string, tasks: Task[], today: string): { list: Task[]; carried: Set<string> } {
  const carried = new Set<string>()
  const list = tasks.filter((t) => {
    if (!t.plannedDate) return false
    if (t.plannedDate === date) return true
    if (date === today && t.plannedDate < today && !isDone(t)) {
      carried.add(t.id)
      return true
    }
    return false
  })
  return { list, carried }
}

/** Gesundheit steht in der Rangfolge ganz oben – Gym/Wellness zählt daher immer als hohe Priorität. */
export const HEALTH_CATEGORY = 'Gesundheit/Gym'
function effectivePriority(t: Task): number {
  return t.category === HEALTH_CATEGORY ? 1 : t.priority
}

/** Fester Zeitblock einer Aufgabe (nur mit gültiger Uhrzeit). */
export function fixedInterval(t: Task): Interval | null {
  if (!isValidTimeStr(t.fixedStart)) return null
  const start = toMin(t.fixedStart)
  return { start, end: Math.min(start + t.durationMin, 24 * 60) }
}

/** Reihenfolge: in Arbeit → harte Deadline → Priorität (Gesundheit = hoch) → Energie (Anspruchsvolles früh) → Abhängigkeiten. */
export function orderTasks(tasks: Task[]): Task[] {
  const sorted = [...tasks].sort((a, b) => {
    const ia = a.status === 'in_arbeit' ? 0 : 1
    const ib = b.status === 'in_arbeit' ? 0 : 1
    if (ia !== ib) return ia - ib
    const da = a.deadline && a.deadlineType === 'hart' ? a.deadline : '9999-12-31'
    const db = b.deadline && b.deadlineType === 'hart' ? b.deadline : '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    const pa = effectivePriority(a)
    const pb = effectivePriority(b)
    if (pa !== pb) return pa - pb
    if (a.energy !== b.energy) return ENERGY_ORDER[a.energy] - ENERGY_ORDER[b.energy]
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  })
  // Abhängigkeiten innerhalb des Tages respektieren
  const ids = new Set(sorted.map((t) => t.id))
  const result: Task[] = []
  const placed = new Set<string>()
  const remaining = [...sorted]
  while (remaining.length) {
    let idx = remaining.findIndex((t) => t.dependsOn.every((d) => !ids.has(d) || placed.has(d)))
    if (idx === -1) idx = 0 // Zyklus: einfach in Reihenfolge weiter
    const [t] = remaining.splice(idx, 1)
    result.push(t)
    placed.add(t.id)
  }
  return result
}

export function buildDayPlan(date: string, allTasks: Task[], ctx: PlanContext, now: Date): DayPlan {
  const s = ctx.settings
  const today = toDateStr(now)
  const nowMin = Math.ceil(minutesOfDay(now) / 5) * 5
  const wake = toMin(s.wake)
  const sleep = toMin(s.sleep)
  const workStart = toMin(s.workStart)
  const { end: workEnd, extended } = workEndFor(date, ctx)
  const { list: dayTasks, carried } = tasksForDay(date, allTasks, today)
  const open = orderTasks(dayTasks.filter((t) => !isDone(t)))
  const plannedMin = open.reduce((sum, t) => sum + t.durationMin, 0)

  const todays = s.leisureBlocks.filter((b) => blockAppliesOn(b, date))
  const leisure: PlanBlock[] = todays
    .filter((b) => b.kind !== 'puffer')
    .map((b) => ({ start: toMin(b.start), end: toMin(b.end), type: 'freizeit' as const, label: b.title }))
  // Puffer (Reserve): wird nicht verplant, außer der Tag läuft sonst über
  const buffers: PlanBlock[] = todays
    .filter((b) => b.kind === 'puffer')
    .map((b) => ({ start: toMin(b.start), end: toMin(b.end), type: 'puffer' as const, label: b.title }))

  let locked: LockReason = false
  if (date < today) locked = 'vergangen'
  else if (isWeekendLocked(date, ctx)) locked = 'wochenende'
  else if (date === today && nowMin >= workEnd) locked = 'feierabend'

  const blocks: PlanBlock[] = []
  if (wake < workStart) blocks.push({ start: wake, end: workStart, type: 'routine', label: 'Morgenroutine · Duschen, Rasieren, Tee' })

  // Freie Arbeitssegmente bestimmen
  let segments: Interval[] = []
  let bufferSegs: Interval[] = []
  const staticWork: PlanBlock[] = []
  if (!locked) {
    segments = [{ start: workStart, end: workEnd }]
    const lunch = { start: toMin(s.lunchStart), end: toMin(s.lunchEnd) }
    if (lunch.end > workStart && lunch.start < workEnd) {
      segments = subtract(segments, lunch)
      staticWork.push({ ...lunch, type: 'mittag', label: 'Mittagspause' })
    }
    for (const l of leisure) {
      if (l.end > workStart && l.start < workEnd) segments = subtract(segments, l)
    }
    for (const b of buffers) {
      if (b.end <= workStart || b.start >= workEnd) continue
      const inWindow = { start: Math.max(b.start, workStart), end: Math.min(b.end, workEnd) }
      segments = subtract(segments, inWindow)
      let parts: Interval[] = [inWindow]
      if (lunch.end > workStart && lunch.start < workEnd) parts = subtract(parts, lunch)
      for (const l of leisure) parts = subtract(parts, l)
      bufferSegs.push(...parts)
    }
    bufferSegs.sort((a, b) => a.start - b.start)
    if (date === today && nowMin > workStart) {
      segments = subtract(segments, { start: workStart, end: nowMin })
      bufferSegs = subtract(bufferSegs, { start: workStart, end: nowMin })
      // Vergangene Arbeitszeit grau – ohne Mittag und Freizeitblöcke (z. B. Gym), die bleiben sichtbar
      let past: Interval[] = [{ start: workStart, end: Math.min(nowMin, workEnd) }]
      for (const cut of [...staticWork, ...leisure]) past = subtract(past, cut)
      for (const iv of past) if (iv.end - iv.start >= 5) staticWork.push({ ...iv, type: 'vergangen', label: 'Vergangen' })
    }
  }
  const freeMin = segments.reduce((sum, iv) => sum + (iv.end - iv.start), 0)

  const taskBlocks: PlanBlock[] = []
  const overflow: { taskId: string; missingMin: number }[] = []

  // Feste Zeitblöcke („Blocker“) zuerst setzen; alles andere plant sich darum herum.
  // Liegt die Uhrzeit außerhalb der Arbeitszeit oder ist sie heute schon vorbei, wird die Aufgabe normal eingeplant.
  const flexible: Task[] = []
  for (const t of open) {
    const fixed = fixedInterval(t)
    if (!fixed || locked || (date === today && fixed.start < nowMin)) {
      flexible.push(t)
      continue
    }
    const parts: PlanBlock[] = []
    for (const seg of [...segments, ...bufferSegs]) {
      const start = Math.max(seg.start, fixed.start)
      const end = Math.min(seg.end, fixed.end)
      if (end - start >= 5) parts.push({ start, end, type: 'task', label: t.title, taskId: t.id })
    }
    if (!parts.length) {
      flexible.push(t)
      continue
    }
    if (parts.length > 1) parts.forEach((p, i) => (p.part = { index: i + 1, total: parts.length }))
    taskBlocks.push(...parts)
    const placed = parts.reduce((sum, p) => sum + (p.end - p.start), 0)
    if (placed < t.durationMin) overflow.push({ taskId: t.id, missingMin: t.durationMin - placed })
    segments = subtract(segments, fixed)
    bufferSegs = subtract(bufferSegs, fixed)
  }

  // Erst die normale Arbeitszeit füllen, danach (nur bei Überhang) die Puffer-Zeit
  const slots = [...segments, ...bufferSegs]

  // Übrige Aufgaben einplanen (mit Pausen nach max. focusMaxMin am Stück, lange Aufgaben werden geteilt)
  let segIdx = 0
  let cursor = slots[0]?.start ?? 0
  let streak = 0
  for (const t of flexible) {
    let remaining = t.durationMin
    const parts: PlanBlock[] = []
    while (remaining > 0 && segIdx < slots.length) {
      const seg = slots[segIdx]
      if (cursor < seg.start || cursor > seg.end) {
        cursor = seg.start
        streak = 0
      }
      const room = seg.end - cursor
      if (room <= 0) {
        segIdx++
        continue
      }
      const want = Math.min(remaining, s.focusMaxMin)
      if (streak > 0 && streak + want > s.focusMaxMin) {
        const pEnd = Math.min(cursor + s.breakMin, seg.end)
        taskBlocks.push({ start: cursor, end: pEnd, type: 'pause', label: 'Pause' })
        cursor = pEnd
        streak = 0
        continue
      }
      const chunk = Math.min(want, room)
      if (chunk < Math.min(remaining, MIN_CHUNK)) {
        segIdx++
        continue
      }
      parts.push({ start: cursor, end: cursor + chunk, type: 'task', label: t.title, taskId: t.id })
      cursor += chunk
      remaining -= chunk
      streak += chunk
    }
    if (parts.length > 1) parts.forEach((p, i) => (p.part = { index: i + 1, total: parts.length }))
    taskBlocks.push(...parts)
    if (remaining > 0) overflow.push({ taskId: t.id, missingMin: remaining })
  }

  if (locked === 'wochenende') {
    let free: Interval[] = [{ start: workStart, end: sleep }]
    for (const l of leisure) free = subtract(free, l)
    for (const iv of free) blocks.push({ ...iv, type: 'wochenende', label: 'Wochenende · frei' })
    blocks.push(...leisure)
  } else {
    // Arbeitsfenster: Aufgaben, Pausen, statische Blöcke, Rest = Puffer
    let gaps: Interval[] = [{ start: workStart, end: workEnd }]
    for (const b of [...taskBlocks, ...staticWork, ...leisure]) gaps = subtract(gaps, b)
    if (locked === 'vergangen' || locked === 'feierabend') {
      for (const g of gaps) staticWork.push({ ...g, type: 'vergangen', label: locked === 'feierabend' ? 'Arbeitszeit vorbei' : 'Vergangen' })
    } else {
      // Freie Lücken; Teile in einem Puffer-Block tragen dessen Namen (z. B. „Restday · Puffer“)
      for (const g of gaps) {
        let rest: Interval[] = [g]
        for (const b of buffers) {
          for (const r of rest) {
            const start = Math.max(r.start, b.start)
            const end = Math.min(r.end, b.end)
            if (end - start >= 5) staticWork.push({ start, end, type: 'puffer', label: b.label })
          }
          rest = rest.flatMap((r) => subtract([r], b))
        }
        for (const r of rest) if (r.end - r.start >= 5) staticWork.push({ ...r, type: 'puffer', label: 'Puffer' })
      }
    }
    blocks.push(...taskBlocks, ...staticWork)
    // Feierabend
    let evening: Interval[] = [{ start: workEnd, end: sleep }]
    for (const l of leisure) evening = subtract(evening, l)
    for (const iv of evening) {
      if (iv.end - iv.start >= 5) blocks.push({ ...iv, type: 'feierabend', label: 'Feierabend · Abendessen, Mitbewohner, Freunde' })
    }
    blocks.push(...leisure)
  }
  blocks.push({ start: sleep, end: 24 * 60, type: 'schlaf', label: 'Schlaf' })

  // Duplikate (Freizeit doppelt) vermeiden und sortieren
  const seen = new Set<string>()
  const unique = blocks.filter((b) => {
    const k = `${b.start}-${b.end}-${b.type}-${b.taskId ?? b.label}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  unique.sort((a, b) => a.start - b.start || a.end - b.end)

  return { date, locked, workStart, workEnd, extended, blocks: unique, overflow, freeMin, plannedMin, dayTasks, carriedIds: carried }
}

// ---------- Konflikterkennung ----------

export type IssueKind =
  | 'wochenende'
  | 'feierabend'
  | 'vergangen'
  | 'ueberbucht'
  | 'deadline_verpasst'
  | 'deadline_gefaehrdet'
  | 'verdraengt'
  | 'abhaengigkeit'

export interface Issue {
  kind: IssueKind
  severity: 'hinweis' | 'konflikt'
  message: string
  taskId?: string
}

export type Suggestion =
  | { kind: 'move'; taskId: string; date: string; label: string }
  | { kind: 'release_weekend'; date: string; label: string }
  | { kind: 'extend_day'; date: string; workEnd: string; label: string }
  | { kind: 'backlog'; taskId: string; label: string }
  | { kind: 'keep'; label: string }

export interface FitResult {
  ok: boolean
  issues: Issue[]
  suggestions: Suggestion[]
}

function withTask(tasks: Task[], task: Task): Task[] {
  const idx = tasks.findIndex((t) => t.id === task.id)
  if (idx === -1) return [...tasks, task]
  const copy = [...tasks]
  copy[idx] = task
  return copy
}

function overflowIds(plan: DayPlan): Set<string> {
  return new Set(plan.overflow.map((o) => o.taskId))
}

/** Erster Tag ab `from`, an dem die Aufgabe vollständig passt, ohne andere zu verdrängen. */
export function findFreeDate(task: Task, tasks: Task[], ctx: PlanContext, now: Date, from: string, until?: string): string | undefined {
  const today = toDateStr(now)
  let d = from < today ? today : from
  for (let i = 0; i < 60; i++, d = addDays(d, 1)) {
    if (until && d > until) return undefined
    const others = tasks.filter((t) => t.id !== task.id)
    const before = buildDayPlan(d, others, ctx, now)
    if (before.locked) continue
    const after = buildDayPlan(d, withTask(others, { ...task, plannedDate: d }), ctx, now)
    const beforeOv = overflowIds(before)
    const newlyOver = after.overflow.filter((o) => !beforeOv.has(o.taskId))
    if (newlyOver.length === 0) return d
  }
  return undefined
}

export function nextWorkday(from: string, ctx: PlanContext): string {
  let d = addDays(from, 1)
  for (let i = 0; i < 14 && isWeekendLocked(d, ctx); i++) d = addDays(d, 1)
  return d
}

/** Standarddatum für neue Aufgaben: heute, wenn noch Arbeitszeit übrig ist, sonst nächster Arbeitstag. */
export function defaultPlannedDate(ctx: PlanContext, now: Date): string {
  const today = toDateStr(now)
  const { end } = workEndFor(today, ctx)
  if (!isWeekendLocked(today, ctx) && minutesOfDay(now) < end - 15) return today
  return nextWorkday(today, ctx)
}

/** Prüft, ob eine neue oder geänderte Aufgabe in den Plan passt. Verschiebt nichts. */
export function checkFit(task: Task, allTasks: Task[], ctx: PlanContext, now: Date): FitResult {
  const issues: Issue[] = []
  const suggestions: Suggestion[] = []
  const today = toDateStr(now)
  if (isDone(task)) return { ok: true, issues, suggestions }

  const tasks = withTask(allTasks, task)
  const hard = task.deadline && task.deadlineType === 'hart' ? task.deadline : undefined
  const addMove = (date: string | undefined, why = '') => {
    if (!date || date === task.plannedDate) return
    if (suggestions.some((s) => s.kind === 'move' && s.taskId === task.id && s.date === date)) return
    suggestions.push({ kind: 'move', taskId: task.id, date, label: `Auf ${formatDateShort(date)} legen${why}` })
  }

  if (hard && hard < today) {
    issues.push({ kind: 'deadline_verpasst', severity: 'konflikt', message: `Die harte Deadline (${formatDateShort(hard)}) liegt in der Vergangenheit.` })
  }

  if (!task.plannedDate) {
    if (hard && hard >= today) {
      const slot = findFreeDate(task, tasks, ctx, now, today, hard)
      if (!slot) {
        issues.push({ kind: 'deadline_gefaehrdet', severity: 'konflikt', message: `Bis zur harten Deadline (${formatDateShort(hard)}) ist kein freier Platz mehr.` })
      } else {
        issues.push({ kind: 'deadline_gefaehrdet', severity: 'hinweis', message: 'Aufgabe mit harter Deadline ist noch nicht eingeplant.' })
        addMove(slot, ' (passt vor der Deadline)')
      }
    }
    return finish()
  }

  const date = task.plannedDate
  if (date < today) {
    issues.push({ kind: 'vergangen', severity: 'konflikt', message: 'Das geplante Datum liegt in der Vergangenheit.' })
    addMove(findFreeDate(task, tasks, ctx, now, today, hard))
  }
  if (hard && date > hard) {
    issues.push({ kind: 'deadline_verpasst', severity: 'konflikt', message: `Geplant nach der harten Deadline (${formatDateShort(hard)}).` })
    addMove(findFreeDate(task, tasks, ctx, now, today, hard), ' (vor der Deadline)')
  }

  if (date >= today) {
    const others = tasks.filter((t) => t.id !== task.id)
    const before = buildDayPlan(date, others, ctx, now)
    const after = buildDayPlan(date, tasks, ctx, now)

    if (after.locked === 'wochenende') {
      issues.push({ kind: 'wochenende', severity: 'konflikt', message: `${formatDateShort(date)} ist Wochenende und gesperrt.` })
      addMove(findFreeDate(task, tasks, ctx, now, date, hard), ' (nächster freier Arbeitstag)')
      suggestions.push({ kind: 'release_weekend', date, label: `Wochenende am ${formatDateShort(date)} freigeben` })
    } else if (after.locked === 'feierabend') {
      issues.push({ kind: 'feierabend', severity: 'konflikt', message: `Feierabend: Die Arbeitszeit endet um ${fromMin(after.workEnd)}.` })
      addMove(findFreeDate(task, tasks, ctx, now, addDays(today, 1), hard))
      const latest = toMin(ctx.settings.latestExtendedEnd)
      if (minutesOfDay(now) + task.durationMin <= latest) {
        suggestions.push({ kind: 'extend_day', date, workEnd: ctx.settings.latestExtendedEnd, label: `Heute ausnahmsweise bis ${ctx.settings.latestExtendedEnd} arbeiten` })
      }
    } else {
      const mine = after.overflow.find((o) => o.taskId === task.id)
      const beforeOv = overflowIds(before)
      const displaced = after.overflow.filter((o) => o.taskId !== task.id && !beforeOv.has(o.taskId))
      if (mine) {
        issues.push({ kind: 'ueberbucht', severity: 'konflikt', message: `Passt an diesem Tag nicht mehr ins Arbeitsfenster (es fehlen ${mine.missingMin} min).` })
      }
      for (const d of displaced) {
        const other = tasks.find((t) => t.id === d.taskId)
        if (!other) continue
        const otherHard = other.deadline && other.deadlineType === 'hart' && other.deadline <= date
        issues.push({
          kind: otherHard ? 'deadline_gefaehrdet' : 'verdraengt',
          severity: otherHard ? 'konflikt' : 'hinweis',
          taskId: other.id,
          message: otherHard
            ? `„${other.title}“ (harte Deadline ${formatDateShort(other.deadline!)}) würde nicht mehr passen.`
            : `„${other.title}“ würde nicht mehr in den Tag passen.`,
        })
      }
      if (mine || displaced.length) {
        addMove(findFreeDate(task, tasks, ctx, now, addDays(date, 1), hard), ' (nächster freier Tag)')
        // Weniger wichtige Aufgabe ohne harte Deadline verschieben
        const candidates = orderTasks(after.dayTasks.filter((t) => !isDone(t) && t.id !== task.id))
          .reverse()
          .filter((t) => t.priority >= task.priority && !(t.deadline && t.deadlineType === 'hart' && t.deadline <= addDays(date, 1)))
        for (const c of candidates) {
          const without = tasks.map((t) => (t.id === c.id ? { ...t, plannedDate: undefined } : t))
          const test = buildDayPlan(date, without, ctx, now)
          // Nur vorschlagen, wenn danach die neue Aufgabe passt und nichts anderes verdrängt wird
          if (test.overflow.every((o) => o.taskId !== task.id && beforeOv.has(o.taskId))) {
            const target = findFreeDate(c, without, ctx, now, addDays(date, 1), c.deadline && c.deadlineType === 'hart' ? c.deadline : undefined)
            if (target) {
              suggestions.push({ kind: 'move', taskId: c.id, date: target, label: `„${c.title}“ auf ${formatDateShort(target)} verschieben` })
              break
            }
          }
        }
        const missing = (mine?.missingMin ?? 0) + displaced.reduce((s, d) => s + d.missingMin, 0)
        const neededEnd = Math.min(after.workEnd + missing + ctx.settings.breakMin, toMin(ctx.settings.latestExtendedEnd))
        if (neededEnd > after.workEnd) {
          const endStr = fromMin(Math.ceil(neededEnd / 15) * 15)
          suggestions.push({ kind: 'extend_day', date, workEnd: endStr, label: `Ausnahmsweise bis ${endStr} arbeiten (Feierabend verschieben)` })
        }
      }
    }
  }

  // Abhängigkeiten
  for (const depId of task.dependsOn) {
    const dep = tasks.find((t) => t.id === depId)
    if (!dep || isDone(dep)) continue
    if (!dep.plannedDate || dep.plannedDate > date) {
      issues.push({ kind: 'abhaengigkeit', severity: 'hinweis', taskId: dep.id, message: `Hängt von „${dep.title}“ ab, das ${dep.plannedDate ? 'später' : 'noch nicht'} geplant ist.` })
    }
  }

  return finish()

  function finish(): FitResult {
    if (issues.length) {
      if (task.plannedDate) suggestions.push({ kind: 'backlog', taskId: task.id, label: 'Ohne Datum in den Backlog' })
      suggestions.push({ kind: 'keep', label: 'Trotzdem so übernehmen' })
    }
    return { ok: issues.length === 0, issues, suggestions }
  }
}

// ---------- Deadlines ----------

export interface DeadlineEntry {
  task: Task
  daysLeft: number
  risk?: string
}

export function upcomingDeadlines(tasks: Task[], ctx: PlanContext, now: Date, horizonDays = 30): DeadlineEntry[] {
  const today = toDateStr(now)
  const limit = addDays(today, horizonDays)
  const planCache = new Map<string, DayPlan>()
  const planFor = (d: string) => {
    if (!planCache.has(d)) planCache.set(d, buildDayPlan(d, tasks, ctx, now))
    return planCache.get(d)!
  }
  return tasks
    .filter((t) => !isDone(t) && t.deadline && t.deadline <= limit)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1))
    .map((t) => {
      const dl = t.deadline!
      const daysLeft = daysBetween(today, dl)
      let risk: string | undefined
      const isHard = t.deadlineType === 'hart'
      if (dl < today) risk = 'überfällig'
      else if (!t.plannedDate) risk = isHard ? 'nicht eingeplant' : undefined
      else if (t.plannedDate > dl) risk = 'nach der Deadline geplant'
      else {
        const d = t.plannedDate < today ? today : t.plannedDate
        const plan = planFor(d)
        if (plan.locked === 'wochenende') risk = 'am Wochenende geplant'
        else if (plan.locked === 'feierabend' || plan.overflow.some((o) => o.taskId === t.id)) {
          if (dl === d) risk = 'passt heute nicht mehr'
          else if (isHard && !findFreeDate(t, tasks, ctx, now, addDays(d, 1), dl)) risk = 'kein Platz bis zur Deadline'
          else risk = 'neu einplanen'
        }
      }
      return { task: t, daysLeft, risk }
    })
}
