// Bewerbungs-System: Treffer des Job-Scouts, Entwürfe des Bewerbungs-Schreibers,
// Anweisungen („Fokus“) an die Agenten und das Bewerbungsprofil.
// Gesendet wird nie automatisch – die App öffnet nur Outlook bzw. das Portal.

import { supabase } from './supabase'

export type LeadStatus = 'neu' | 'entwurf' | 'beworben' | 'interview' | 'absage' | 'verworfen' | 'geloescht'
export type ApplyChannel = 'email' | 'portal' | 'linkedin' | 'sonstiges'

export interface Keyword {
  term: string
  matched: boolean
}

export interface JobLead {
  id: string
  kind: 'stelle' | 'initiativ'
  source: string | null
  company: string
  title: string
  location: string | null
  url: string | null
  apply_channel: ApplyChannel
  apply_email: string | null
  contact_name: string | null
  posted_at: string | null
  deadline: string | null
  salary: string | null
  language: string | null
  match_score: number | null
  keywords: Keyword[]
  summary: string | null
  requirements: string | null
  why_fit: string | null
  pre_info: string | null
  status: LeadStatus
  email_subject: string | null
  email_body: string | null
  cover_letter_md: string | null
  cv_highlights: string | null
  drafted_at: string | null
  applied_at: string | null
  notes: string | null
  archive_reason: string | null
  created_at: string
}

export interface JobProfile {
  full_name: string | null
  application_email: string | null
  phone: string | null
  location: string | null
  linkedin_url: string | null
  has_cv: boolean
}

const STATUSES: LeadStatus[] = ['neu', 'entwurf', 'beworben', 'interview', 'absage', 'verworfen', 'geloescht']
const CHANNELS: ApplyChannel[] = ['email', 'portal', 'linkedin', 'sonstiges']

const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const safeUrl = (v: unknown): string | null => {
  const u = s(v)
  return u && /^https?:\/\//i.test(u) ? u : null
}
const safeEmail = (v: unknown): string | null => {
  const e = s(v)
  return e && /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(e) ? e : null
}

export function parseLead(raw: unknown): JobLead | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = s(o.id)
  const company = s(o.company)
  const title = s(o.title)
  if (!id || !company || !title) return null
  const score = typeof o.match_score === 'number' ? o.match_score : Number(o.match_score)
  return {
    id,
    kind: o.kind === 'initiativ' ? 'initiativ' : 'stelle',
    source: s(o.source),
    company,
    title,
    location: s(o.location),
    url: safeUrl(o.url),
    apply_channel: CHANNELS.includes(o.apply_channel as ApplyChannel) ? (o.apply_channel as ApplyChannel) : 'portal',
    apply_email: safeEmail(o.apply_email),
    contact_name: s(o.contact_name),
    posted_at: s(o.posted_at),
    deadline: s(o.deadline),
    salary: s(o.salary),
    language: s(o.language),
    match_score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
    keywords: Array.isArray(o.keywords)
      ? o.keywords
          .map((k) => {
            const ko = k && typeof k === 'object' ? (k as Record<string, unknown>) : {}
            const term = s(ko.term)
            return term ? { term, matched: ko.matched === true } : null
          })
          .filter((k): k is Keyword => k !== null)
      : [],
    summary: s(o.summary),
    requirements: s(o.requirements),
    why_fit: s(o.why_fit),
    pre_info: s(o.pre_info),
    status: STATUSES.includes(o.status as LeadStatus) ? (o.status as LeadStatus) : 'neu',
    email_subject: s(o.email_subject),
    email_body: typeof o.email_body === 'string' && o.email_body.trim() ? o.email_body : null,
    cover_letter_md: typeof o.cover_letter_md === 'string' && o.cover_letter_md.trim() ? o.cover_letter_md : null,
    cv_highlights: s(o.cv_highlights),
    drafted_at: s(o.drafted_at),
    applied_at: s(o.applied_at),
    notes: typeof o.notes === 'string' ? o.notes : null,
    archive_reason: s(o.archive_reason),
    created_at: s(o.created_at) ?? '',
  }
}

export interface JobsData {
  leads: JobLead[]
  focus: Record<string, string>
  profile: JobProfile | null
}

export async function loadJobs(): Promise<JobsData> {
  if (!supabase) throw new Error('Synchronisation ist nicht eingerichtet.')
  const [l, f, p] = await Promise.all([
    supabase.from('job_leads').select('*').neq('status', 'geloescht').order('created_at', { ascending: false }).limit(500),
    supabase.from('agent_instructions').select('agent_id, focus'),
    supabase.from('job_profile').select('full_name, application_email, phone, location, linkedin_url, cv_text').limit(1),
  ])
  const err = l.error ?? f.error ?? p.error
  if (err) throw new Error(err.message)
  const focus: Record<string, string> = {}
  for (const row of (f.data ?? []) as { agent_id: string; focus: string }[]) focus[row.agent_id] = row.focus ?? ''
  const pr = ((p.data ?? [])[0] ?? null) as (Record<string, unknown> & { cv_text?: string | null }) | null
  return {
    leads: (l.data ?? []).map(parseLead).filter((x): x is JobLead => x !== null),
    focus,
    profile: pr
      ? {
          full_name: s(pr.full_name),
          application_email: safeEmail(pr.application_email),
          phone: s(pr.phone),
          location: s(pr.location),
          linkedin_url: safeUrl(pr.linkedin_url),
          has_cv: !!s(pr.cv_text),
        }
      : null,
  }
}

export type LeadPatch = Partial<Pick<JobLead, 'status' | 'applied_at' | 'notes' | 'archive_reason'>>

export async function updateLead(id: string, patch: LeadPatch): Promise<void> {
  if (!supabase) throw new Error('Synchronisation ist nicht eingerichtet.')
  const { error } = await supabase.from('job_leads').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function saveFocus(agentId: string, focus: string): Promise<void> {
  if (!supabase) throw new Error('Synchronisation ist nicht eingerichtet.')
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Nicht angemeldet.')
  const { error } = await supabase.from('agent_instructions').upsert({ user_id: userId, agent_id: agentId, focus: focus.trim().slice(0, 2000) }, { onConflict: 'user_id,agent_id' })
  if (error) throw new Error(error.message)
}

// ---------- Archiv und Löschen ----------

export const ABSAGE_REASON = 'Absage erhalten'

export const ARCHIVE_REASONS = ['Zu viel Erfahrung verlangt', 'Ort passt nicht', 'Sprache passt nicht', 'Branche passt nicht', 'Firma passt nicht', 'Anzeige nicht mehr online']

/** Ins Archiv nur mit Grund. */
export function archivePatch(reason: string): LeadPatch {
  const clean = reason.trim().slice(0, 200)
  if (!clean) throw new Error('Bitte einen Grund angeben.')
  return { status: 'verworfen', archive_reason: clean }
}

/** Statuswechsel: Eine Absage bringt ihren Grund mit, alles andere trägt keinen Archiv-Grund. */
export function statusPatch(l: Pick<JobLead, 'applied_at'>, status: LeadStatus, now = new Date()): LeadPatch {
  return {
    status,
    applied_at: status === 'beworben' ? now.toISOString() : status === 'neu' || status === 'entwurf' ? null : l.applied_at,
    archive_reason: status === 'absage' ? ABSAGE_REASON : null,
  }
}

// ---------- Auswertung ----------

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function appliedOn(leads: JobLead[], day: Date): number {
  const key = ymd(day)
  return leads.filter((l) => l.applied_at && ymd(new Date(l.applied_at)) === key).length
}

export function daysUntil(date: string | null, now: Date): number | null {
  if (!date) return null
  const d = new Date(`${date.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const t = new Date(`${ymd(now)}T12:00:00`)
  return Math.round((d.getTime() - t.getTime()) / 86400000)
}

export type InboxTab = 'bereit' | 'neu' | 'beworben' | 'archiv'

export function leadsForTab(leads: JobLead[], tab: InboxTab): JobLead[] {
  const byDeadlineThenMatch = (a: JobLead, b: JobLead) => {
    const da = a.deadline ?? '9999-12-31'
    const db = b.deadline ?? '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    return (b.match_score ?? 0) - (a.match_score ?? 0)
  }
  switch (tab) {
    case 'bereit':
      return leads.filter((l) => l.status === 'entwurf').sort(byDeadlineThenMatch)
    case 'neu':
      return leads.filter((l) => l.status === 'neu').sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
    case 'beworben':
      return leads.filter((l) => l.status === 'beworben' || l.status === 'interview').sort((a, b) => ((a.applied_at ?? '') < (b.applied_at ?? '') ? 1 : -1))
    case 'archiv':
      return leads.filter((l) => l.status === 'absage' || l.status === 'verworfen')
  }
}

// ---------- E-Mail (Outlook) ----------

export const MAILTO_LIMIT = 1900

/** Baut einen mailto-Link. Ist der Text zu lang für mailto, wird er ohne Text gebaut und muss eingefügt werden. */
export function buildMailto(lead: Pick<JobLead, 'apply_email' | 'email_subject' | 'email_body'>): { href: string; bodyIncluded: boolean } {
  const to = lead.apply_email ? encodeURIComponent(lead.apply_email).replace(/%40/g, '@') : ''
  const subject = `subject=${encodeURIComponent(lead.email_subject ?? '')}`
  const body = lead.email_body ? `&body=${encodeURIComponent(lead.email_body.replace(/\r?\n/g, '\r\n'))}` : ''
  const full = `mailto:${to}?${subject}${body}`
  if (full.length <= MAILTO_LIMIT) return { href: full, bodyIncluded: !!lead.email_body }
  return { href: `mailto:${to}?${subject}`, bodyIncluded: false }
}

export const CHANNEL_LABEL: Record<ApplyChannel, string> = {
  email: 'E-Mail',
  portal: 'Portal',
  linkedin: 'LinkedIn',
  sonstiges: 'Sonstiges',
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  neu: 'neu',
  entwurf: 'Entwurf bereit',
  beworben: 'beworben',
  interview: 'Interview',
  absage: 'Absage',
  verworfen: 'im Archiv',
  geloescht: 'gelöscht',
}
