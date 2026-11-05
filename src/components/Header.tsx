import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SyncInfo } from '../types'

export type View = 'heute' | 'briefing' | 'bewerbungen' | 'agenten'

const SYNC_LABEL: Record<SyncInfo['state'], string> = {
  lokal: 'Nur lokal',
  abgemeldet: 'Nicht angemeldet',
  synchronisiert: 'Synchronisiert',
  synchronisiere: 'Synchronisiere …',
  offline: 'Offline',
  fehler: 'Sync-Fehler',
}

// Schlichte Linien-Symbole (eigene Zeichnungen, 24×24)
const ICONS: Record<View | 'settings', ReactNode> = {
  heute: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  briefing: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" />
    </>
  ),
  bewerbungen: (
    <>
      <path d="M20.5 3.5 10 14" />
      <path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />
    </>
  ),
  agenten: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="3.5" />
      <path d="M12 8V5M9.5 13h.01M14.5 13h.01" />
      <circle cx="12" cy="4" r="1.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
}

export function Icon({ name, size = 24 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

const ITEMS: { view: View; label: string }[] = [
  { view: 'heute', label: 'Heute' },
  { view: 'briefing', label: 'Briefing' },
  { view: 'bewerbungen', label: 'Bewerbungen' },
  { view: 'agenten', label: 'Agenten' },
]

interface NavProps {
  view: View
  onView: (v: View) => void
  sync: SyncInfo
  onSettings: () => void
  agentsWorking: boolean
  readyCount: number
}

function Badge({ view, agentsWorking, readyCount }: { view: View; agentsWorking: boolean; readyCount: number }) {
  if (view === 'bewerbungen' && readyCount > 0)
    return (
      <span className="nav-badge" aria-label={`${readyCount} Entwürfe bereit`}>
        {readyCount}
      </span>
    )
  if (view === 'agenten' && agentsWorking) return <span className="nav-dot" aria-label="Agent arbeitet" />
  return null
}

/** Seitenleiste (Laptop) und Tab-Leiste (iPhone) – per CSS wird jeweils eine angezeigt. */
export function Nav({ view, onView, sync, onSettings, agentsWorking, readyCount }: NavProps) {
  return (
    <>
      <aside className="sidebar" aria-label="Navigation">
        <div className="sidebar-brand">JARVIS</div>
        <nav className="sidebar-nav">
          {ITEMS.map((it) => (
            <button key={it.view} data-view={it.view} className={view === it.view ? 'active' : ''} aria-current={view === it.view ? 'page' : undefined} onClick={() => onView(it.view)}>
              <Icon name={it.view} size={20} />
              <span className="nav-label">{it.label}</span>
              <Badge view={it.view} agentsWorking={agentsWorking} readyCount={readyCount} />
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className={`sync-line sync-${sync.state}`} onClick={onSettings} title={sync.message ?? SYNC_LABEL[sync.state]}>
            <span className="sync-dot" aria-hidden="true" />
            {SYNC_LABEL[sync.state]}
            {sync.pendingCount > 0 && sync.state !== 'lokal' ? ` · ${sync.pendingCount}` : ''}
          </button>
          <button className="sidebar-settings" onClick={onSettings} aria-label="Einstellungen">
            <Icon name="settings" size={20} />
            <span>Einstellungen</span>
          </button>
        </div>
      </aside>

      <nav className="tabbar" aria-label="Navigation">
        {ITEMS.map((it) => (
          <button key={it.view} data-view={it.view} className={view === it.view ? 'active' : ''} aria-current={view === it.view ? 'page' : undefined} onClick={() => onView(it.view)}>
            <span className="tab-icon">
              <Icon name={it.view} />
              <Badge view={it.view} agentsWorking={agentsWorking} readyCount={readyCount} />
            </span>
            <span className="tab-label">{it.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

/** Großer Seitentitel im iOS-Stil. Rechts optionale Aktionen; das Zahnrad nur auf dem iPhone (am Laptop in der Seitenleiste). */
export function PageHeader({ title, subtitle, children, onSettings, sync }: { title: string; subtitle?: ReactNode; children?: ReactNode; onSettings: () => void; sync: SyncInfo }) {
  // Wie in iOS: Scrollt der große Titel aus dem Bild, erscheint oben eine kompakte Titelleiste
  const ref = useRef<HTMLHeadingElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: '-8px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div className={`top-bar ${compact ? 'show' : ''}`} aria-hidden={!compact}>
        <span>{title}</span>
      </div>
      <header className="page-header">
        <div className="page-title">
          <h1 ref={ref}>{title}</h1>
          {subtitle && <div className="page-sub">{subtitle}</div>}
        </div>
        <div className="page-actions">
          {children}
          <button className={`icon-btn mobile-only sync-icon sync-${sync.state}`} onClick={onSettings} aria-label={`Einstellungen · ${SYNC_LABEL[sync.state]}`}>
            <Icon name="settings" size={22} />
            <span className="sync-dot" aria-hidden="true" />
          </button>
        </div>
      </header>
    </>
  )
}

/** Fortschrittsring wie bei den Apple-Aktivitätsringen. */
export function ProgressRing({ pct, label }: { pct: number; label: string }) {
  const r = 15
  const c = 2 * Math.PI * r
  return (
    <div className="ring" title={label} aria-label={label}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r={r} className="ring-track" />
        <circle cx="20" cy="20" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} />
      </svg>
      <span>{pct}%</span>
    </div>
  )
}
