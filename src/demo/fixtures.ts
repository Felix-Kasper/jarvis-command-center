// Demo data. Everything here is fictional: the persona, companies, venues, artists,
// portfolio positions and sources (.example domains are reserved and never resolve).
// Dates are generated relative to "today", so the demo always looks like a live system.

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

export const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@jarvis.example',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-10-01T08:00:00Z',
}

/** The demo PIN is public on purpose (shown in the banner): 1234. Stored the same way as in production – salted PBKDF2. */
export const DEMO_PIN = '1234'
const DEMO_PIN_HASH = { v: 1, salt: 'p7b/9giXxJnkfpM3CDXnxg==', iter: 1000, hash: '3vLBIVuWDBOtbSt1KmSVpkshrfumCPqIRxTcQhRgmCM=', len: 4 }

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const plus = (d: Date, days: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}
/** Next weekday on or after d (the planner locks weekends by default). */
const workday = (d: Date) => {
  let x = new Date(d)
  while (x.getDay() === 0 || x.getDay() === 6) x = plus(x, 1)
  return x
}
const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
}
const at = (d: Date, hh: number, mm = 0) => {
  const x = new Date(d)
  x.setHours(hh, mm, 0, 0)
  return x.toISOString()
}

export function buildFixtures(now: Date): Tables {
  const today = ymd(now)
  const d0 = workday(now)
  const d1 = workday(plus(d0, 1))
  const d2 = workday(plus(d1, 1))
  const exam = ymd(workday(plus(now, 23)))
  const monday = plus(now, -((now.getDay() + 6) % 7))
  const kw = isoWeek(now)
  const iso = now.toISOString()
  const day = (n: number) => ymd(plus(now, n))

  // ---------- planner (items table, same format the real sync uses) ----------
  let n = 0
  const task = (t: Row): Row => {
    const id = `demo-task-${++n}`
    return {
      id,
      kind: 'task',
      data: { id, deadlineType: 'weich', status: 'offen', energy: 'mittel', priority: 2, dependsOn: [], createdAt: iso, ...t },
    }
  }
  const tasks = [
    task({ title: 'Wochenziele festlegen', category: 'Persönliches', durationMin: 20, energy: 'niedrig', plannedDate: ymd(d0), status: 'erledigt', completedAt: at(d0, 8, 20) }),
    task({ title: 'Lernblock: ERP-Systeme, Kapitel 5', category: 'Bachelor', priority: 1, durationMin: 90, energy: 'hoch', plannedDate: ymd(d0), description: 'Architektur, Customizing, Fallstudie durchrechnen' }),
    task({ title: 'Probeklausur Rechnungswesen', category: 'Bachelor', priority: 1, durationMin: 60, energy: 'hoch', plannedDate: ymd(d0) }),
    task({ title: 'Bewerbungen abschicken (3 Entwürfe bereit)', category: 'Jobsuche', priority: 1, durationMin: 45, plannedDate: ymd(d0), fixedStart: '15:00', notes: 'Vom Bewerbungs-Schreiber angelegt' }),
    task({ title: `Depot-Report KW ${kw} lesen`, category: 'Finanzen', priority: 3, durationMin: 10, energy: 'niedrig', plannedDate: ymd(d0) }),
    task({ title: 'Portfolio-Website: Projektseite schreiben', category: 'Nebenprojekt', durationMin: 60, plannedDate: ymd(d0) }),
    task({ title: 'Interview vorbereiten: Lumen Software', category: 'Jobsuche', priority: 1, durationMin: 60, energy: 'hoch', plannedDate: ymd(d1), deadline: ymd(d2), deadlineType: 'hart' }),
    task({ title: 'Lerngruppe: Marketing-Fallstudien', category: 'Bachelor', durationMin: 90, plannedDate: ymd(d1) }),
    task({ title: 'Angebot für Kundenprojekt kalkulieren', category: 'Nebenprojekt', durationMin: 45, plannedDate: ymd(d2) }),
    task({ title: 'Bachelor-Prüfung', category: 'Bachelor', priority: 1, durationMin: 30, deadline: exam, deadlineType: 'hart', plannedDate: exam }),
    task({ title: 'Bewerbungsfrist Helix Robotics', category: 'Jobsuche', priority: 1, durationMin: 15, deadline: ymd(plus(d0, 4)), deadlineType: 'hart', plannedDate: ymd(d1) }),
    task({ title: 'Steuerausgleich vorbereiten', category: 'Finanzen', priority: 3, durationMin: 60, energy: 'niedrig' }),
  ]
  const settings = {
    id: 'settings',
    kind: 'settings',
    data: {
      wake: '07:00',
      workStart: '08:00',
      workEnd: '18:00',
      sleep: '22:30',
      lunchStart: '12:00',
      lunchEnd: '12:45',
      focusMaxMin: 90,
      breakMin: 15,
      latestExtendedEnd: '22:00',
      weekendLocked: true,
      categories: ['Bachelor', 'Jobsuche', 'Nebenprojekt', 'Gesundheit/Gym', 'Persönliches', 'Soziales', 'Freizeit', 'Finanzen'],
      leisureBlocks: [
        { id: 'demo-training', title: 'Training', fromDate: '2026-01-01', toDate: '2099-12-31', start: '08:00', end: '09:30', weekdays: [1, 3, 5] },
        { id: 'demo-football', title: 'Fußball mit Freunden', fromDate: '2026-01-01', toDate: '2099-12-31', start: '19:00', end: '21:00', weekdays: [4] },
      ],
    },
  }
  const goals = {
    id: `goals:${ymd(d0)}`,
    kind: 'goals',
    data: {
      date: ymd(d0),
      goals: [
        { text: 'Kapitel 5 sitzt', done: false },
        { text: '3 Bewerbungen raus', done: false },
        { text: 'Projektseite online', done: false },
      ],
    },
  }
  // Visitors arrive at any time of day and week: on weekends and in the evening, release today
  // so the plan is never empty (this also shows off the "release weekend" / "work longer" exceptions)
  const weekend = now.getDay() === 0 || now.getDay() === 6
  const evening = now.getHours() >= 17
  const overrides: Row[] = weekend || evening ? [{ id: `day:${today}`, kind: 'day', data: { date: today, ...(weekend ? { weekendReleased: true } : {}), ...(evening ? { workEnd: '22:00' } : {}) } }] : []
  const items = [...tasks, settings, goals, ...overrides].map((r) => ({
    user_id: DEMO_USER.id,
    ...r,
    updated_at: iso,
    server_updated_at: iso,
    deleted: false,
  }))

  // ---------- agents ----------
  const agents = [
    { id: 'depot', name: 'Depot-Analyst', role: 'Analysten, Insider-Meldungen, Stimmung und Ausblick', status: 'bereit', status_note: `Report KW ${kw} fertig`, schedule_text: 'Montags 07:43', last_run_at: at(monday, 7, 58), next_run_at: at(plus(monday, 7), 7, 43), updated_at: iso },
    { id: 'jobs', name: 'Job-Scout', role: 'Findet passende Stellen und Initiativ-Ziele', status: 'arbeitet', status_note: 'Durchsucht Karriereseiten …', schedule_text: 'Werktags 05:45', last_run_at: at(now, 5, 45), next_run_at: null, updated_at: iso },
    { id: 'writer', name: 'Bewerbungs-Schreiber', role: 'Mailtext, Anschreiben und Lebenslauf-Hinweise', status: 'bereit', status_note: '3 Entwürfe bereit', schedule_text: 'Werktags 06:35', last_run_at: at(now, 6, 52), next_run_at: null, updated_at: iso },
    { id: 'personal', name: 'Personal Manager', role: 'Briefing: News, Events und Konzerte', status: 'bereit', status_note: null, schedule_text: 'Mo + Do 06:05', last_run_at: at(now, 6, 11), next_run_at: null, updated_at: iso },
  ]

  const src = (title: string, path: string) => ({ title: `${title} (Demo)`, url: `https://news.example/${path}`, date: day(-1) })

  const depotReport = {
    id: 'demo-report-depot',
    agent_id: 'depot',
    period: `KW ${kw}/${now.getFullYear()}`,
    title: `Depot-Wochenreport KW ${kw}`,
    summary: 'Tech trägt, Konsumwerte schwach; eine Entscheidung mit Frist.',
    created_at: at(monday, 7, 58),
    content_md: [
      '## Überblick',
      'Das Depot liegt **+11,7 %** über Einstand. Gewinner der Woche sind Software- und Robotikwerte, Konsumtitel bleiben unter Druck.',
      '',
      '## Fakten',
      '- Lumen Software: Quartalszahlen über Erwartung, Prognose angehoben',
      '- Sportwerk AG: Umsatzwarnung, Kursziel von 3 Häusern gesenkt',
      '- Nordwind Energie: öffentliches Übernahmeangebot zu 31,50 €',
      '',
      '## Einordnung',
      '| Position | Signal | Grund |',
      '|---|---|---|',
      '| Lumen Software | positiv | Wachstum + Prognose |',
      '| Sportwerk AG | negativ | Margendruck |',
      '| Nordwind Energie | neutral | Angebot nahe Kurs |',
      '',
      '## Mögliche Handlungsoptionen',
      'Keine Anlageberatung – nur Optionen mit Für und Wider (siehe „Entscheidungen mit Frist“).',
    ].join('\n'),
    data: {
      as_of: ymd(monday),
      mode: 'kurz',
      headline: 'Depot bei 24.380 € (+11,7 %) – Software trägt, Konsum schwach',
      changes: [
        { name: 'Depot', change: '+1,9 % zur Vorwoche' },
        { name: 'Lumen Software', change: 'Kursziel-Konsens von 118 auf 131 USD' },
        { name: 'Sportwerk AG', change: 'von neutral auf negativ' },
      ],
      decisions: [{ name: 'Nordwind Energie', what: 'Übernahmeangebot zu 31,50 € annehmen oder halten', deadline: ymd(plus(now, 9)), options: 'Annehmen: Gewinn sichern · Halten: Chance auf Nachbesserung, Risiko Delisting' }],
      outlook: 'Zinsentscheid nächste Woche, danach Berichtssaison der Konsumwerte.',
      positions: [
        { name: 'Lumen Software', signal: 'positiv', consensus: '22 von 27 Kaufen', price_target: 'Ø 131 USD', insider: 'keine Verkäufe', sentiment: 'positiv', next_event: 'Investor Day in 3 Wochen' },
        { name: 'Alpenrobotik AG', signal: 'positiv', consensus: '6 von 8 Kaufen', sentiment: 'leicht positiv' },
        { name: 'Welt-Aktien ETF', signal: 'neutral', note: 'Basisposition, kein Handlungsbedarf' },
        { name: 'Nordwind Energie', signal: 'neutral', note: 'Übernahmeangebot läuft' },
        { name: 'Sportwerk AG', signal: 'negativ', consensus: 'gemischt', price_target: 'Ø 41 €', sentiment: 'negativ', next_event: 'Q-Zahlen in 2 Wochen' },
      ],
      top_positive: [
        { name: 'Lumen Software', reason: 'Prognose angehoben, Cloud-Umsatz +34 %' },
        { name: 'Alpenrobotik AG', reason: 'Großauftrag aus der Autoindustrie' },
      ],
      top_negative: [
        { name: 'Sportwerk AG', reason: 'Umsatzwarnung, Lager zu hoch' },
        { name: 'Bitcoin', reason: 'hohe Schwankung nach Regulierungs-News' },
      ],
      candidates: [{ name: 'Fjord Medical ASA', isin: 'XX0000000001', why: 'stabiles Wachstum, Nettocash', metrics: 'KGV 18, Marge 21 %', risks: 'Zulassungsrisiko' }],
      risks: ['Klumpenrisiko Technologie (41 % des Depots)', 'Währungsrisiko USD'],
      sources: [src('Quartalszahlen Lumen Software', 'lumen-q3'), src('Umsatzwarnung Sportwerk', 'sportwerk-warnung'), src('Übernahmeangebot Nordwind', 'nordwind-angebot')],
    },
  }

  const jobsReport = {
    id: 'demo-report-jobs',
    agent_id: 'jobs',
    period: today,
    title: 'Job-Scout',
    summary: '6 neue Treffer, 1 Frist diese Woche',
    created_at: at(now, 5, 58),
    content_md: '## Neue Treffer\n- **Lumen Software** – Junior Account Executive (Match 88)\n- **Helix Robotics** – SDR, Frist in 4 Tagen\n\nAussortiert: 3 Stellen ohne festen Ort, 2 mit > 5 Jahren Erfahrung.',
    data: { headline: '6 neue Treffer – Helix Robotics endet in 4 Tagen', decisions: [{ name: 'Helix Robotics', what: 'Bewerbung SDR', deadline: ymd(plus(d0, 4)) }] },
  }
  const writerReport = {
    id: 'demo-report-writer',
    agent_id: 'writer',
    period: today,
    title: 'Bewerbungs-Schreiber',
    summary: '3 Entwürfe bereit, Block 15:00 eingeplant',
    created_at: at(now, 6, 52),
    content_md: '## Entwürfe\n1. Lumen Software (E-Mail)\n2. Alpenwerk Digital (Portal)\n3. Nordstern Consulting (E-Mail)\n\nBewerbungs-Block heute **15:00–15:45** im Planer.',
    data: { headline: '3 Entwürfe bereit – Block heute 15:00' },
  }

  const ev = (title: string, offset: number, start: string, tag: string, venue: string, price: string) => ({
    key: `events|${title.toLowerCase()}|${day(offset)}`,
    title,
    date: day(offset),
    start,
    venue,
    city: 'München',
    price,
    tag,
    url: `https://events.example/${encodeURIComponent(title.toLowerCase())}`,
  })
  const concertMonth = plus(now, 98).toLocaleDateString('de-DE', { month: 'long' })
  const briefing = {
    id: 'demo-report-personal',
    agent_id: 'personal',
    period: today,
    title: `Briefing ${now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`,
    summary: 'Konzert-Ankündigung und Comedy heute Abend',
    created_at: at(now, 6, 11),
    content_md: '',
    data: {
      as_of: today,
      mode: 'kurz',
      headline: `Northern Echoes spielen im ${concertMonth} – und heute Abend Comedy im Kulturhaus`,
      sections: [
        {
          id: 'aktien',
          items: [
            { title: 'Lumen Software hebt Jahresprognose an', date: day(-1), tag: 'Lumen', url: 'https://news.example/lumen-prognose', source: 'Demo-News' },
            { title: 'Sportwerk senkt Umsatzziel', date: day(-2), tag: 'Sportwerk', url: 'https://news.example/sportwerk', source: 'Demo-News' },
          ],
        },
        {
          id: 'fuer_dich',
          items: [
            { title: 'Warum KI-Agenten den Vertrieb verändern', tag: 'Wirtschaft', url: 'https://news.example/ki-vertrieb', source: 'Demo-Magazin' },
            { title: 'Champions League: Topspiel am Mittwoch', tag: 'Fußball', url: 'https://news.example/cl', source: 'Demo-Sport' },
            { title: 'Neues Buch über die Evolution der Kooperation', tag: 'Wissen', url: 'https://news.example/buch', source: 'Demo-Feuilleton' },
          ],
        },
        {
          id: 'events',
          items: [
            ev('Stand-up Comedy Abend', 0, '20:00', 'Comedy', 'Kulturhaus Ost', '18 €'),
            ev('Techno im Kesselhaus', 1, '23:00', 'Club', 'Kesselhaus', '12 €'),
            ev('Eishockey: Heimspiel', 2, '19:30', 'Sport', 'Eisarena', 'ab 15 €'),
            ev('Vortrag: Quantencomputer einfach erklärt', 3, '18:30', 'Vortrag', 'Uni Hörsaal 1', 'frei'),
          ],
        },
        {
          id: 'konzerte',
          items: [
            { title: 'Northern Echoes – Live', artist: 'Northern Echoes', date: day(98), start: '20:00', venue: 'Olympiahalle', city: 'München', price: 'ab 59 €', tag: 'Konzert', url: 'https://events.example/northern-echoes' },
            { title: 'Mira Sol – Club Tour', artist: 'Mira Sol', date: day(31), start: '21:00', venue: 'Rockhouse', city: 'Salzburg', price: '35 €', tag: 'Konzert', url: 'https://events.example/mira-sol' },
          ],
        },
        { id: 'tipps', items: [{ title: 'Heute Abend Comedy – nach dem Lernblock abschalten', date: day(0), start: '20:00' }] },
      ],
      sources: [],
    },
  }

  // ---------- portfolio (fictional) ----------
  const pos = (id: string, name: string, asset_type: string, buy: number, value: number, account = 'Depot') => ({
    id,
    account,
    name,
    wkn: null,
    isin: null,
    ticker: null,
    asset_type,
    quantity: null,
    avg_buy_price_eur: null,
    buy_value_eur: buy,
    market_value_eur: value,
    value_as_of: ymd(monday),
    notes: null,
    active: true,
    user_id: DEMO_USER.id,
  })
  const depot_positions = [
    pos('p1', 'Welt-Aktien ETF', 'ETF', 8000, 8920.4),
    pos('p2', 'Lumen Software', 'Aktie', 3100, 4385.1),
    pos('p3', 'Europa Dividenden ETF', 'ETF', 3500, 3612.75),
    pos('p4', 'Alpenrobotik AG', 'Aktie', 2200, 2671.3),
    pos('p5', 'Nordwind Energie', 'Aktie', 1900, 2058.0),
    pos('p6', 'Sportwerk AG', 'Aktie', 2100, 1514.45),
    pos('p7', 'Bitcoin', 'Krypto', 1030, 1218.0, 'Krypto-Börse'),
  ]

  // ---------- applications (fictional companies, .example domains) ----------
  const letter = (company: string, role: string, hook: string) =>
    [
      `**Bewerbung als ${role}**`,
      '',
      'Sehr geehrte Damen und Herren,',
      '',
      `${hook} Genau an dieser Schnittstelle möchte ich ab dem Frühjahr bei ${company} arbeiten.`,
      '',
      'Im Vertrieb habe ich den kompletten Zyklus von der Erstansprache bis zum Abschluss verantwortet und dabei gelernt, Kundenprobleme schnell zu verstehen. Parallel habe ich mit KI-Werkzeugen eigene Automatisierungen gebaut – unter anderem ein Agenten-System, das Recherche und Entwürfe für mich vorbereitet.',
      '',
      'Ich bringe Struktur, Neugier und echte Freude am Gespräch mit Kunden mit. Über eine Einladung zu einem Kennenlernen freue ich mich sehr.',
      '',
      'Mit freundlichen Grüßen',
      'Alex Beispiel',
    ].join('\n')
  const lead = (l: Row): Row => ({
    kind: 'stelle',
    source: 'Karriereseite',
    apply_channel: 'portal',
    keywords: [],
    status: 'neu',
    created_at: at(now, 5, 50),
    user_id: DEMO_USER.id,
    ...l,
  })
  const job_leads = [
    lead({
      id: 'lead-1',
      company: 'Lumen Software GmbH',
      title: 'Junior Account Executive (m/w/d) – KI-Plattform',
      location: 'München',
      url: 'https://lumen-software.example/jobs/junior-ae',
      apply_channel: 'email',
      apply_email: 'talent@lumen-software.example',
      contact_name: 'Frau Berger',
      match_score: 88,
      keywords: [
        { term: 'B2B-Vertrieb', matched: true },
        { term: 'SaaS', matched: true },
        { term: 'KI-Verständnis', matched: true },
        { term: 'HubSpot', matched: true },
        { term: 'Salesforce', matched: false },
      ],
      summary: 'Neukunden im Mittelstand für eine KI-Plattform gewinnen, eigenes Gebiet Süddeutschland.',
      requirements: '- Abgeschlossenes Studium\n- Erste Vertriebserfahrung\n- Begeisterung für KI',
      why_fit: 'Vertriebserfahrung + eigene KI-Projekte, Standort passt.',
      pre_info: 'Gehaltsband im Inserat: 48–55 k€ + Provision. Deutscher Lebenslauf empfohlen.',
      salary: '48–55 k€ + Provision',
      deadline: ymd(plus(now, 12)),
      status: 'entwurf',
      email_subject: 'Bewerbung als Junior Account Executive – Alex Beispiel',
      email_body: 'Sehr geehrte Frau Berger,\n\nIhre KI-Plattform löst ein Problem, das ich aus dem Vertrieb kenne: zu viel Zeit für Recherche, zu wenig für Kunden. Deshalb bewerbe ich mich als Junior Account Executive.\n\nIch habe den kompletten Sales-Zyklus verantwortet und baue nebenbei eigene KI-Automatisierungen. Lebenslauf und Anschreiben finden Sie im Anhang.\n\nIch freue mich auf ein Gespräch.\n\nViele Grüße\nAlex Beispiel',
      cover_letter_md: letter('Lumen Software', 'Junior Account Executive', 'Vertrieb und KI wachsen gerade zusammen.'),
      cv_highlights: '- Sales-Zyklus von Erstansprache bis Abschluss\n- Eigenes Multi-Agenten-System (Supabase, Claude)\n- HubSpot im Praktikum',
      drafted_at: at(now, 6, 40),
    }),
    lead({
      id: 'lead-2',
      company: 'Alpenwerk Digital',
      title: 'Business Development Manager KI-Lösungen',
      location: 'Innsbruck',
      url: 'https://alpenwerk.example/karriere/bdm-ki',
      match_score: 84,
      keywords: [
        { term: 'Business Development', matched: true },
        { term: 'Consulting', matched: true },
        { term: 'Microsoft 365', matched: false },
      ],
      summary: 'KI-Projekte bei Industriekunden anbahnen, Workshops moderieren.',
      why_fit: 'Consulting-Praktikum + KI-Projekte.',
      status: 'entwurf',
      cover_letter_md: letter('Alpenwerk Digital', 'Business Development Manager', 'Viele Unternehmen wissen, dass KI wichtig ist – aber nicht, wo sie anfangen sollen.'),
      cv_highlights: '- Workshops mit Geschäftsführung\n- Fördervolumen von Projekten',
      drafted_at: at(now, 6, 45),
    }),
    lead({
      id: 'lead-3',
      company: 'Nordstern Consulting',
      title: 'Junior Consultant Data & AI',
      location: 'München',
      url: 'https://nordstern.example/jobs/data-ai',
      apply_channel: 'email',
      apply_email: 'jobs@nordstern.example',
      match_score: 81,
      keywords: [
        { term: 'SQL', matched: true },
        { term: 'Python', matched: true },
        { term: 'Power BI', matched: false },
      ],
      status: 'entwurf',
      email_subject: 'Bewerbung Junior Consultant Data & AI',
      email_body: 'Sehr geehrte Damen und Herren,\n\nanbei meine Bewerbung als Junior Consultant Data & AI.\n\nViele Grüße\nAlex Beispiel',
      cover_letter_md: letter('Nordstern Consulting', 'Junior Consultant Data & AI', 'Daten werden erst wertvoll, wenn jemand sie in Entscheidungen übersetzt.'),
      drafted_at: at(now, 6, 50),
    }),
    lead({ id: 'lead-4', company: 'Helix Robotics', title: 'Sales Development Representative', location: 'Augsburg', url: 'https://helix.example/jobs/sdr', match_score: 76, deadline: ymd(plus(d0, 4)), keywords: [{ term: 'Kaltakquise', matched: true }, { term: 'Englisch C1', matched: false }] }),
    lead({ id: 'lead-5', company: 'Quantum Retail Group', title: 'Customer Success Manager', location: 'Nürnberg', url: 'https://quantum-retail.example/jobs/csm', match_score: 72 }),
    lead({ id: 'lead-6', kind: 'initiativ', company: 'Kraftwerk Cloud', title: 'Initiativbewerbung Vertrieb', location: 'München', url: 'https://kraftwerk-cloud.example/karriere', apply_channel: 'email', apply_email: 'karriere@kraftwerk-cloud.example', match_score: 69 }),
    lead({ id: 'lead-7', company: 'Brightpath AI', title: 'Junior Solutions Consultant', location: 'München', url: 'https://brightpath.example/jobs/sc', match_score: 86, status: 'interview', applied_at: at(plus(now, -9), 15, 10), notes: 'Zweites Gespräch nächste Woche' }),
    lead({ id: 'lead-8', company: 'Talwind Systems', title: 'Inside Sales Manager', location: 'Innsbruck', url: 'https://talwind.example/jobs/isr', match_score: 78, status: 'beworben', applied_at: at(plus(now, -3), 15, 20) }),
    lead({ id: 'lead-9', company: 'Gipfel Logistik', title: 'Key Account Manager', location: 'Salzburg', url: 'https://gipfel.example/jobs/kam', match_score: 64, status: 'verworfen', archive_reason: 'Zu viel Erfahrung verlangt' }),
  ]

  return {
    items,
    agents,
    agent_reports: [depotReport, jobsReport, writerReport, briefing],
    agent_instructions: [{ user_id: DEMO_USER.id, agent_id: 'jobs', focus: 'Diese Woche nur B2B-SaaS, auch Customer Success' }],
    depot_positions,
    job_leads,
    job_profile: [{ user_id: DEMO_USER.id, full_name: 'Alex Beispiel', application_email: 'alex@jarvis.example', phone: null, location: 'München', linkedin_url: 'https://www.linkedin.com/', cv_text: 'Demo-Lebenslauf' }],
    personal_profile: [{ user_id: DEMO_USER.id, depot_pin: DEMO_PIN_HASH }],
    news_feedback: [],
  }
}
