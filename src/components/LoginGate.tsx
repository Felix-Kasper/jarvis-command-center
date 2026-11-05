import { useState } from 'react'
import { store } from '../lib/store'
import { isDemo } from '../lib/supabase'

/** Ohne Anmeldung ist nichts von JARVIS zu sehen – nur dieses Formular. Neue Konten gibt es nicht. */
export function LoginGate() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  return (
    <main className="gate">
      <form
        className="gate-card"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setMsg(null)
          const err = await store.signIn(email.trim(), pw)
          setBusy(false)
          if (err) setMsg(err)
        }}
      >
        <svg className="gate-lock" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
        <h1>Anmelden</h1>
        {isDemo && <p className="gate-hint">Demo: beliebige E-Mail und beliebiges Passwort</p>}
        <input type="email" autoComplete="email" placeholder="E-Mail" aria-label="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" autoComplete="current-password" placeholder="Passwort" aria-label="Passwort" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {msg && (
          <p className="error" role="alert">
            {msg}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy || !email || !pw}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </main>
  )
}
