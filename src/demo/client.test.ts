import { beforeEach, describe, expect, it } from 'vitest'
import { parseBriefing } from '../lib/briefing'
import { parseLead } from '../lib/jobs'
import { parseReportData } from '../lib/agents'
import { fromRow, type RemoteRow } from '../lib/sync'
import { createDemoClient, resetDemo } from './client'
import { buildFixtures } from './fixtures'

const NOW = new Date('2026-11-04T10:00:00')

describe('demo fixtures', () => {
  const t = buildFixtures(NOW)

  it('every planner row passes the same validation as real sync data', () => {
    for (const row of t.items) expect(fromRow(row as unknown as RemoteRow), String(row.id)).not.toBeNull()
  })

  it('every lead and report parses with the production parsers', () => {
    expect(t.job_leads.map(parseLead).every(Boolean)).toBe(true)
    for (const r of t.agent_reports) expect(parseReportData(r.data)).toBeTruthy()
    const briefing = parseBriefing(t.agent_reports.find((r) => r.agent_id === 'personal'))
    expect(briefing?.sections.map((s) => s.id)).toEqual(['aktien', 'fuer_dich', 'events', 'konzerte', 'tipps'])
  })

  it('contains only fictional contact data (reserved .example domains)', () => {
    const json = JSON.stringify(t)
    const emails = json.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []
    expect(emails.length).toBeGreaterThan(0)
    for (const e of emails) expect(e).toMatch(/\.example$/)
    const urls = json.match(/https?:\/\/[^"\s)]+/g) ?? []
    for (const u of urls) expect(new URL(u).hostname).toMatch(/(\.example|^example\.com|^www\.linkedin\.com)$/)
  })

  it('portfolio headline matches the positions', () => {
    const value = t.depot_positions.reduce((s, p) => s + (p.market_value_eur as number), 0)
    const buy = t.depot_positions.reduce((s, p) => s + (p.buy_value_eur as number), 0)
    expect(Math.round(value)).toBe(24380)
    expect(((value / buy - 1) * 100).toFixed(1)).toBe('11.7')
  })
})

describe('demo client (supabase-js subset)', () => {
  beforeEach(() => resetDemo(NOW))

  it('filters, sorts and limits like PostgREST', async () => {
    const db = createDemoClient()
    const { data } = await db.from('job_leads').select('*').neq('status', 'geloescht').order('match_score', { ascending: false }).limit(3)
    expect(data?.map((r) => r.match_score)).toEqual([88, 86, 84])
  })

  it('upserts on the conflict key and updates in place', async () => {
    const db = createDemoClient()
    await db.from('news_feedback').upsert({ item_key: 'a', reaction: 'mag' }, { onConflict: 'user_id,item_key' })
    await db.from('news_feedback').upsert({ item_key: 'a', reaction: 'gemerkt' }, { onConflict: 'user_id,item_key' })
    const { data } = await db.from('news_feedback').select('item_key, reaction')
    expect(data).toHaveLength(1)
    expect(data?.[0].reaction).toBe('gemerkt')
    await db.from('job_leads').update({ status: 'beworben' }).eq('id', 'lead-1')
    const lead = await db.from('job_leads').select('*').eq('id', 'lead-1')
    expect(lead.data?.[0].status).toBe('beworben')
  })

  it('returns copies, so callers cannot mutate the database by accident', async () => {
    const db = createDemoClient()
    const first = await db.from('agents').select('*').eq('id', 'jobs')
    first.data![0].status = 'fehler'
    const again = await db.from('agents').select('*').eq('id', 'jobs')
    expect(again.data![0].status).toBe('arbeitet')
  })

  it('sign out and sign in notify listeners', async () => {
    const db = createDemoClient()
    const events: string[] = []
    db.auth.onAuthStateChange((e) => events.push(e))
    await db.auth.signOut()
    expect((await db.auth.getSession()).data.session).toBeNull()
    await db.auth.signInWithPassword()
    expect(events).toEqual(['SIGNED_OUT', 'SIGNED_IN'])
  })
})
