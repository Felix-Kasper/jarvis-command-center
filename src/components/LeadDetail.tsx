import { useState } from 'react'
import { CHANNEL_LABEL, STATUS_LABEL, type JobLead } from '../lib/jobs'
import { Markdown } from './Markdown'
import { Modal } from './ui'
import { DeadlineBadge } from './JobInbox'

interface Props {
  lead: JobLead
  now: Date
  writerPaused: boolean
  onClose: () => void
  onSend: (l: JobLead) => void
  onPortal: (l: JobLead) => void
  onCopy: (text: string, what: string) => void
  onPrint: (l: JobLead) => void
  onStatus: (l: JobLead, status: JobLead['status']) => void
  onNotes: (l: JobLead, notes: string) => void
  onArchive: (l: JobLead) => void
  onDelete: (l: JobLead) => void
}

export function LeadDetail({ lead: l, now, writerPaused, onClose, onSend, onPortal, onCopy, onPrint, onStatus, onNotes, onArchive, onDelete }: Props) {
  const [notes, setNotes] = useState(l.notes ?? '')
  const drafted = !!(l.email_body || l.cover_letter_md)
  const archived = l.status === 'verworfen' || l.status === 'absage'
  const matched = l.keywords.filter((k) => k.matched)
  const missing = l.keywords.filter((k) => !k.matched)

  return (
    <Modal title={`${l.company} – ${l.title}`} onClose={onClose} full>
      <div className="lead-head">
        <span className={`match big ${(l.match_score ?? 0) >= 80 ? 'm-high' : (l.match_score ?? 0) >= 65 ? 'm-mid' : 'm-low'}`}>{l.match_score ?? '–'}</span>
        <div>
          <strong>{l.company}</strong>
          <p className="muted small">
            {[l.location, l.kind === 'initiativ' ? 'Initiativbewerbung' : l.source, l.language?.toUpperCase(), l.salary].filter(Boolean).join(' · ')}
          </p>
          <div className="row">
            <span className="badge">{STATUS_LABEL[l.status]}</span>
            <span className="badge">{CHANNEL_LABEL[l.apply_channel]}</span>
            <DeadlineBadge date={l.deadline} now={now} />
            {l.posted_at && <span className="muted small">veröffentlicht {new Date(l.posted_at + 'T12:00:00').toLocaleDateString('de-DE')}</span>}
            {l.url && (
              <a className="link-btn small" href={l.url} target="_blank" rel="noopener noreferrer">
                Zur {l.kind === 'initiativ' ? 'Karriereseite' : 'Anzeige'} ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {archived && l.archive_reason && (
        <div className="banner lead-archived">
          <div>
            <strong>Grund fürs Archiv:</strong> {l.archive_reason}
          </div>
        </div>
      )}

      <div className="lead-grid">
        <div className="lead-col">
          {l.summary && (
            <section>
              <h4>Worum es geht</h4>
              <p>{l.summary}</p>
            </section>
          )}
          {l.why_fit && (
            <section>
              <h4>Warum es passt</h4>
              <p>{l.why_fit}</p>
            </section>
          )}
          {l.keywords.length > 0 && (
            <section>
              <h4>Keywords der Anzeige</h4>
              <div className="chips">
                {matched.map((k) => (
                  <span key={k.term} className="chip static kw-yes" title="in deinem Profil vorhanden">
                    ✓ {k.term}
                  </span>
                ))}
                {missing.map((k) => (
                  <span key={k.term} className="chip static kw-no" title="fehlt im Profil">
                    {k.term}
                  </span>
                ))}
              </div>
            </section>
          )}
          {l.requirements && (
            <section>
              <h4>Anforderungen</h4>
              <Markdown text={l.requirements} />
            </section>
          )}
          {l.pre_info && (
            <section>
              <h4>Vorinfos für die Bewerbung</h4>
              <Markdown text={l.pre_info} />
            </section>
          )}
        </div>

        <div className="lead-col">
          {!drafted ? (
            <div className="banner">
              {writerPaused ? 'Der Bewerbungs-Schreiber wartet noch auf deinen Lebenslauf.' : 'Der Entwurf folgt durch den Bewerbungs-Schreiber (werktags 06:35, höchste Matches und nächste Fristen zuerst).'}
            </div>
          ) : (
            <>
              {l.email_body && (
                <section className="draft">
                  <div className="draft-head">
                    <h4>E-Mail</h4>
                    <div className="row">
                      <button className="ghost small-btn" onClick={() => onCopy(l.email_body!, 'Mailtext')}>
                        Text kopieren
                      </button>
                      <button className="primary small-btn" onClick={() => onSend(l)}>
                        In Outlook öffnen
                      </button>
                    </div>
                  </div>
                  <dl className="mail-meta">
                    <dt>An</dt>
                    <dd>
                      {l.apply_email ?? <span className="muted">keine Adresse – Bewerbung über {CHANNEL_LABEL[l.apply_channel]}</span>}
                      {l.apply_email && (
                        <button className="link-btn small" onClick={() => onCopy(l.apply_email!, 'Adresse')}>
                          {' '}
                          kopieren
                        </button>
                      )}
                    </dd>
                    <dt>Betreff</dt>
                    <dd>{l.email_subject ?? '–'}</dd>
                  </dl>
                  <pre className="mail-body">{l.email_body}</pre>
                </section>
              )}
              {l.cover_letter_md && (
                <section className="draft">
                  <div className="draft-head">
                    <h4>Anschreiben</h4>
                    <div className="row">
                      <button className="ghost small-btn" onClick={() => onCopy(l.cover_letter_md!, 'Anschreiben')}>
                        Kopieren
                      </button>
                      <button className="ghost small-btn" onClick={() => onPrint(l)}>
                        Als PDF
                      </button>
                      {l.url && l.apply_channel !== 'email' && (
                        <button className="primary small-btn" onClick={() => onPortal(l)}>
                          Portal öffnen
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="letter">
                    <Markdown text={l.cover_letter_md} />
                  </div>
                </section>
              )}
              {l.cv_highlights && (
                <section>
                  <h4>Lebenslauf für diese Stelle anpassen</h4>
                  <Markdown text={l.cv_highlights} />
                </section>
              )}
            </>
          )}
          <section>
            <h4>Notizen</h4>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (l.notes ?? '') && onNotes(l, notes)} placeholder="z. B. Ansprechpartner, Telefonat, Rückmeldung" />
          </section>
        </div>
      </div>

      <div className="lead-status">
        {(l.status === 'neu' || l.status === 'entwurf') && (
          <button className="primary" onClick={() => onStatus(l, 'beworben')}>
            ✓ Als beworben markieren
          </button>
        )}
        {l.status === 'beworben' && (
          <>
            <button className="secondary" onClick={() => onStatus(l, 'interview')}>
              Interview
            </button>
            <button className="ghost" onClick={() => onStatus(l, 'absage')}>
              Absage
            </button>
          </>
        )}
        {archived ? (
          <button className="ghost" onClick={() => onStatus(l, drafted ? 'entwurf' : 'neu')}>
            Wiederherstellen
          </button>
        ) : (
          <button className="ghost" onClick={() => onArchive(l)}>
            Ins Archiv
          </button>
        )}
        <button className="danger-ghost" onClick={() => onDelete(l)}>
          Löschen
        </button>
        <span className="spacer" />
      </div>
    </Modal>
  )
}
