// Optionale, neutrale Startaufgaben für ein leeres JARVIS.

import type { Task } from '../types'
import { newId } from './validate'
import { addDays } from './time'
import { nextWorkday, defaultPlannedDate, type PlanContext } from './planner'

type Seed = Pick<Task, 'title' | 'category' | 'priority' | 'durationMin' | 'energy'> & Partial<Task> & { day: 0 | 1 }

const SEEDS: Seed[] = [
  { day: 0, title: 'Wochenziele festlegen', category: 'Persönliches', priority: 1, durationMin: 20, energy: 'niedrig' },
  { day: 0, title: 'Lernblock: schwierigstes Thema', category: 'Bachelor', priority: 1, durationMin: 120, energy: 'hoch' },
  { day: 0, title: 'Lernplan bis zur Prüfung', category: 'Bachelor', priority: 1, durationMin: 45, energy: 'mittel' },
  { day: 0, title: 'Angebot und Preise ausarbeiten', category: 'Nebenprojekt', priority: 2, durationMin: 60, energy: 'hoch' },
  { day: 0, title: 'Zielunternehmen auflisten', category: 'Jobsuche', priority: 2, durationMin: 60, energy: 'mittel' },
  { day: 0, title: 'Training', category: 'Gesundheit/Gym', priority: 2, durationMin: 60, energy: 'mittel' },
  { day: 1, title: 'Akquise-E-Mail entwerfen', category: 'Nebenprojekt', priority: 2, durationMin: 45, energy: 'mittel' },
  { day: 1, title: 'Lebenslauf zuschneiden', category: 'Jobsuche', priority: 2, durationMin: 90, energy: 'hoch' },
]

export function makeStarterTasks(ctx: PlanContext, now: Date): Task[] {
  const first = defaultPlannedDate(ctx, now)
  const second = nextWorkday(first, ctx)
  const created = now.toISOString()
  const tasks = SEEDS.map(({ day, ...s }, i) => ({
    id: newId(),
    description: undefined,
    deadlineType: 'weich' as const,
    status: 'offen' as const,
    dependsOn: [],
    ...s,
    plannedDate: day === 0 ? first : second,
    createdAt: new Date(new Date(created).getTime() + i).toISOString(),
  }))
  // Lernblock hängt vom Lernplan ab
  const plan = tasks.find((t) => t.title.startsWith('Lernplan'))
  const block = tasks.find((t) => t.title.startsWith('Lernblock'))
  if (plan && block) block.dependsOn = [plan.id]
  // Die Prüfung als Platzhalter-Deadline (unbestätigt, weich)
  const confirm = tasks.find((t) => t.title.startsWith('Prüfungstermin'))
  if (confirm) {
    confirm.deadline = addDays(first, 2)
  }
  return tasks
}
