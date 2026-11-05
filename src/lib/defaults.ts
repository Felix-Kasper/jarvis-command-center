import type { Settings } from '../types'

export const DEFAULT_CATEGORIES = [
  'Bachelor',
  'Nebenprojekt',
  'Jobsuche',
  'Gesundheit/Gym',
  'Persönliches',
  'Soziales',
  'Freizeit',
  'Finanzen',
]

export const DEFAULT_SETTINGS: Settings = {
  wake: '07:00',
  workStart: '08:00',
  workEnd: '18:00',
  sleep: '22:30',
  lunchStart: '11:30',
  lunchEnd: '12:30',
  focusMaxMin: 90,
  breakMin: 15,
  latestExtendedEnd: '22:00',
  weekendLocked: true,
  categories: DEFAULT_CATEGORIES,
  leisureBlocks: [], // persönliche Blöcke (z. B. Sport) liegen nur in den gespeicherten Einstellungen
}

const CATEGORY_COLORS: Record<string, string> = {
  Bachelor: '#7c9cff',
  'Nebenprojekt': '#c084fc',
  Jobsuche: '#34d399',
  'Gesundheit/Gym': '#fb7185',
  Persönliches: '#fbbf24',
  Soziales: '#f472b6',
  Freizeit: '#22d3ee',
  'Finanzen/Investments': '#a3e635',
  Finanzen: '#a3e635',
}

export function categoryColor(cat: string): string {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat]
  let h = 0
  for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 70% 65%)`
}

export const PRIORITY_LABEL: Record<number, string> = { 1: 'Hoch', 2: 'Mittel', 3: 'Niedrig' }
