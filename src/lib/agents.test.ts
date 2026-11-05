import { describe, expect, it } from 'vitest'
import { depotTotals, matchSignal, parseReportData, relTime, type Position } from './agents'

const pos = (p: Partial<Position>): Position => ({
  id: p.name ?? 'x',
  account: 'Bank A',
  name: 'X',
  wkn: null,
  isin: null,
  ticker: null,
  asset_type: 'Aktie',
  quantity: null,
  avg_buy_price_eur: null,
  buy_value_eur: null,
  market_value_eur: null,
  value_as_of: null,
  notes: null,
  ...p,
})

describe('Agenten-Reports einlesen', () => {
  it('nimmt gültige Felder und verwirft Unsinn', () => {
    const d = parseReportData({
      headline: 'Ruhige Woche',
      positions: [{ name: 'Alpha', signal: 'Positiv', consensus: 'Kaufen' }, { signal: 'negativ' }, 'quatsch'],
      top_positive: [{ name: 'Alpha', reason: 'Kursziele angehoben' }, { reason: 'ohne Name' }],
      top_negative: 'kein Array',
      candidates: [{ name: 'Allianz', isin: 'DE0008404005' }],
      risks: ['Klumpenrisiko Tech', 3, null],
      sources: [{ url: 'https://example.com', title: 'Quelle' }, { url: 'javascript:alert(1)' }],
    })
    expect(d.headline).toBe('Ruhige Woche')
    expect(d.positions).toEqual([expect.objectContaining({ name: 'Alpha', signal: 'positiv', consensus: 'Kaufen' })])
    expect(d.top_positive).toHaveLength(1)
    expect(d.top_negative).toEqual([])
    expect(d.candidates[0].isin).toBe('DE0008404005')
    expect(d.risks).toEqual(['Klumpenrisiko Tech', '3'])
    expect(d.sources).toEqual([{ url: 'https://example.com', title: 'Quelle', date: undefined }])
  })

  it('übersteht komplett leere oder kaputte Daten', () => {
    const d = parseReportData(null)
    expect(d.positions).toEqual([])
    expect(d.candidates).toEqual([])
  })
})

describe('Depot', () => {
  it('summiert Werte und Gewinn nur über Positionen mit Einstand', () => {
    const t = depotTotals([
      pos({ name: 'A', market_value_eur: 150, buy_value_eur: 100 }),
      pos({ name: 'B', market_value_eur: 50, buy_value_eur: 100, account: 'Krypto-Börse' }),
      pos({ name: 'C', market_value_eur: 30, buy_value_eur: null }),
    ])
    expect(t.value).toBe(230)
    expect(t.cost).toBe(200)
    expect(t.diff).toBe(0)
    expect(t.pct).toBe(0)
    expect(t.byAccount).toEqual([
      { account: 'Bank A', value: 180 },
      { account: 'Krypto-Börse', value: 50 },
    ])
  })

  it('ordnet Report-Signale den Positionen zu', () => {
    const signals = [{ name: 'Alpha' }, { name: 'Beta Sport' }, { name: 'Welt-ETF' }]
    expect(matchSignal(pos({ name: 'Alpha Holding Class A' }), signals)?.name).toBe('Alpha')
    expect(matchSignal(pos({ name: 'Beta Sport Inc. B' }), signals)?.name).toBe('Beta Sport')
    expect(matchSignal(pos({ name: 'Welt-ETF UCITS ETF (Dist)' }), signals)?.name).toBe('Welt-ETF')
    expect(matchSignal(pos({ name: 'Gamma AG' }), signals)).toBeUndefined()
  })

  it('zeigt relative Zeiten', () => {
    const now = new Date('2026-10-28T16:00:00Z')
    expect(relTime(null, now)).toBe('–')
    expect(relTime('2026-10-28T15:55:00Z', now)).toBe('vor 5 Min.')
    expect(relTime('2026-10-28T13:00:00Z', now)).toBe('vor 3 Std.')
  })
})
