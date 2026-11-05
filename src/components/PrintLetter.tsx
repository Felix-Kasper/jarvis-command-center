import { createPortal } from 'react-dom'
import type { JobLead, JobProfile } from '../lib/jobs'
import { Markdown } from './Markdown'

/** Dateiname/Titel des PDFs – ohne Hinweis auf JARVIS. */
export function letterTitle(lead: JobLead, profile: JobProfile | null): string {
  return ['Anschreiben', profile?.full_name, lead.company].filter(Boolean).join(' – ')
}

/**
 * Druckansicht für das Anschreiben (Drucken → Als PDF speichern).
 * Wird direkt in <body> gerendert, außerhalb der App: Beim Drucken ist nur der Brief sichtbar.
 * Seitenrand 0 (siehe CSS), damit der Browser keine Kopf-/Fußzeile mit Seitentitel und Link druckt.
 */
export function PrintLetter({ lead, profile, date }: { lead: JobLead; profile: JobProfile | null; date: Date }) {
  const sender = [profile?.full_name, profile?.location, profile?.phone, profile?.application_email].filter(Boolean)
  return createPortal(
    <div className="print-root" aria-hidden="true">
      <div className="print-letter">
        {sender.length > 0 && (
          <div className="pl-sender">
            {sender.map((s, i) => (
              <div key={i}>{s}</div>
            ))}
          </div>
        )}
        <div className="pl-recipient">
          <div>{lead.company}</div>
          {lead.contact_name && <div>{lead.contact_name}</div>}
          {lead.location && <div>{lead.location}</div>}
        </div>
        <div className="pl-date">{date.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <Markdown text={lead.cover_letter_md ?? ''} />
      </div>
    </div>,
    document.body,
  )
}
