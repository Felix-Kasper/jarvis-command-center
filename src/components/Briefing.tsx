import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Settings } from '../types'
import { store } from '../lib/store'
import { saveFocus } from '../lib/jobs'
import { syncConfigured } from '../lib/supabase'
import { addDays, formatDateShort, parseDate, relativeDay, toMin } from '../lib/time'
import { eventToLeisure, leisureId, loadBriefing, savedItems, setReaction, visibleItems, type BriefingData, type BriefingItem, type Reaction } from '../lib/briefing'
import { lockDepot, maskMoney, useDepotUnlocked } from '../lib/privacy'
import { PinDialog } from './PinDialog'

const TAB_LABEL: Record<string, string> = {
  aktien: 'Aktien',
  fuer_dich: 'Für dich',
  events: 'Events',
  konzerte: 'Konzerte',
  merkliste: 'Merkliste',
}
const DATED = new Set(['events', 'konzerte', 'tipps'])
const COLLAPSE_KEY = 'jarvis:v1:briefing-collapsed'
const TAB_KEY = 'jarvis:v1:briefing-tab'
const LIMIT = 6
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

function readLS(k: string): string | null {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function writeLS(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* ignorieren */
  }
}

function nextRunText(iso: string | null | undefined, fallback: string | null | undefined): string {
  const d = iso ? new Date(iso) : null
  if (d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now())
    return (
      d.toLocaleString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' Uhr'
    )
  return fallback ?? 'Montag, 06:05'
}

interface Props {
  signedIn: boolean
  now: Date
  today: string
  settings: Settings
  notify: (text: string, undo?: () => void) => void
  onOpenAgents: () => void
  variant?: 'teaser' | 'full' // teaser = kompakte Karte auf „Heute“, full = eigener Tab
  onOpen?: () => void
}

/** Persönliches Briefing des Personal Managers – oben im Planer, mit Reaktionen und „In Planer“. */
export function Briefing({ signedIn, today, settings, notify, onOpenAgents, variant = 'full', onOpen }: Props) {
  const [data, setData] = useState<BriefingData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<Record<string, Reaction | null>>({}) // sofort sichtbare Reaktionen
  const [tab, setTab] = useState<string>(() => readLS(TAB_KEY) ?? 'events')
  const [day, setDay] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [collapsedId, setCollapsedId] = useState<string | null>(() => readLS(COLLAPSE_KEY))
  const [wishOpen, setWishOpen] = useState(false)
  const [wish, setWish] = useState('')
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState(false)
  const unlocked = useDepotUnlocked()

  const refresh = useCallback(async () => {
    try {
      setData(await loadBriefing())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const working = data?.agent?.status === 'arbeitet'
  useEffect(() => {
    if (!signedIn || !syncConfigured) return
    void refresh()
    const id = setInterval(() => void refresh(), working ? 60_000 : 300_000)
    const onVis = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [signedIn, working, refresh])

  const feedback = useMemo(() => {
    const f: Record<string, Reaction> = { ...(data?.feedback ?? {}) }
    for (const [k, v] of Object.entries(local)) {
      if (v) f[k] = v
      else delete f[k]
    }
    return f
  }, [data, local])

  // Refs, damit „Rückgängig“ im Toast mit dem aktuellen Stand arbeitet
  const feedbackRef = useRef(feedback)
  const settingsRef = useRef(settings)
  useEffect(() => {
    feedbackRef.current = feedback
    settingsRef.current = settings
  })

  const issue = data?.issues[0]
  const issueOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of [...(data?.issues ?? [])].reverse()) for (const s of i.sections) for (const it of s.items) m.set(it.key, i.id)
    return m
  }, [data])

  const tabs = useMemo(() => {
    const secs = (issue?.sections ?? []).filter((s) => s.id !== 'tipps')
    const list = secs.map((s) => ({
      id: s.id,
      label: TAB_LABEL[s.id] ?? s.title,
      title: s.title,
      items: visibleItems(s.items, feedback, today),
      hidden: s.items.filter((i) => feedback[i.key] === 'nicht'),
    }))
    list.push({
      id: 'merkliste',
      label: 'Merkliste',
      title: 'Gemerkt und eingeplant',
      items: data ? savedItems(data.issues, feedback, today) : [],
      hidden: [],
    })
    return list
  }, [issue, data, feedback, today])

  const tips = useMemo(() => {
    const s = issue?.sections.find((x) => x.id === 'tipps')
    return s ? visibleItems(s.items, feedback, today) : []
  }, [issue, feedback, today])

  if (!syncConfigured || !signedIn) return null
  if (!data)
    return error ? (
      <div className="banner standalone">
        <span className="muted small">Briefing konnte nicht geladen werden: {error}</span>
        <button className="link-btn small" onClick={() => void refresh()}>
          Erneut versuchen
        </button>
      </div>
    ) : null

  // ---------- Aktionen ----------

  const react = async (item: BriefingItem, r: Reaction) => {
    const prev = feedbackRef.current[item.key] ?? null
    const next = prev === r ? null : r
    setLocal((l) => ({ ...l, [item.key]: next }))
    try {
      await setReaction(item, next, issueOf.get(item.key) ?? issue?.id ?? '')
    } catch (e) {
      setLocal((l) => ({ ...l, [item.key]: prev }))
      notify(`Nicht gespeichert: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    if (next === 'nicht') notify('Ausgeblendet – der Personal Manager merkt sich das.', () => void react(item, 'nicht'))
    else if (next === 'gemerkt') notify('Gemerkt – steht in der Merkliste.')
  }

  const isPlanned = (item: BriefingItem) => settings.leisureBlocks.some((b) => b.id === leisureId(item.key))

  const togglePlan = (item: BriefingItem) => {
    const id = leisureId(item.key)
    const cur = settingsRef.current
    if (cur.leisureBlocks.some((b) => b.id === id)) {
      const removed = cur.leisureBlocks.find((b) => b.id === id)!
      store.setSettings({
        ...cur,
        leisureBlocks: cur.leisureBlocks.filter((b) => b.id !== id),
      })
      if (feedbackRef.current[item.key] === 'eingeplant') void react(item, 'eingeplant')
      notify('Aus dem Planer entfernt.', () =>
        store.setSettings({
          ...settingsRef.current,
          leisureBlocks: [...settingsRef.current.leisureBlocks, removed],
        }),
      )
      return
    }
    const block = eventToLeisure(item)
    if (!block) return
    store.setSettings({ ...cur, leisureBlocks: [...cur.leisureBlocks, block] })
    const prev = feedbackRef.current[item.key] ?? null
    setLocal((l) => ({ ...l, [item.key]: 'eingeplant' }))
    setReaction(item, 'eingeplant', issueOf.get(item.key) ?? issue?.id ?? '').catch(() => setLocal((l) => ({ ...l, [item.key]: prev })))
    const inWork = toMin(block.start) < toMin(settings.workEnd) && toMin(block.end) > toMin(settings.workStart) && parseDate(block.fromDate).getDay() % 6 !== 0
    notify(`Im Planer: ${formatDateShort(block.fromDate)}, ${block.start}–${block.end}${inWork ? ' (liegt in der Arbeitszeit)' : ''}`, () => {
      store.setSettings({
        ...settingsRef.current,
        leisureBlocks: settingsRef.current.leisureBlocks.filter((b) => b.id !== block.id),
      })
      setLocal((l) => ({ ...l, [item.key]: prev }))
      void setReaction(item, prev, issueOf.get(item.key) ?? issue?.id ?? '').catch(() => undefined)
    })
  }

  const saveWish = async () => {
    setBusy(true)
    try {
      await saveFocus('personal', wish)
      setData((d) => (d ? { ...d, focus: wish.trim() } : d))
      setWishOpen(false)
      notify('Gespeichert – gilt ab dem nächsten Briefing.')
    } catch (e) {
      notify(`Nicht gespeichert: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const chooseTab = (id: string) => {
    setTab(id)
    setDay(null)
    setFilter(null)
    setShowAll(false)
    setShowHidden(false)
    writeLS(TAB_KEY, id)
  }

  // ---------- Bausteine ----------

  const wishEditor = wishOpen && (
    <div className="bf-wish">
      <textarea
        rows={3}
        maxLength={2000}
        value={wish}
        onChange={(e) => setWish(e.target.value)}
        placeholder="z. B. „Mehr Konzerte, weniger Sport-News“"
      />
      <div className="row">
        <button className="primary small-btn" disabled={busy} onClick={() => void saveWish()}>
          Speichern
        </button>
        <button className="ghost small-btn" onClick={() => setWishOpen(false)}>
          Abbrechen
        </button>
      </div>
    </div>
  )

  const wishButton = (
    <button
      className="link-btn small"
      onClick={() => {
        setWish(data.focus)
        setWishOpen((o) => !o)
      }}
    >
      {data.focus ? 'Wünsche ändern' : 'Wünsche'}
    </button>
  )

  const statusLine = working ? (
    <p className="bf-status small">
      Personal Manager stellt gerade die nächste Ausgabe zusammen
      <span className="dots" aria-hidden="true" />
    </p>
  ) : data.agent?.status === 'fehler' ? (
    <p className="bf-status small muted">Letzter Lauf mit Problem: {data.agent.statusNote ?? 'unbekannt'}</p>
  ) : null

  if (variant === 'teaser') {
    const count = tabs.filter((t) => t.id !== 'merkliste').reduce((n, t) => n + t.items.length, 0) + tips.length
    return (
      <button className="card bf-teaser" onClick={onOpen} aria-label="Briefing öffnen">
        <span className="eyebrow">Briefing</span>
        <span className="bf-teaser-head">
          {issue ? issue.headline || issue.title : working ? 'Dein erstes Briefing entsteht gerade …' : `Erstes Briefing: ${nextRunText(data.agent?.nextRunAt, data.agent?.scheduleText)}`}
        </span>
        {issue && count > 0 && (
          <span className="bf-teaser-more">
            {count} neu <span aria-hidden="true">›</span>
          </span>
        )}
      </button>
    )
  }

  if (!issue)
    return (
      <section className="briefing briefing-empty" aria-label="Briefing">
        <div className="bf-top">
          <span className="eyebrow">Dein Briefing</span>
          <span className="spacer" />
          {wishButton}
        </div>
        <h2 className="bf-headline">{working ? 'Dein erstes Briefing entsteht gerade …' : `Dein erstes Briefing kommt ${nextRunText(data.agent?.nextRunAt, data.agent?.scheduleText)}`}</h2>
        {wishEditor}
      </section>
    )

  const collapsed = variant === 'full' ? false : collapsedId === issue.id
  const toggleCollapse = () => {
    const v = collapsed ? null : issue.id
    setCollapsedId(v)
    writeLS(COLLAPSE_KEY, v)
  }

  const active = tabs.find((t) => t.id === tab) ?? tabs.find((t) => t.items.length > 0) ?? tabs[0]
  const field: 'tag' | 'city' = active.id === 'konzerte' ? 'city' : 'tag'
  const days = active.id === 'events' ? Array.from({ length: 7 }, (_, i) => addDays(today, i)) : []
  const filterValues = [...new Set(active.items.map((i) => i[field]).filter((v): v is string => !!v))]
  let items = active.items
  if (day) items = items.filter((i) => i.date === day)
  if (filter) items = items.filter((i) => i[field] === filter)
  const shown = showAll ? items : items.slice(0, LIMIT)

  const renderWhen = (item: BriefingItem) => {
    if (!item.date) return null
    const d = parseDate(item.date)
    const rel = relativeDay(item.date, today)
    return (
      <div className={`bi-when ${rel === 'heute' ? 'bi-today' : ''}`}>
        <span>{rel === 'heute' ? 'Heute' : rel === 'morgen' ? 'Morgen' : WD[d.getDay()]}</span>
        <strong>
          {d.getDate()}.{d.getMonth() + 1}.
        </strong>
        {item.start && <span>{item.start}</span>}
      </div>
    )
  }

  const renderActions = (item: BriefingItem, compact?: boolean) => {
    const r = feedback[item.key]
    const planned = isPlanned(item)
    const canPlan = !!item.date && DATED.has(item.section)
    return (
      <div className="bi-actions">
        {canPlan && (
          <button
            className={`react react-plan ${planned ? 'on' : ''}`}
            aria-pressed={planned}
            onClick={() => togglePlan(item)}
            title={planned ? 'Aus dem Planer entfernen' : 'Als Freizeitblock in den Planer'}
          >
            {planned ? '✓ Im Planer' : '+ In Planer'}
          </button>
        )}
        <span className="spacer" />
        {!compact && (
          <button className={`react react-icon ${r === 'mag' ? 'on' : ''}`} aria-pressed={r === 'mag'} onClick={() => void react(item, 'mag')} title="Mag ich – mehr davon">
            {r === 'mag' ? '♥' : '♡'}
            <span className="sr-only"> Mag ich</span>
          </button>
        )}
        <button className={`react react-icon ${r === 'gemerkt' ? 'on' : ''}`} aria-pressed={r === 'gemerkt'} onClick={() => void react(item, 'gemerkt')} title="Merken">
          {r === 'gemerkt' ? '★' : '☆'}
          <span className="sr-only"> Merken</span>
        </button>
        <button
          className={`react react-icon react-no ${r === 'nicht' ? 'on' : ''}`}
          aria-pressed={r === 'nicht'}
          onClick={() => void react(item, 'nicht')}
          title={r === 'nicht' ? 'Wieder einblenden' : 'Nicht für mich'}
          aria-label={r === 'nicht' ? 'Wieder einblenden' : 'Nicht für mich'}
        >
          {r === 'nicht' ? '↺' : '✕'}
        </button>
      </div>
    )
  }

  const renderItem = (item: BriefingItem, faded?: boolean) => {
    const dated = DATED.has(item.section) && !!item.date
    const where = [item.venue, item.section === 'konzerte' ? item.city : undefined].filter(Boolean).join(', ')
    return (
      <article key={item.key} className={`bi ${dated ? 'bi-dated' : ''} ${faded ? 'bi-faded' : ''} ${feedback[item.key] === 'mag' ? 'bi-liked' : ''}`}>
        {dated && renderWhen(item)}
        <div className="bi-body">
          <div className="bi-meta">
            {item.tag && <span className="bi-tag">{item.tag}</span>}
            {item.artist && !item.title.toLowerCase().includes(item.artist.toLowerCase()) && <span className="bi-artist">{item.artist}</span>}
            {where && <span>{where}</span>}
            {item.price && <span className="bi-price">{item.price}</span>}
          </div>
          <h4 className="bi-title">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
            ) : (
              item.title
            )}
          </h4>
          {!dated && item.date && <p className="bi-source">{relativeDay(item.date, today)}</p>}
          {renderActions(item)}
        </div>
      </article>
    )
  }

  const depotLine = active.id === 'aktien' && data.depotHeadline && (
    <div className="bf-depot">
      <span className="eyebrow">Depot-Lage</span>
      <span className="bf-depot-text">{unlocked ? data.depotHeadline : maskMoney(data.depotHeadline)}</span>
      <span className="spacer" />
      {unlocked ? (
        <button className="link-btn small" onClick={lockDepot}>
          Sperren
        </button>
      ) : (
        <button className="link-btn small" onClick={() => setPin(true)}>
          🔒 Beträge zeigen
        </button>
      )}
      <button className="link-btn small" onClick={onOpenAgents}>
        Depot öffnen
      </button>
    </div>
  )

  return (
    <section className={`briefing ${collapsed ? 'briefing-collapsed' : ''}`} aria-label="Briefing">
      <div className="bf-top">
        <h2 className="bf-headline" onClick={collapsed ? toggleCollapse : undefined}>
          {issue.headline || issue.title}
        </h2>
        {!collapsed && wishButton}
      </div>
      {statusLine}

      {!collapsed && (
        <>
          {wishEditor}

          {tips.length > 0 && (
            <div className="bf-tips">
              <span className="eyebrow">Vorschläge</span>
              <ul>
                {tips.map((t) => (
                  <li key={t.key}>
                    <div>
                      <strong>
                        {t.url ? (
                          <a href={t.url} target="_blank" rel="noopener noreferrer">
                            {t.title}
                          </a>
                        ) : (
                          t.title
                        )}
                      </strong>
                      {t.date && (
                        <span className="bf-when-chip">
                          {relativeDay(t.date, today)}
                          {t.start ? ` · ${t.start}` : ''}
                        </span>
                      )}
                    </div>
                    {renderActions(t, true)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bf-tabs" role="tablist" aria-label="Rubriken">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === active.id} className={t.id === active.id ? 'active' : ''} onClick={() => chooseTab(t.id)}>
                {t.label}
                {t.items.length > 0 && <span className="bf-count">{t.items.length}</span>}
              </button>
            ))}
          </div>

          <div className="bf-panel" role="tabpanel" aria-label={active.title}>
            {depotLine}
            {days.length > 0 && (
              <div className="bf-days" role="group" aria-label="Tag wählen">
                {days.map((d) => {
                  const n = active.items.filter((i) => i.date === d).length
                  const dd = parseDate(d)
                  const rel = relativeDay(d, today)
                  return (
                    <button
                      key={d}
                      className={`bf-day ${day === d ? 'active' : ''} ${dd.getDay() % 6 === 0 ? 'weekend' : ''}`}
                      disabled={!n}
                      onClick={() => setDay(day === d ? null : d)}
                      aria-pressed={day === d}
                    >
                      <span>{rel === 'heute' ? 'Heute' : WD[dd.getDay()]}</span>
                      <strong>{dd.getDate()}</strong>
                      <em>{n ? `${n}` : '–'}</em>
                    </button>
                  )
                })}
              </div>
            )}
            {filterValues.length > 1 && (
              <div className="chips bf-filter">
                {filterValues.map((v) => (
                  <button key={v} className={`chip ${filter === v ? 'active' : ''}`} onClick={() => setFilter(filter === v ? null : v)} aria-pressed={filter === v}>
                    {v}
                  </button>
                ))}
              </div>
            )}

            {shown.length > 0 ? (
              <div className="bi-grid">{shown.map((i) => renderItem(i))}</div>
            ) : (
              <p className="muted small bf-empty">
                {active.id === 'merkliste' ? 'Nichts gemerkt.' : 'Nichts Neues.'}
              </p>
            )}

            <div className="row bf-more">
              {items.length > LIMIT && (
                <button className="link-btn small" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? 'Weniger anzeigen' : `Alle ${items.length} anzeigen`}
                </button>
              )}
              {active.hidden.length > 0 && (
                <button className="link-btn small muted" onClick={() => setShowHidden((s) => !s)}>
                  {showHidden ? 'Ausgeblendete verbergen' : `${active.hidden.length} ausgeblendet`}
                </button>
              )}
            </div>
            {showHidden && active.hidden.length > 0 && <div className="bi-grid">{active.hidden.map((i) => renderItem(i, true))}</div>}
          </div>

        </>
      )}
      {pin && <PinDialog onClose={() => setPin(false)} onUnlocked={() => setPin(false)} />}
    </section>
  )
}
