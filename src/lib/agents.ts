// Agenten-Cockpit: Daten aus Supabase (Agenten-Status, Reports, Depotpositionen).
// Die Agenten selbst laufen als geplante Claude-Aufgaben und schreiben ihre Ergebnisse
// in diese Tabellen. Die App liest nur (Row Level Security: nur eigene Daten).

import { supabase } from './supabase'

export type AgentStatus = 'bereit' | 'arbeitet' | 'fehler' | 'pausiert'
export type SignalLevel = 'positiv' | 'neutral' | 'negativ'

export interface Agent {
  id: string
  name: string
  role: string
  status: AgentStatus
  status_note: string | null
  schedule_text: string | null
  last_run_at: string | null
  next_run_at: string | null
  updated_at: string
}

export interface Signal {
  name: string
  reason: string
}

export interface PositionSignal {
  name: string
  signal?: SignalLevel
  consensus?: string
  price_target?: string
  insider?: string
  sentiment?: string
  next_event?: string
  note?: string
}

export interface Candidate {
  name: string
  isin?: string
  why?: string
  metrics?: string
  risks?: string
}

export interface Source {
  title?: string
  url: string
  date?: string
}

export interface Change {
  name: string
  change: string
}

export interface Decision {
  name: string
  what: string
  deadline?: string
  options?: string
}

export interface ReportData {
  as_of?: string
  mode?: string
  headline?: string
  changes: Change[]
  decisions: Decision[]
  outlook?: string
  market_context?: string
  positions: PositionSignal[]
  top_positive: Signal[]
  top_negative: Signal[]
  candidates: Candidate[]
  risks: string[]
  sources: Source[]
}

export interface AgentReport {
  id: string
  agent_id: string
  period: string
  title: string
  summary: string
  data: ReportData
  content_md: string
  created_at: string
}

export interface Position {
  id: string
  account: string
  name: string
  wkn: string | null
  isin: string | null
  ticker: string | null
  asset_type: string
  quantity: number | null
  avg_buy_price_eur: number | null
  buy_value_eur: number | null
  market_value_eur: number | null
  value_as_of: string | null
  notes: string | null
}

export interface Cockpit {
  agents: Agent[]
  reports: AgentReport[]
  positions: Position[]
}

// ---------- defensives Einlesen (Agenten-Ausgaben können abweichen) ----------

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined)
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

function level(v: unknown): SignalLevel | undefined {
  const s = str(v)?.toLowerCase()
  if (!s) return undefined
  if (s.startsWith('pos') || s === 'stark' || s === 'grün') return 'positiv'
  if (s.startsWith('neg') || s === 'schwach' || s === 'rot') return 'negativ'
  return 'neutral'
}

export function parseReportData(raw: unknown): ReportData {
  const d = obj(raw)
  const signals = (v: unknown): Signal[] =>
    arr(v)
      .map((x) => {
        const o = obj(x)
        const name = str(o.name)
        return name ? { name, reason: str(o.reason) ?? '' } : null
      })
      .filter((x): x is Signal => x !== null)
  return {
    as_of: str(d.as_of),
    mode: str(d.mode),
    headline: str(d.headline),
    changes: arr(d.changes)
      .map((x): Change | null => {
        const o = obj(x)
        const change = str(o.change)
        return change ? { name: str(o.name) ?? '', change } : null
      })
      .filter((x): x is Change => x !== null),
    decisions: arr(d.decisions)
      .map((x): Decision | null => {
        const o = obj(x)
        const name = str(o.name)
        const what = str(o.what)
        return name && what ? { name, what, deadline: str(o.deadline), options: str(o.options) } : null
      })
      .filter((x): x is Decision => x !== null),
    outlook: str(d.outlook),
    market_context: str(d.market_context),
    positions: arr(d.positions)
      .map((x): PositionSignal | null => {
        const o = obj(x)
        const name = str(o.name)
        if (!name) return null
        return {
          name,
          signal: level(o.signal),
          consensus: str(o.consensus),
          price_target: str(o.price_target),
          insider: str(o.insider),
          sentiment: str(o.sentiment),
          next_event: str(o.next_event),
          note: str(o.note),
        }
      })
      .filter((x): x is PositionSignal => x !== null),
    top_positive: signals(d.top_positive),
    top_negative: signals(d.top_negative),
    candidates: arr(d.candidates)
      .map((x): Candidate | null => {
        const o = obj(x)
        const name = str(o.name)
        return name ? { name, isin: str(o.isin), why: str(o.why), metrics: str(o.metrics), risks: str(o.risks) } : null
      })
      .filter((x): x is Candidate => x !== null),
    risks: arr(d.risks).map(str).filter((x): x is string => !!x),
    sources: arr(d.sources)
      .map((x): Source | null => {
        const o = obj(x)
        const url = str(o.url)
        return url && /^https?:\/\//i.test(url) ? { url, title: str(o.title), date: str(o.date) } : null
      })
      .filter((x): x is Source => x !== null),
  }
}

const STATUSES: AgentStatus[] = ['bereit', 'arbeitet', 'fehler', 'pausiert']

function parseAgent(raw: unknown): Agent | null {
  const o = obj(raw)
  const id = str(o.id)
  const name = str(o.name)
  if (!id || !name) return null
  const status = STATUSES.includes(o.status as AgentStatus) ? (o.status as AgentStatus) : 'bereit'
  return {
    id,
    name,
    role: str(o.role) ?? '',
    status,
    status_note: str(o.status_note) ?? null,
    schedule_text: str(o.schedule_text) ?? null,
    last_run_at: str(o.last_run_at) ?? null,
    next_run_at: str(o.next_run_at) ?? null,
    updated_at: str(o.updated_at) ?? '',
  }
}

function parseReport(raw: unknown): AgentReport | null {
  const o = obj(raw)
  const id = str(o.id)
  if (!id) return null
  return {
    id,
    agent_id: str(o.agent_id) ?? '',
    period: str(o.period) ?? '',
    title: str(o.title) ?? 'Report',
    summary: str(o.summary) ?? '',
    data: parseReportData(o.data),
    content_md: typeof o.content_md === 'string' ? o.content_md : '',
    created_at: str(o.created_at) ?? '',
  }
}

function parsePosition(raw: unknown): Position | null {
  const o = obj(raw)
  const id = str(o.id)
  const name = str(o.name)
  if (!id || !name) return null
  return {
    id,
    name,
    account: str(o.account) ?? '',
    wkn: str(o.wkn) ?? null,
    isin: str(o.isin) ?? null,
    ticker: str(o.ticker) ?? null,
    asset_type: str(o.asset_type) ?? 'Sonstiges',
    quantity: num(o.quantity),
    avg_buy_price_eur: num(o.avg_buy_price_eur),
    buy_value_eur: num(o.buy_value_eur),
    market_value_eur: num(o.market_value_eur),
    value_as_of: str(o.value_as_of) ?? null,
    notes: str(o.notes) ?? null,
  }
}

export async function loadCockpit(): Promise<Cockpit> {
  if (!supabase) throw new Error('Synchronisation ist nicht eingerichtet.')
  const [a, r, p] = await Promise.all([
    supabase.from('agents').select('*').order('id'),
    supabase.from('agent_reports').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('depot_positions').select('*').eq('active', true).order('market_value_eur', { ascending: false, nullsFirst: false }),
  ])
  const err = a.error ?? r.error ?? p.error
  if (err) throw new Error(err.message)
  return {
    agents: (a.data ?? []).map(parseAgent).filter((x): x is Agent => x !== null),
    reports: (r.data ?? []).map(parseReport).filter((x): x is AgentReport => x !== null),
    positions: (p.data ?? []).map(parsePosition).filter((x): x is Position => x !== null),
  }
}

// ---------- Auswertung ----------

export interface DepotTotals {
  value: number
  cost: number
  diff: number
  pct: number | null
  byAccount: { account: string; value: number }[]
}

export function depotTotals(positions: Position[]): DepotTotals {
  let value = 0
  let cost = 0
  let costBase = 0 // Wert der Positionen mit bekanntem Einstand
  const acc = new Map<string, number>()
  for (const p of positions) {
    const v = p.market_value_eur ?? 0
    value += v
    acc.set(p.account, (acc.get(p.account) ?? 0) + v)
    if (p.buy_value_eur !== null) {
      cost += p.buy_value_eur
      costBase += v
    }
  }
  const diff = costBase - cost
  return { value, cost, diff, pct: cost > 0 ? (diff / cost) * 100 : null, byAccount: [...acc.entries()].map(([account, v]) => ({ account, value: v })) }
}

/** Ordnet Signale aus dem Report den Depotpositionen zu (Namensvergleich, tolerant). */
export function matchSignal(position: Position, signals: PositionSignal[]): PositionSignal | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß ]/g, ' ').replace(/\s+/g, ' ').trim()
  const pn = norm(position.name)
  const firstWord = pn.split(' ')[0]
  return (
    signals.find((s) => norm(s.name) === pn) ??
    signals.find((s) => (position.wkn && s.name.includes(position.wkn)) || (position.isin && s.name.includes(position.isin))) ??
    signals.find((s) => {
      const sn = norm(s.name)
      return sn.length > 2 && (pn.includes(sn) || sn.includes(firstWord))
    })
  )
}

export const fmtEur = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits })

export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n > 0 ? '+' : ''}${n.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`)

// ---------- Anzeige-Helfer ----------

export const AGENT_COLORS: Record<string, string> = { depot: '#34d399', jobs: '#fbbf24', writer: '#60a5fa', personal: '#f472b6' }

/** Beschriftung der beiden Ergebnislisten je Agent. */
export function signalLabels(agentId: string): { pos: string; neg: string } {
  return agentId === 'depot' ? { pos: 'Top-Signale', neg: 'Warnsignale' } : { pos: 'Highlights', neg: 'Hinweise' }
}
export const agentColor = (id: string) => AGENT_COLORS[id] ?? '#c084fc'

export function relTime(iso: string | null, now: Date): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '–'
  const diffMin = Math.round((now.getTime() - d.getTime()) / 60000)
  if (diffMin >= 0 && diffMin < 1) return 'gerade eben'
  if (diffMin >= 0 && diffMin < 60) return `vor ${diffMin} Min.`
  if (diffMin >= 0 && diffMin < 24 * 60) return `vor ${Math.round(diffMin / 60)} Std.`
  return d.toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

