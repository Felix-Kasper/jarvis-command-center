import { beforeEach, describe, expect, it } from 'vitest'
import { _resetPrivacy, isDepotUnlocked, lockDepot, makePinConfig, maskMoney, tryPin } from './privacy'

// Test-PIN – nicht die echte. Die echte PIN steht nirgends im Code, nur ihr Hash in Supabase.
const TEST_PIN = '4242'

describe('Depot-Sichtschutz', () => {
  beforeEach(async () => _resetPrivacy(await makePinConfig(TEST_PIN, 1000)))

  it('entsperrt nur mit der richtigen PIN und für 15 Minuten', async () => {
    const t0 = 1_000_000
    expect(await tryPin('0000', t0)).toBe('falsch')
    expect(isDepotUnlocked(t0)).toBe(false)
    expect(await tryPin(TEST_PIN, t0)).toBe('ok')
    expect(isDepotUnlocked(t0 + 14 * 60_000)).toBe(true)
    expect(isDepotUnlocked(t0 + 16 * 60_000)).toBe(false)
    lockDepot()
    expect(isDepotUnlocked(t0)).toBe(false)
  })

  it('pausiert nach 5 Fehlversuchen', async () => {
    const t0 = 5_000_000
    for (let i = 0; i < 4; i++) expect(await tryPin('1234', t0)).toBe('falsch')
    expect(await tryPin('1234', t0)).toBe('gesperrt')
    expect(await tryPin(TEST_PIN, t0 + 10_000)).toBe('gesperrt')
    expect(await tryPin(TEST_PIN, t0 + 31_000)).toBe('ok')
  })

  it('ohne eingerichtete PIN bleibt das Depot zu', async () => {
    _resetPrivacy(null)
    expect(await tryPin(TEST_PIN)).toBe('fehlt')
  })

  it('speichert nur Salt und Hash, nie die PIN, und jedes Mal mit neuem Salt', async () => {
    const a = await makePinConfig(TEST_PIN, 1000)
    const b = await makePinConfig(TEST_PIN, 1000)
    expect(JSON.stringify(a)).not.toContain(TEST_PIN)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it('blendet Beträge und Stückzahlen aus, Prozent bleiben', () => {
    expect(maskMoney('Depot bei 12.345 € (+3,2 %), Beta Sport −1.200,50 EUR')).toBe('Depot bei ••• (+3,2 %), Beta Sport •••')
    expect(maskMoney('Cash € 980 und EUR 15k, 12 Stück Gamma, 3,5 Stk. BTC')).toBe('Cash ••• und •••, ••• Gamma, ••• BTC')
    expect(maskMoney('Beta Sport schwach nach Zahlen, Gamma +4 %')).toBe('Beta Sport schwach nach Zahlen, Gamma +4 %')
  })
})
