// Sichtschutz fürs Depot: Beträge und Positionen erst nach PIN-Eingabe.
// Die PIN steht weder im Code noch auf GitHub: In Supabase liegt nur ein gesalzener
// PBKDF2-Hash (personal_profile.depot_pin), lesbar nur nach Anmeldung (Row Level Security).
// Das ist ein Sichtschutz gegen Mitlesen am Bildschirm – die Depotdaten selbst schützt die Anmeldung.

import { useEffect, useReducer } from 'react'
import { supabase } from './supabase'

export interface PinConfig {
  v: 1
  salt: string // base64
  iter: number
  hash: string // base64
  len?: number // Anzahl Ziffern (für automatisches Prüfen nach der letzten Ziffer)
}

const KEY = 'jarvis:v1:depot-unlocked-until'
export const UNLOCK_MINUTES = 15
const MAX_TRIES = 5
const COOLDOWN_MS = 30_000
const ITERATIONS = 210_000

const listeners = new Set<() => void>()
let until = readUntil()
let failed = 0
let blockedUntil = 0
let cached: PinConfig | null | undefined // undefined = noch nicht geladen

function readUntil(): number {
  try {
    const v = Number(sessionStorage.getItem(KEY))
    return Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

function writeUntil(v: number) {
  until = v
  try {
    if (v) sessionStorage.setItem(KEY, String(v))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* Sichtschutz gilt dann nur bis zum Neuladen */
  }
  listeners.forEach((l) => l())
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return b64(new Uint8Array(bits))
}

/** Erzeugt die gespeicherte Form einer PIN (neues Salt). */
export async function makePinConfig(pin: string, iterations = ITERATIONS): Promise<PinConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { v: 1, salt: b64(salt), iter: iterations, hash: await derive(pin, salt, iterations), len: pin.length }
}

function parseConfig(raw: unknown): PinConfig | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o || typeof o.salt !== 'string' || typeof o.hash !== 'string' || typeof o.iter !== 'number' || o.iter < 1000) return null
  return { v: 1, salt: o.salt, iter: o.iter, hash: o.hash, len: typeof o.len === 'number' ? o.len : undefined }
}

async function loadConfig(): Promise<PinConfig | null> {
  if (cached !== undefined) return cached
  if (!supabase) return null
  const { data, error } = await supabase.from('personal_profile').select('depot_pin').limit(1)
  if (error) return null // nicht cachen – beim nächsten Versuch erneut laden
  const cfg = parseConfig((data ?? [])[0]?.depot_pin)
  if (cfg) cached = cfg // „keine PIN“ nicht merken (z. B. vor der Anmeldung)
  return cfg
}

/** Länge der PIN (für automatisches Prüfen); unbekannt = null. */
export async function pinLength(): Promise<number | null> {
  return (await loadConfig())?.len ?? null
}

export const isDepotUnlocked = (now = Date.now()) => until > now

export function lockDepot() {
  writeUntil(0)
}

export type PinResult = 'ok' | 'falsch' | 'gesperrt' | 'fehlt'

/** Prüft die PIN. Nach 5 Fehlversuchen 30 Sekunden Pause. 'fehlt' = keine PIN eingerichtet oder nicht angemeldet. */
export async function tryPin(pin: string, now = Date.now()): Promise<PinResult> {
  if (blockedUntil > now) return 'gesperrt'
  const cfg = await loadConfig()
  if (!cfg) return 'fehlt'
  const ok = (await derive(pin.trim(), unb64(cfg.salt), cfg.iter)) === cfg.hash
  if (ok) {
    failed = 0
    writeUntil(now + UNLOCK_MINUTES * 60_000)
    return 'ok'
  }
  failed += 1
  if (failed >= MAX_TRIES) {
    failed = 0
    blockedUntil = now + COOLDOWN_MS
    return 'gesperrt'
  }
  return 'falsch'
}

/** PIN ändern: alte PIN prüfen, neuen Hash in Supabase speichern. */
export async function changePin(oldPin: string, newPin: string): Promise<'ok' | 'falsch' | 'gesperrt' | 'fehlt' | 'ungueltig'> {
  if (!/^\d{4,8}$/.test(newPin)) return 'ungueltig'
  const cfg = await loadConfig()
  if (cfg) {
    const r = await tryPin(oldPin)
    if (r !== 'ok') return r
  }
  if (!supabase) return 'fehlt'
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return 'fehlt'
  const next = await makePinConfig(newPin)
  const { error } = await supabase.from('personal_profile').upsert({ user_id: userId, depot_pin: next }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
  cached = next
  return 'ok'
}

/** Nur für Tests: PIN-Konfiguration vorgeben und Zähler zurücksetzen. */
export function _resetPrivacy(cfg?: PinConfig | null) {
  failed = 0
  blockedUntil = 0
  cached = cfg
  writeUntil(0)
}

/** true, solange das Depot entsperrt ist. Sperrt sich nach Ablauf automatisch (ohne Neuladen). */
export function useDepotUnlocked(): boolean {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    listeners.add(force)
    return () => {
      listeners.delete(force)
    }
  }, [])
  const unlocked = isDepotUnlocked()
  useEffect(() => {
    if (!unlocked) return
    const t = setTimeout(force, Math.max(0, until - Date.now()) + 50)
    return () => clearTimeout(t)
  }, [unlocked])
  return unlocked
}

const MASK = '•••'
// 12.345 € · 1.234,56 EUR · 980 Euro · € 1.200 · EUR 15k · 12 Stück · 3,5 Stk.
const MONEY_PATTERNS = [
  /[+\-−]?\d[\d.,  ]*\s?(?:k|Tsd\.?|Mio\.?)?\s?(?:€|EUR\b|Euro\b)/gi,
  /(?:€|EUR\b)\s?[+\-−]?\d[\d.,  ]*(?:\s?(?:k|Tsd\.?|Mio\.?))?/gi,
  /\d[\d.,]*\s?(?:Stück\b|Stk\.?)/gi,
]

/** Ersetzt Geldbeträge und Stückzahlen durch •••, Prozentangaben bleiben stehen. */
export function maskMoney(text: string): string {
  let out = text
  for (const re of MONEY_PATTERNS) out = out.replace(re, (m) => (/\s$/.test(m) ? `${MASK} ` : MASK))
  return out
}
