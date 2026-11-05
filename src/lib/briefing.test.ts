import { describe, expect, it } from 'vitest'
import { eventToLeisure, itemKey, leisureId, parseBriefing, parseSections, safeUrl, savedItems, visibleItems, type Briefing } from './briefing'

describe('Briefing einlesen', () => {
  it('führt Abschnitte mit gleicher id zusammen, sortiert Events nach Datum und verwirft Unsinn', () => {
    const s = parseSections([
      { id: 'events', title: 'Stadt', items: [{ title: 'Comedy', date: '2026-11-03', start: '20:00', url: 'javascript:alert(1)' }] },
      { id: 'aktien', items: [{ title: 'Beta Sport Zahlen', url: 'https://example.com/a', date: 'gestern' }, { summary: 'ohne Titel' }] },
      { id: 'events', items: [{ title: 'Konzert', date: '2026-11-01', start: '19:30', end: '25:00', key: 'EVENTS|Konzert|2026-11-01' }, { title: 'Comedy', date: '2026-11-03' }] },
      { id: 'leer', items: [] },
    ])
    expect(s.map((x) => x.id)).toEqual(['aktien', 'events'])
    const ev = s[1]
    expect(ev.items.map((i) => i.title)).toEqual(['Konzert', 'Comedy'])
    expect(ev.items[0].key).toBe('events|konzert|2026-11-01')
    expect(ev.items[0].end).toBeUndefined()
    expect(ev.items[1].url).toBeUndefined()
    expect(s[0].items).toHaveLength(1)
    expect(s[0].items[0].date).toBeUndefined()
    expect(s[0].title).toBe('Aktien-News')
  })

  it('liest eine Ausgabe defensiv', () => {
    const b = parseBriefing({ id: 'r1', period: '02.11.2026', summary: 'Kurz', data: { headline: 'Band X in Wien!', mode: 'kurz', sources: [{ url: 'https://a.at' }, { url: 'ftp://x' }] }, content_md: '## Briefing\nText', created_at: '2026-11-02T05:30:00Z' })
    expect(b?.headline).toBe('Band X in Wien!')
    expect(b?.sources).toHaveLength(1)
    expect(b?.sections).toEqual([])
    expect(parseBriefing({ data: {} })).toBeNull()
  })

  it('erzeugt stabile Schlüssel und lässt nur http(s)-Links zu', () => {
    expect(itemKey('events', 'Stand-up: Hazel Brugger!', '2026-11-05')).toBe('events|stand-up hazel brugger|2026-11-05')
    expect(safeUrl('https://x.at/a b')).toBe('https://x.at/a%20b')
    expect(safeUrl('data:text/html,hi')).toBeUndefined()
  })
})

describe('Briefing auswerten', () => {
  const issue = (id: string, items: { key: string; title: string; date?: string }[]): Briefing => ({
    id,
    period: '',
    title: '',
    headline: '',
    overview: '',
    createdAt: '',
    sources: [],
    sections: [{ id: 'events', title: 'E', items: items.map((i) => ({ ...i, section: 'events' })) }],
  })

  it('blendet „Nicht für mich“ und Vergangenes aus', () => {
    const items = issue('a', [
      { key: 'a', title: 'A', date: '2026-10-29' },
      { key: 'b', title: 'B', date: '2026-10-30' },
      { key: 'c', title: 'C', date: '2026-11-01' },
    ]).sections[0].items
    expect(visibleItems(items, { c: 'nicht' }, '2026-10-30').map((i) => i.key)).toEqual(['b'])
  })

  it('sammelt die Merkliste über mehrere Ausgaben ohne Doppelte', () => {
    const issues = [issue('neu', [{ key: 'x', title: 'X neu', date: '2026-11-04' }]), issue('alt', [{ key: 'x', title: 'X alt', date: '2026-11-04' }, { key: 'y', title: 'Y', date: '2026-11-02' }, { key: 'z', title: 'Z', date: '2026-10-01' }])]
    const saved = savedItems(issues, { x: 'gemerkt', y: 'eingeplant', z: 'gemerkt' }, '2026-10-30')
    expect(saved.map((i) => i.title)).toEqual(['Y', 'X neu'])
  })

  it('macht aus einem Event einen Freizeitblock', () => {
    const base = { key: 'events|konzert|2026-11-01', section: 'events', title: 'Konzert', date: '2026-11-01', venue: 'Club Y' }
    expect(eventToLeisure({ ...base, start: '20:00' })).toEqual({ id: leisureId(base.key), title: 'Konzert · Club Y', fromDate: '2026-11-01', toDate: '2026-11-01', start: '20:00', end: '22:00' })
    expect(eventToLeisure({ ...base, start: '22:30' })?.end).toBe('23:59')
    expect(eventToLeisure({ ...base, start: '19:00', end: '23:00' })?.end).toBe('23:00')
    expect(eventToLeisure({ ...base, start: '19:00', end: '18:00' })?.end).toBe('21:00')
    expect(eventToLeisure(base)?.start).toBe('19:00')
    expect(eventToLeisure({ ...base, date: undefined })).toBeNull()
    expect(leisureId('a')).toBe(leisureId('a'))
    expect(leisureId('a')).not.toBe(leisureId('b'))
  })
})
