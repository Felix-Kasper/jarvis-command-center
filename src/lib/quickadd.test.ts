import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quickadd'
import { DEFAULT_CATEGORIES } from './defaults'

describe('Schnell-Eingabe', () => {
  it('erkennt Dauer, Kategorie, Priorität und Tag', () => {
    const r = parseQuickAdd('Lebenslauf anpassen 90m #job !1 morgen', DEFAULT_CATEGORIES, '2026-10-28')
    expect(r).toEqual({ title: 'Lebenslauf anpassen', durationMin: 90, category: 'Jobsuche', priority: 1, plannedDate: '2026-10-29' })
  })

  it('Stunden und Backlog', () => {
    const r = parseQuickAdd('Website bauen 2h #neben backlog', DEFAULT_CATEGORIES, '2026-10-28')
    expect(r.durationMin).toBe(120)
    expect(r.category).toBe('Nebenprojekt')
    expect(r.plannedDate).toBeNull()
  })

  it('lässt normalen Text in Ruhe', () => {
    const r = parseQuickAdd('Mama anrufen', DEFAULT_CATEGORIES, '2026-10-28')
    expect(r).toEqual({ title: 'Mama anrufen' })
  })
})
