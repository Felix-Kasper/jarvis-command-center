import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface AgentsStatus {
  working: boolean // arbeitet gerade ein Agent? (Punkt im Reiter „Agenten“)
  ready: number // fertige Bewerbungsentwürfe (Zahl im Reiter „Bewerbungen“)
  refresh: () => void // sofort neu prüfen (z. B. nach „Beworben“)
}

/** Prüft regelmäßig, ob ein Agent arbeitet und wie viele Bewerbungsentwürfe bereitliegen. */
export function useAgentsWorking(signedIn: boolean): AgentsStatus {
  const [status, setStatus] = useState({ working: false, ready: 0 })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!signedIn || !supabase) return
    let cancelled = false
    const check = async () => {
      const [agents, leads] = await Promise.all([
        supabase!.from('agents').select('status').eq('status', 'arbeitet').limit(1),
        supabase!.from('job_leads').select('id').eq('status', 'entwurf').limit(100),
      ])
      if (cancelled) return
      setStatus((prev) => ({
        working: agents.error ? prev.working : (agents.data ?? []).length > 0,
        ready: leads.error ? prev.ready : (leads.data ?? []).length,
      }))
    }
    void check()
    const id = setInterval(() => void check(), 60_000)
    const onVis = () => document.visibilityState === 'visible' && void check()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [signedIn, tick])
  return signedIn ? { ...status, refresh } : { working: false, ready: 0, refresh }
}
