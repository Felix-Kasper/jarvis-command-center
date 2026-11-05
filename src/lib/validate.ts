// Validierung von Aufgaben (Formular, Import, Daten vom Server).

import type { Task } from '../types'
import { isValidDateStr, isValidTimeStr, toMin } from './time'

export type TaskErrors = Partial<Record<keyof Task | 'form', string>>

const STATUSES = ['offen', 'in_arbeit', 'erledigt']
const ENERGIES = ['hoch', 'mittel', 'niedrig']

export function hasCycle(taskId: string, dependsOn: string[], all: Task[]): boolean {
  const byId = new Map(all.map((t) => [t.id, t]))
  const stack = [...dependsOn]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === taskId) return true
    if (seen.has(id)) continue
    seen.add(id)
    const t = byId.get(id)
    if (t) stack.push(...t.dependsOn)
  }
  return false
}

export function validateTask(t: Task, all: Task[]): TaskErrors {
  const e: TaskErrors = {}
  const title = (t.title ?? '').trim()
  if (!title) e.title = 'Bitte einen Titel eingeben.'
  else if (title.length > 140) e.title = 'Maximal 140 Zeichen.'
  if (!t.category || !t.category.trim()) e.category = 'Bitte eine Kategorie wählen.'
  else if (t.category.length > 40) e.category = 'Maximal 40 Zeichen.'
  if (![1, 2, 3].includes(t.priority)) e.priority = 'Ungültige Priorität.'
  if (!Number.isInteger(t.durationMin) || t.durationMin < 5 || t.durationMin > 720) e.durationMin = 'Dauer zwischen 5 und 720 Minuten.'
  if (t.deadline !== undefined && !isValidDateStr(t.deadline)) e.deadline = 'Ungültiges Datum.'
  if (t.plannedDate !== undefined && !isValidDateStr(t.plannedDate)) e.plannedDate = 'Ungültiges Datum.'
  if (t.fixedStart !== undefined) {
    if (!isValidTimeStr(t.fixedStart)) e.fixedStart = 'Ungültige Uhrzeit.'
    else if (!t.plannedDate) e.fixedStart = 'Eine feste Uhrzeit braucht ein geplantes Datum.'
    else if (toMin(t.fixedStart) + (t.durationMin || 0) > 24 * 60) e.fixedStart = 'Der Block reicht über Mitternacht.'
  }
  if (t.deadlineType !== 'hart' && t.deadlineType !== 'weich') e.deadlineType = 'Ungültiger Deadline-Typ.'
  if (!STATUSES.includes(t.status)) e.status = 'Ungültiger Status.'
  if (!ENERGIES.includes(t.energy)) e.energy = 'Ungültiger Energiebedarf.'
  if ((t.description ?? '').length > 2000) e.description = 'Maximal 2000 Zeichen.'
  if ((t.notes ?? '').length > 4000) e.notes = 'Maximal 4000 Zeichen.'
  if (!Array.isArray(t.dependsOn)) e.dependsOn = 'Ungültige Abhängigkeiten.'
  else if (t.dependsOn.includes(t.id)) e.dependsOn = 'Eine Aufgabe kann nicht von sich selbst abhängen.'
  else if (hasCycle(t.id, t.dependsOn, all.filter((x) => x.id !== t.id))) e.dependsOn = 'Diese Abhängigkeit würde einen Kreis bilden.'
  return e
}

/** Strukturprüfung für Daten aus Backups oder vom Server. */
export function isTaskLike(x: unknown): x is Task {
  if (!x || typeof x !== 'object') return false
  const t = x as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.title === 'string' &&
    typeof t.category === 'string' &&
    (t.priority === 1 || t.priority === 2 || t.priority === 3) &&
    typeof t.durationMin === 'number' &&
    typeof t.status === 'string' &&
    STATUSES.includes(t.status) &&
    typeof t.createdAt === 'string'
  )
}

/** Fehlende optionale Felder ergänzen (z. B. bei älteren Datenständen). */
export function normalizeTask(t: Task): Task {
  return {
    ...t,
    deadlineType: t.deadlineType === 'hart' ? 'hart' : 'weich',
    energy: ENERGIES.includes(t.energy) ? t.energy : 'mittel',
    dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter((d) => typeof d === 'string') : [],
    deadline: isValidDateStr(t.deadline) ? t.deadline : undefined,
    plannedDate: isValidDateStr(t.plannedDate) ? t.plannedDate : undefined,
    fixedStart: isValidTimeStr(t.fixedStart) && isValidDateStr(t.plannedDate) ? t.fixedStart : undefined,
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
