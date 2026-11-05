// Persönliches Briefing („Newsletter“) des Personal Managers.
// Der Agent schreibt Ausgaben in agent_reports (agent_id 'personal'), die App zeigt sie oben im
// Planer und speichert Reaktionen in news_feedback – daraus lernt der Agent beim nächsten Lauf.

import { supabase } from './supabase'
import { fromMin, isValidDateStr, isValidTimeStr, toMin } from './time'
import type { LeisureBlock } from '../types'

export type Reaction = 'mag' | 'nicht' | 'gemerkt' | 'eingeplant'
export type SectionId = 'aktien' | 'fuer_dich' | 'events' | 'konzerte' | 'tipps'

export interface BriefingItem {
  key: string
  section: string
  title: string
  summary?: string
  url?: string
  source?: string
  date?: string // YYYY-MM-DD
  start?: string // HH:MM
  end?: string // HH:MM
  venue?: string
  city?: string
  price?: string
  tag?: string
  artist?: string
}

export interface BriefingSection {
  id: string
  title: string
  items: BriefingItem[]
}

export interface Briefing {
  id: string
  period: string
  title: string
  headline: string
  overview: string
  createdAt: string
  asOf?: string
  mode?: string
  sections: BriefingSection[]
  sources: { title?: string; url: string }[]
}

export interface BriefingAgent {
  status: string
  statusNote: string | null
  scheduleText: string | null
  nextRunAt: string | null
}

export interface BriefingData {
  issues: Briefing[] // neueste zuerst
  feedback: Record<string, Reaction>
  agent: BriefingAgent | null
  focus: string
  depotHeadline: string | null
}

export const SECTION_ORDER: string[] = ['aktien', 'fuer_dich', 'events', 'konzerte', 'tipps']
export const SECTION_TITLES: Record<string, string> = {
  aktien: 'Aktien-News',
  fuer_dich: 'Für dich',
  events: 'Events – nächste 7 Tage',
  konzerte: 'Konzerte für dich',
  tipps: 'Vorschläge',
}
const REACTIONS: Reaction[] = ['mag', 'nicht', 'gemerkt', 'eingeplant']

// ---------- defensives Einlesen ----------

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown, max: number): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  return s ? (s.length > max ? s.slice(0, max - 1) + '…' : s) : undefined
}
export const safeUrl = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  try {
    const u = new URL(v.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined
  } catch {
    return undefined
  }
}

/** Stabiler Schlüssel wie im Agenten-Prompt: abschnitt|titel|datum, klein, ohne Sonderzeichen. */
export function itemKey(section: string, title: string, date?: string): string {
  return `${section}|${title}|${date ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9äöüß|\- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

function parseItem(raw: unknown, section: string): BriefingItem | null {
  const o = obj(raw)
  const title = text(o.title, 200)
  if (!title) return null
  const date = isValidDateStr(o.date) ? o.date : undefined
  const start = isValidTimeStr(o.start) ? o.start : undefined
  const end = isValidTimeStr(o.end) ? o.end : undefined
  return {
    key: text(o.key, 200)?.toLowerCase() ?? itemKey(section, title, date),
    section,
    title,
    summary: text(o.summary, 500),
    url: safeUrl(o.url),
    source: text(o.source, 80),
    date,
    start,
    end,
    venue: text(o.venue, 80),
    city: text(o.city, 60),
    price: text(o.price, 60),
    tag: text(o.tag, 40),
    artist: text(o.artist, 80),
  }
}

const sortKey = (i: BriefingItem) => `${i.date ?? '9999-99-99'} ${i.start ?? '99:99'}`

export function parseSections(raw: unknown): BriefingSection[] {
  const merged = new Map<string, BriefingSection>()
  for (const s of arr(raw)) {
    const o = obj(s)
    const id = text(o.id, 40)?.toLowerCase()
    if (!id) continue
    const sec = merged.get(id) ?? { id, title: text(o.title, 80) ?? SECTION_TITLES[id] ?? id, items: [] }
    const seen = new Set(sec.items.map((i) => i.key))
    for (const it of arr(o.items)) {
      const item = parseItem(it, id)
      if (item && !seen.has(item.key) && sec.items.length < 30) {
        seen.add(item.key)
        sec.items.push(item)
      }
    }
    merged.set(id, sec)
  }
  const out = [...merged.values()].filter((s) => s.items.length > 0)
  for (const s of out) if (s.id === 'events' || s.id === 'konzerte') s.items.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const rank = (id: string) => (SECTION_ORDER.includes(id) ? SECTION_ORDER.indexOf(id) : SECTION_ORDER.length)
  return out.sort((a, b) => rank(a.id) - rank(b.id))
}

export function parseBriefing(row: unknown): Briefing | null {
  const o = obj(row)
  const id = text(o.id, 80)
  if (!id) return null
  const d = obj(o.data)
  const sections = parseSections(d.sections)
  const headline = text(d.headline, 300) ?? text(o.summary, 300) ?? ''
  return {
    id,
    period: text(o.period, 40) ?? '',
    title: text(o.title, 120) ?? 'Briefing',
    headline,
    overview: typeof o.content_md === 'string' ? o.content_md.slice(0, 4000) : '',
    createdAt: text(o.created_at, 60) ?? '',
    asOf: text(d.as_of, 20),
    mode: text(d.mode, 20),
    sections,
    sources: arr(d.sources)
      .map((x) => {
        const s = obj(x)
        const url = safeUrl(s.url)
        return url ? { url, title: text(s.title, 120) } : null
      })
      .filter((x): x is { url: string; title: string | undefined } => x !== null)
      .slice(0, 40),
  }
}

// ---------- Laden und Speichern ----------

export async function loadBriefing(): Promise<BriefingData> {
  if (!supabase) throw new Error('Synchronisation ist nicht eingerichtet.')
  const [r, f, a, i, d] = await Promise.all([
    supabase.from('agent_reports').select('id, period, title, summary, data, content_md, created_at').eq('agent_id', 'personal').order('created_at', { ascending: false }).limit(6),
    supabase.from('news_feedback').select('item_key, reaction').order('created_at', { ascending: false }).limit(500),
    supabase.from('agents').select('status, status_note, schedule_text, next_run_at').eq('id', 'personal').limit(1),
    supabase.from('agent_instructions').select('focus').eq('agent_id', 'personal').limit(1),
    supabase.from('agent_reports').select('data, summary').eq('agent_id', 'depot').order('created_at', { ascending: false }).limit(1),
  ])
  if (r.error) throw new Error(r.error.message)
  const feedback: Record<string, Reaction> = {}
  for (const row of f.data ?? []) {
    const o = obj(row)
    const key = typeof o.item_key === 'string' ? o.item_key : ''
    if (key && REACTIONS.includes(o.reaction as Reaction) && !(key in feedback)) feedback[key] = o.reaction as Reaction
  }
  const ag = obj((a.data ?? [])[0])
  const depot = obj((d.data ?? [])[0])
  return {
    issues: (r.data ?? []).map(parseBriefing).filter((x): x is Briefing => x !== null),
    feedback,
    agent: ag.status
      ? { status: String(ag.status), statusNote: text(ag.status_note, 200) ?? null, scheduleText: text(ag.schedule_text, 60) ?? null, nextRunAt: text(ag.next_run_at, 60) ?? null }
      : null,
    focus: text(obj((i.data ?? [])[0]).focus, 2000) ?? '',
    depotHeadline: text(obj(depot.data).headline, 300) ?? text(depot.summary, 300) ?? null,
  }
}

/** Reaktion speichern (null = zurücknehmen). */
export async function setReaction(item: BriefingItem, reaction: Reaction | null, reportId: string): Promise<void> {
  if (!supabase) throw new Error('Synchronisation ist nicht eingerichtet.')
  if (!reaction) {
    const { error } = await supabase.from('news_feedback').delete().eq('item_key', item.key)
    if (error) throw new Error(error.message)
    return
  }
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Nicht angemeldet.')
  const { error } = await supabase
    .from('news_feedback')
    .upsert({ user_id: userId, item_key: item.key, report_id: reportId, section: item.section, title: item.title.slice(0, 200), reaction }, { onConflict: 'user_id,item_key' })
  if (error) throw new Error(error.message)
}

// ---------- Auswertung ----------

/** Stabile ID für einen Freizeitblock aus einem Briefing-Eintrag (verhindert Doppelbuchung). */
export function leisureId(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return `brief-${(h >>> 0).toString(36)}`
}

/** Event → geschützter Freizeitblock im Planer. Ohne Datum nicht möglich; ohne Uhrzeit 19:00, Dauer 2 h. */
export function eventToLeisure(item: BriefingItem): LeisureBlock | null {
  if (!item.date) return null
  const start = item.start ?? '19:00'
  const startMin = toMin(start)
  let end = item.end && toMin(item.end) > startMin ? item.end : fromMin(Math.min(startMin + 120, 23 * 60 + 59))
  if (toMin(end) <= startMin) end = '23:59'
  if (startMin >= 23 * 60 + 59) return null
  const where = item.venue ?? item.city
  return { id: leisureId(item.key), title: `${item.title}${where ? ` · ${where}` : ''}`.slice(0, 80), fromDate: item.date, toDate: item.date, start, end }
}

/** Sichtbare Einträge: ohne „Nicht für mich“ und ohne vergangene Termine. */
export function visibleItems(items: BriefingItem[], feedback: Record<string, Reaction>, today: string): BriefingItem[] {
  return items.filter((i) => feedback[i.key] !== 'nicht' && !(i.date && i.date < today && (i.section === 'events' || i.section === 'konzerte' || i.section === 'tipps')))
}

/** Merkliste über die letzten Ausgaben: gemerkt oder eingeplant, neueste Fassung, nach Datum. */
export function savedItems(issues: Briefing[], feedback: Record<string, Reaction>, today: string): BriefingItem[] {
  const out = new Map<string, BriefingItem>()
  for (const issue of issues)
    for (const s of issue.sections)
      for (const i of s.items) {
        const r = feedback[i.key]
        if ((r === 'gemerkt' || r === 'eingeplant') && !out.has(i.key) && !(i.date && i.date < today)) out.set(i.key, i)
      }
  return [...out.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
}
