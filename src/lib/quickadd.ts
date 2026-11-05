// Schnell-Eingabe: „Lebenslauf anpassen 90m #Jobsuche !1 morgen“

import type { Priority } from '../types'
import { addDays } from './time'

export interface QuickParse {
  title: string
  durationMin?: number
  category?: string
  priority?: Priority
  plannedDate?: string | null // null = Backlog
}

export function parseQuickAdd(input: string, categories: string[], today: string): QuickParse {
  let text = ` ${input.trim()} `
  const out: QuickParse = { title: '' }

  const dur = text.match(/\s(\d{1,3})\s?(m|min|h|std)(?=\s)/i)
  if (dur) {
    const v = Number(dur[1])
    out.durationMin = /^(h|std)$/i.test(dur[2]) ? v * 60 : v
    text = text.replace(dur[0], ' ')
  }
  const prio = text.match(/\s!([123])(?=\s)/)
  if (prio) {
    out.priority = Number(prio[1]) as Priority
    text = text.replace(prio[0], ' ')
  }
  const cat = text.match(/\s#([^\s]+)(?=\s)/)
  if (cat) {
    const q = cat[1].toLowerCase()
    const found = categories.find((c) => c.toLowerCase() === q) ?? categories.find((c) => c.toLowerCase().startsWith(q))
    if (found) {
      out.category = found
      text = text.replace(cat[0], ' ')
    }
  }
  const day = text.match(/\s(heute|morgen|übermorgen|backlog)(?=\s)/i)
  if (day) {
    const w = day[1].toLowerCase()
    out.plannedDate = w === 'heute' ? today : w === 'morgen' ? addDays(today, 1) : w === 'übermorgen' ? addDays(today, 2) : null
    text = text.replace(day[0], ' ')
  }
  out.title = text.replace(/\s+/g, ' ').trim()
  return out
}
