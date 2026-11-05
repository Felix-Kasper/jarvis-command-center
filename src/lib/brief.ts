// Morgen-Briefing: kompakte Tagesübersicht (Idee aus OpenJarvis „morning digest“,
// bewusst ohne KI, ohne Mail-/Kalenderzugriff und ohne zusätzliche Aufgaben).

import type { Goal } from '../types'
import { isDone, orderTasks, type DayPlan } from './planner'
import { daysBetween, toDateStr } from './time'

/** Schlägt die drei wichtigsten offenen Aufgaben des Tages als Tagesziele vor (bevorzugt solche, die in den Tag passen). */
export function suggestGoals(plan: DayPlan): Goal[] {
  const open = orderTasks(plan.dayTasks.filter((t) => !isDone(t)))
  const over = new Set(plan.overflow.map((o) => o.taskId))
  const ranked = [...open.filter((t) => !over.has(t.id)), ...open.filter((t) => over.has(t.id))]
  const goals = ranked.slice(0, 3).map((t) => ({ text: t.title.slice(0, 120), done: false }))
  while (goals.length < 3) goals.push({ text: '', done: false })
  return goals
}

/** Tage seit dem letzten manuellen Backup, oder null wenn noch nie. */
export function daysSinceBackup(lastExport: string | undefined, today: string): number | null {
  if (!lastExport) return null
  return daysBetween(toDateStr(new Date(lastExport)), today)
}

export const BACKUP_REMINDER_DAYS = 7
