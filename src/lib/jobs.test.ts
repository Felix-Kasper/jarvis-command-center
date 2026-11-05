import { describe, expect, it } from 'vitest'
import { ABSAGE_REASON, appliedOn, archivePatch, buildMailto, daysUntil, leadsForTab, MAILTO_LIMIT, parseLead, statusPatch, type JobLead } from './jobs'

const base = { id: 'a', company: 'Würth', title: 'Junior Key Account Manager', created_at: '2026-10-29T05:00:00Z' }

function lead(p: Partial<JobLead> & { id: string }): JobLead {
  return parseLead({ ...base, ...p })!
}

describe('Treffer einlesen', () => {
  it('übernimmt gültige Felder und entschärft unsichere Werte', () => {
    const l = parseLead({
      ...base,
      url: 'javascript:alert(1)',
      apply_email: 'karriere@wuerth.com',
      apply_channel: 'email',
      match_score: '83',
      keywords: [{ term: 'B2B', matched: true }, { term: 'SAP' }, 'quatsch'],
      status: 'entwurf',
    })!
    expect(l.url).toBeNull()
    expect(l.apply_email).toBe('karriere@wuerth.com')
    expect(l.match_score).toBe(83)
    expect(l.keywords).toEqual([
      { term: 'B2B', matched: true },
      { term: 'SAP', matched: false },
    ])
    expect(l.status).toBe('entwurf')
  })

  it('verwirft ungültige E-Mail-Adressen und unbekannte Status', () => {
    const l = parseLead({ ...base, apply_email: 'kein mail <x>', status: 'egal', apply_channel: 'fax' })!
    expect(l.apply_email).toBeNull()
    expect(l.status).toBe('neu')
    expect(l.apply_channel).toBe('portal')
  })

  it('ignoriert Datensätze ohne Firma oder Titel', () => {
    expect(parseLead({ id: 'x', title: 'Sales' })).toBeNull()
  })
})

describe('Outlook-Link', () => {
  it('enthält Empfänger, Betreff und Text', () => {
    const r = buildMailto({ apply_email: 'jobs@firma.de', email_subject: 'Bewerbung als Sales – Max', email_body: 'Hallo,\nTest' })
    expect(r.bodyIncluded).toBe(true)
    expect(r.href.startsWith('mailto:jobs@firma.de?subject=')).toBe(true)
    expect(r.href).toContain('body=Hallo%2C%0D%0ATest')
  })

  it('lässt zu langen Text weg (wird dann kopiert)', () => {
    const r = buildMailto({ apply_email: 'jobs@firma.de', email_subject: 'Bewerbung', email_body: 'ä'.repeat(800) })
    expect(r.bodyIncluded).toBe(false)
    expect(r.href.length).toBeLessThanOrEqual(MAILTO_LIMIT)
    expect(r.href).not.toContain('body=')
  })
})

describe('Inbox', () => {
  const now = new Date(2026, 9, 29, 10, 0)
  it('sortiert bereite Entwürfe nach Frist, dann Match', () => {
    const list = leadsForTab(
      [
        lead({ id: '1', status: 'entwurf', match_score: 90 }),
        lead({ id: '2', status: 'entwurf', match_score: 70, deadline: '2026-11-05' }),
        lead({ id: '3', status: 'entwurf', match_score: 95 }),
        lead({ id: '4', status: 'neu', match_score: 99 }),
      ],
      'bereit',
    )
    expect(list.map((l) => l.id)).toEqual(['2', '3', '1'])
  })

  it('zählt heutige Bewerbungen und Tage bis zur Frist', () => {
    const leads = [lead({ id: '1', status: 'beworben', applied_at: new Date(2026, 9, 29, 9).toISOString() }), lead({ id: '2', status: 'beworben', applied_at: new Date(2026, 9, 28, 9).toISOString() })]
    expect(appliedOn(leads, now)).toBe(1)
    expect(daysUntil('2026-11-05', now)).toBe(7)
    expect(daysUntil(null, now)).toBeNull()
  })
})

describe('Archiv und Löschen', () => {
  it('verlangt fürs Archiv einen Grund', () => {
    expect(() => archivePatch('   ')).toThrow()
    expect(archivePatch('  Ort passt nicht ')).toEqual({ status: 'verworfen', archive_reason: 'Ort passt nicht' })
  })

  it('zeigt den Grund im Archiv, und Gelöschtes in keinem Reiter', () => {
    const archiviert = lead({ id: 'x', status: 'verworfen', archive_reason: 'Ort passt nicht' })
    const geloescht = lead({ id: 'y', status: 'geloescht' })
    expect(archiviert.archive_reason).toBe('Ort passt nicht')
    expect(geloescht.status).toBe('geloescht')
    expect(leadsForTab([archiviert, geloescht], 'archiv').map((l) => l.id)).toEqual(['x'])
    for (const tab of ['bereit', 'neu', 'beworben'] as const) expect(leadsForTab([archiviert, geloescht], tab)).toEqual([])
  })

  it('eine Absage bringt ihren Grund mit, Wiederherstellen entfernt ihn', () => {
    const l = lead({ id: 'z', status: 'beworben', applied_at: '2026-10-29T08:00:00Z' })
    expect(statusPatch(l, 'absage')).toEqual({ status: 'absage', applied_at: l.applied_at, archive_reason: ABSAGE_REASON })
    expect(statusPatch(l, 'entwurf')).toEqual({ status: 'entwurf', applied_at: null, archive_reason: null })
  })
})
