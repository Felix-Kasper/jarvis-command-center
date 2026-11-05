import { useCallback, useEffect, useMemo, useState } from 'react'
import { agentColor, depotTotals, fmtEur, fmtPct, loadCockpit, type Agent, type AgentReport, type Cockpit } from '../lib/agents'
import { archivePatch, buildMailto, loadJobs, saveFocus, statusPatch, updateLead, type JobLead, type JobsData } from '../lib/jobs'
import { copyText } from '../lib/clipboard'
import { syncConfigured } from '../lib/supabase'
import { Robot } from './Robot'
import { AgentDetail } from './AgentDetail'
import { ArchiveDialog } from './ArchiveDialog'
import { JobInbox } from './JobInbox'
import { LeadDetail } from './LeadDetail'
import { letterTitle, PrintLetter } from './PrintLetter'
import { PinDialog } from './PinDialog'
import { lockDepot, maskMoney, useDepotUnlocked } from '../lib/privacy'
import { Card, Toast, type ToastMsg } from './ui'

const STATUS_LABEL: Record<Agent['status'], string> = {
  bereit: 'bereit',
  arbeitet: 'arbeitet gerade',
  fehler: 'Fehler',
  pausiert: 'pausiert',
}

const FOCUS_HINT: Record<string, string> = {
  jobs: 'z. B. „Diese Woche nur B2B-SaaS, auch Customer Success“',
  writer: 'z. B. „Bewerbungs-Block 14:00 · heute 3 · Ton etwas lockerer, KI-Projekte stärker betonen“',
  depot: 'z. B. „Schau dir die zwei größten Positionen genauer an“',
  personal: 'z. B. „Mehr Konzerte, weniger Sport-News“',
}

function FocusEditor({ agentId, value, onSave }: { agentId: string; value: string; onSave: (v: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  if (!open)
    return (
      <div className="focus-line">
        {value ? (
          <span className="small">
            <span className="muted">Fokus:</span> {value.length > 120 ? value.slice(0, 120) + ' …' : value}
          </span>
        ) : (
          <span className="muted small">Kein Fokus gesetzt</span>
        )}
        <button
          className="link-btn small"
          onClick={() => {
            setDraft(value)
            setOpen(true)
          }}
        >
          {value ? 'Ändern' : 'Fokus setzen'}
        </button>
      </div>
    )
  return (
    <div className="focus-edit">
      <textarea
        rows={3}
        value={draft}
        maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={FOCUS_HINT[agentId] ?? 'Worauf soll sich der Agent beim nächsten Lauf konzentrieren?'}
      />
      <div className="row">
        <button
          className="primary small-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onSave(draft)
              setOpen(false)
            } finally {
              setBusy(false)
            }
          }}
        >
          Speichern
        </button>
        <button className="ghost small-btn" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

interface Props {
  mode: 'agenten' | 'bewerbungen'
  signedIn: boolean
  now: Date
  onOpenInbox: () => void
  onOpenPlanner?: () => void
  onChanged?: () => void
}

export function AgentsView({ mode, signedIn, now, onOpenInbox, onOpenPlanner, onChanged }: Props) {
  const [data, setData] = useState<Cockpit | null>(null)
  const [jobs, setJobs] = useState<JobsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [printLead, setPrintLead] = useState<JobLead | null>(null)
  const [archiveFor, setArchiveFor] = useState<JobLead | null>(null)
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const [pinFor, setPinFor] = useState<string | null>(null) // 'strip' oder Agent-ID, die danach geöffnet wird
  const unlocked = useDepotUnlocked()
  const notify = useCallback((text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo }), [])
  const clearToast = useCallback(() => setToast(null), [])

  const refresh = useCallback(async () => {
    try {
      const [c, j] = await Promise.all([loadCockpit(), loadJobs().catch(() => null)])
      setData(c)
      setJobs(j)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const working = data?.agents.some((a) => a.status === 'arbeitet') ?? false
  useEffect(() => {
    if (!signedIn) return
    void refresh()
    const id = setInterval(() => void refresh(), working ? 8000 : 30000)
    const onVis = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [signedIn, working, refresh])

  useEffect(() => {
    if (!printLead) return
    // Titel bestimmt den PDF-Dateinamen und die PDF-Metadaten – nichts von JARVIS
    const prevTitle = document.title
    document.title = letterTitle(printLead, jobs?.profile ?? null)
    const done = () => setPrintLead(null)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 60)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
      document.title = prevTitle
    }
  }, [printLead, jobs])

  const latest = useMemo(() => {
    const m = new Map<string, AgentReport>()
    for (const r of data?.reports ?? []) if (!m.has(r.agent_id)) m.set(r.agent_id, r)
    return m
  }, [data])

  // ---------- Aktionen für Bewerbungen ----------

  const setStatus = async (l: JobLead, status: JobLead['status']) => {
    try {
      await updateLead(l.id, statusPatch(l, status))
      notify(status === 'beworben' ? `Beworben: ${l.company} ✓` : status === 'absage' ? `Im Archiv: ${l.company}` : `Status: ${status}`)
      if (status === 'beworben') setLeadId(null)
      await refresh()
      onChanged?.()
    } catch (e) {
      notify(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const archive = async (l: JobLead, reason: string) => {
    try {
      await updateLead(l.id, archivePatch(reason))
      notify(`Im Archiv: ${l.company}`)
      setArchiveFor(null)
      setLeadId(null)
      await refresh()
      onChanged?.()
    } catch (e) {
      notify(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Der Datensatz bleibt als „gelöscht“ stehen, sonst findet der Job-Scout die Anzeige wieder.
  const restoreDeleted = async (l: JobLead) => {
    try {
      await updateLead(l.id, { status: l.status, archive_reason: l.archive_reason })
      await refresh()
      onChanged?.()
    } catch (e) {
      notify(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const remove = async (l: JobLead) => {
    try {
      await updateLead(l.id, { status: 'geloescht' })
      notify(`Gelöscht: ${l.company}`, () => void restoreDeleted(l))
      setLeadId(null)
      await refresh()
      onChanged?.()
    } catch (e) {
      notify(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const send = async (l: JobLead) => {
    const { href, bodyIncluded } = buildMailto(l)
    if (!bodyIncluded && l.email_body) {
      const ok = await copyText(l.email_body)
      notify(ok ? 'Mailtext kopiert – in Outlook mit Strg+V einfügen' : 'Mailtext bitte manuell kopieren')
    } else notify('Outlook wird geöffnet – Lebenslauf anhängen, prüfen, senden')
    window.location.href = href
  }

  const portal = async (l: JobLead) => {
    if (l.cover_letter_md) {
      const ok = await copyText(l.cover_letter_md)
      if (ok) notify('Anschreiben kopiert – im Portal einfügen')
    }
    if (l.url) window.open(l.url, '_blank', 'noopener,noreferrer')
  }

  const copy = async (text: string, what: string) => {
    const ok = await copyText(text)
    notify(ok ? `${what} kopiert` : `${what} konnte nicht kopiert werden`)
  }

  const saveNotes = async (l: JobLead, notes: string) => {
    try {
      await updateLead(l.id, { notes })
      notify('Notiz gespeichert')
      await refresh()
    } catch (e) {
      notify(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const saveAgentFocus = async (agentId: string, focus: string) => {
    try {
      await saveFocus(agentId, focus)
      notify('Fokus gespeichert – gilt ab dem nächsten Lauf')
      await refresh()
    } catch (e) {
      notify(`Fehler: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }
  }

  if (!syncConfigured || !signedIn) {
    return (
      <div className="agents">
        <Card title={mode === 'bewerbungen' ? 'Bewerbungen' : 'Agenten'}>
          <p className="muted">Bitte anmelden (Einstellungen).</p>
        </Card>
      </div>
    )
  }

  const totals = data ? depotTotals(data.positions) : null
  const asOf = data?.positions
    .map((p) => p.value_as_of)
    .filter(Boolean)
    .sort()
    .at(-1)
  const open = data?.agents.find((a) => a.id === openId)
  const writer = data?.agents.find((a) => a.id === 'writer')
  const writerPaused = writer?.status === 'pausiert'
  const lead = jobs?.leads.find((l) => l.id === leadId)
  const depotHeadline = latest.get('depot')?.data.headline ?? latest.get('depot')?.summary ?? null
  /** Depot-Texte ohne PIN nur mit ausgeblendeten Beträgen. */
  const mask = (agentId: string, text: string) => (agentId === 'depot' && !unlocked ? maskMoney(text) : text)

  return (
    <div className="agents">
      {error && <div className="banner banner-danger">Agenten-Daten konnten nicht geladen werden: {error}</div>}

      {mode === 'bewerbungen' ? (
        jobs ? (
          <JobInbox leads={jobs.leads} profile={jobs.profile} writerPaused={!!writerPaused} now={now} onOpen={(l) => setLeadId(l.id)} onSend={send} onPortal={portal} onStatus={setStatus} onArchive={setArchiveFor} onDelete={remove} />
        ) : (
          <p className="muted">Lade Bewerbungen …</p>
        )
      ) : (
        <>
          {(depotHeadline || (totals && totals.value > 0)) && (
            <section className="depot-head">
              <div className="depot-head-text">
                <span className="eyebrow">Depot-Lage</span>
                <strong>{depotHeadline ? (unlocked ? depotHeadline : maskMoney(depotHeadline)) : 'Beträge ausgeblendet'}</strong>
              </div>
              {unlocked ? (
                <button className="ghost small-btn" onClick={lockDepot}>
                  Sperren
                </button>
              ) : (
                <button className="secondary small-btn" onClick={() => setPinFor('strip')}>
                  🔒 Zahlen anzeigen
                </button>
              )}
            </section>
          )}
          {unlocked && totals && totals.value > 0 && (
            <section className="depot-strip">
              <div>
                <span className="eyebrow">Depots gesamt</span>
                <strong className="big">{fmtEur(totals.value)}</strong>
              </div>
              <div>
                <span className="eyebrow">Seit Kauf</span>
                <strong className={totals.diff >= 0 ? 'pos' : 'neg'}>
                  {fmtEur(totals.diff)} · {fmtPct(totals.pct)}
                </strong>
              </div>
              {totals.byAccount.map((a) => (
                <div key={a.account}>
                  <span className="eyebrow">{a.account}</span>
                  <strong>{fmtEur(a.value)}</strong>
                </div>
              ))}
              <span className="muted small depot-asof">Stand {asOf ? new Date(asOf).toLocaleDateString('de-DE') : '–'}</span>
            </section>
          )}

          {!data && !error && <p className="muted">Lade Agenten …</p>}
          {data && (
            <section className="card agent-list" aria-label="Agenten">
              {data.agents.map((a) => {
                const r = latest.get(a.id)
                const deadlines = r?.data.decisions.length ?? 0
                return (
                  <button
                    key={a.id}
                    className={`agent-row agent-${a.status}`}
                    style={{ ['--agent' as string]: agentColor(a.id) }}
                    onClick={() => (a.id === 'depot' && !unlocked ? setPinFor(a.id) : setOpenId(a.id))}
                    aria-label={`${a.name} öffnen`}
                  >
                    <Robot status={a.status} color={agentColor(a.id)} size={46} />
                    <span className="agent-row-main">
                      <span className="agent-row-top">
                        <strong>{a.name}</strong>
                        <span className={`agent-status status-${a.status}`}>
                          <span className="status-dot" />
                          {STATUS_LABEL[a.status]}
                          {a.status === 'arbeitet' && <span className="dots" aria-hidden="true" />}
                        </span>
                      </span>
                      <span className="agent-row-text">{a.status === 'arbeitet' && a.status_note ? a.status_note : r ? mask(a.id, r.data.headline ?? r.summary) : 'Noch kein Ergebnis'}</span>
                      {(deadlines > 0 || (a.id === 'depot' && !unlocked)) && (
                        <span className="agent-row-meta">
                          {deadlines > 0 && (
                            <span className="badge badge-danger">
                              {deadlines} Frist{deadlines > 1 ? 'en' : ''}
                            </span>
                          )}
                          {a.id === 'depot' && !unlocked && <span aria-label="PIN nötig">🔒</span>}
                        </span>
                      )}
                    </span>
                    <span className="chev" aria-hidden="true">
                      ›
                    </span>
                  </button>
                )
              })}
            </section>
          )}

        </>
      )}

      {open && data && (open.id !== 'depot' || unlocked) && (
        <AgentDetail
          agent={open}
          reports={data.reports.filter((r) => r.agent_id === open.id)}
          positions={open.id === 'depot' ? data.positions : []}
          now={now}
          onClose={() => setOpenId(null)}
          top={
            <div className="agent-sheet-top">
              {jobs && <FocusEditor key={`${open.id}:${jobs.focus[open.id] ?? ''}`} agentId={open.id} value={jobs.focus[open.id] ?? ''} onSave={(v) => saveAgentFocus(open.id, v)} />}
              {(open.id === 'jobs' || open.id === 'writer') && (
                <button
                  className="secondary small-btn"
                  onClick={() => {
                    setOpenId(null)
                    onOpenInbox()
                  }}
                >
                  Zu den Bewerbungen
                </button>
              )}
              {open.id === 'personal' && onOpenPlanner && (
                <button
                  className="secondary small-btn"
                  onClick={() => {
                    setOpenId(null)
                    onOpenPlanner()
                  }}
                >
                  Zum Briefing
                </button>
              )}
            </div>
          }
        />
      )}
      {lead && (
        <LeadDetail
          key={lead.id}
          lead={lead}
          now={now}
          writerPaused={!!writerPaused}
          onClose={() => setLeadId(null)}
          onSend={send}
          onPortal={portal}
          onCopy={copy}
          onPrint={(l) => setPrintLead(l)}
          onStatus={setStatus}
          onNotes={saveNotes}
          onArchive={setArchiveFor}
          onDelete={remove}
        />
      )}
      {archiveFor && <ArchiveDialog lead={archiveFor} onClose={() => setArchiveFor(null)} onSave={(reason) => archive(archiveFor, reason)} />}
      {pinFor && (
        <PinDialog
          onClose={() => setPinFor(null)}
          onUnlocked={() => {
            if (pinFor !== 'strip') setOpenId(pinFor)
            setPinFor(null)
          }}
        />
      )}
      {printLead && <PrintLetter lead={printLead} profile={jobs?.profile ?? null} date={now} />}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  )
}
