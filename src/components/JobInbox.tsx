import { useState } from 'react'
import { CHANNEL_LABEL, daysUntil, leadsForTab, type InboxTab, type JobLead, type JobProfile } from '../lib/jobs'
import { Segmented } from './ui'

interface Props {
  leads: JobLead[]
  profile: JobProfile | null
  writerPaused: boolean
  now: Date
  onOpen: (l: JobLead) => void
  onSend: (l: JobLead) => void
  onPortal: (l: JobLead) => void
  onStatus: (l: JobLead, status: JobLead['status']) => void
  onArchive: (l: JobLead) => void
  onDelete: (l: JobLead) => void
}

function Match({ score }: { score: number | null }) {
  const v = score ?? 0
  const cls = v >= 80 ? 'm-high' : v >= 65 ? 'm-mid' : 'm-low'
  return (
    <span className={`match ${cls}`} title="Match mit deinem Profil">
      {score ?? '–'}
    </span>
  )
}

export function DeadlineBadge({ date, now }: { date: string | null; now: Date }) {
  const d = daysUntil(date, now)
  if (d === null) return null
  const label = d < 0 ? 'Frist vorbei' : d === 0 ? 'Frist heute' : `Frist ${new Date(date! + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`
  return <span className={`badge ${d <= 7 ? 'badge-danger' : 'badge-warn'}`}>{label}</span>
}

export function JobInbox({ leads, profile, writerPaused, now, onOpen, onSend, onPortal, onStatus, onArchive, onDelete }: Props) {
  const [tab, setTab] = useState<InboxTab>('bereit')
  const list = leadsForTab(leads, tab)
  const counts = {
    bereit: leadsForTab(leads, 'bereit').length,
    neu: leadsForTab(leads, 'neu').length,
    beworben: leadsForTab(leads, 'beworben').length,
    archiv: leadsForTab(leads, 'archiv').length,
  }

  return (
    <section className="inbox">
      {(writerPaused || (profile && !profile.has_cv)) && (
        <div className="banner banner-warn">
          <div>
            <strong>Lebenslauf fehlt.</strong>
          </div>
        </div>
      )}
      {profile && profile.has_cv && !profile.full_name && <div className="banner banner-warn">Name und Kontakt fehlen im Profil.</div>}

      <Segmented<InboxTab>
        label="Bewerbungs-Ansicht"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'bereit', label: `Bereit (${counts.bereit})` },
          { value: 'neu', label: `Neu (${counts.neu})` },
          { value: 'beworben', label: `Beworben (${counts.beworben})` },
          { value: 'archiv', label: 'Archiv' },
        ]}
      />

      {list.length === 0 ? (
        <p className="muted inbox-empty">
          {tab === 'bereit'
            ? 'Keine Entwürfe bereit. Der Bewerbungs-Schreiber legt sie werktags früh hier ab.'
            : tab === 'neu'
              ? 'Keine neuen Treffer. Der Job-Scout sucht werktags um 05:45.'
              : tab === 'beworben'
                ? 'Noch nichts als beworben markiert.'
                : 'Leer.'}
        </p>
      ) : (
        <ul className="lead-list">
          {list.map((l) => (
            <li key={l.id} className="lead-row">
              <Match score={l.match_score} />
              <button className="lead-main" onClick={() => onOpen(l)}>
                <span className="lead-company">
                  {l.company}
                  {l.kind === 'initiativ' && <span className="badge badge-prio">Initiativ</span>}
                </span>
                <span className="lead-title">{l.title}</span>
                <span className="lead-meta">
                  {l.location && <span>{l.location}</span>}
                  <span className="badge">{CHANNEL_LABEL[l.apply_channel]}</span>
                  <DeadlineBadge date={l.deadline} now={now} />
                  {l.status === 'interview' && <span className="badge badge-active">Interview</span>}
                  {l.applied_at && tab === 'beworben' && <span className="muted">beworben {new Date(l.applied_at).toLocaleDateString('de-DE')}</span>}
                </span>
                {tab === 'archiv' && l.archive_reason && <span className="lead-reason">Grund: {l.archive_reason}</span>}
              </button>
              <div className="lead-actions">
                {tab === 'bereit' &&
                  (l.apply_channel === 'email' && l.apply_email ? (
                    <button className="primary small-btn lead-send" onClick={() => onSend(l)}>
                      In Outlook öffnen
                    </button>
                  ) : (
                    <button className="secondary small-btn lead-send" onClick={() => onPortal(l)} disabled={!l.url}>
                      Portal öffnen
                    </button>
                  ))}
                {tab === 'bereit' && (
                  <button className="ghost small-btn" onClick={() => onStatus(l, 'beworben')}>
                    ✓ Beworben
                  </button>
                )}
                {(tab === 'bereit' || tab === 'neu') && (
                  <button className="ghost small-btn" onClick={() => onArchive(l)}>
                    Archiv
                  </button>
                )}
                {tab !== 'beworben' && (
                  <button className="danger-ghost small-btn" onClick={() => onDelete(l)}>
                    Löschen
                  </button>
                )}
                {tab === 'beworben' && l.status === 'beworben' && (
                  <>
                    <button className="ghost small-btn" onClick={() => onStatus(l, 'interview')}>
                      Interview
                    </button>
                    <button className="ghost small-btn" onClick={() => onStatus(l, 'absage')}>
                      Absage
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
