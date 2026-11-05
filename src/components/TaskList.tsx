import { useState } from 'react'
import type { Task } from '../types'
import { categoryColor } from '../lib/defaults'
import { formatDateShort, formatDuration } from '../lib/time'
import { Card, Dot, Segmented } from './ui'

type View = 'backlog' | 'geplant' | 'erledigt'

export function TaskList({ tasks, categories, today, onOpen, onPlan, onSeed }: { tasks: Task[]; categories: string[]; today: string; onOpen: (t: Task) => void; onPlan: (t: Task) => void; onSeed?: () => void }) {
  const [view, setView] = useState<View>('backlog')
  const [cat, setCat] = useState<string>('')
  const [q, setQ] = useState('')

  const filtered = tasks
    .filter((t) => {
      if (view === 'erledigt') return t.status === 'erledigt'
      if (t.status === 'erledigt') return false
      return view === 'backlog' ? !t.plannedDate : !!t.plannedDate && t.plannedDate >= today
    })
    .filter((t) => !cat || t.category === cat)
    .filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      if (view === 'geplant') return (a.plannedDate ?? '') < (b.plannedDate ?? '') ? -1 : 1
      if (view === 'erledigt') return (a.completedAt ?? '') > (b.completedAt ?? '') ? -1 : 1
      return a.priority - b.priority
    })
    .slice(0, view === 'erledigt' ? 30 : 200)

  const used = categories.filter((c) => tasks.some((t) => t.category === c))

  return (
    <Card title="Alle Aufgaben">
      <Segmented<View>
        label="Ansicht"
        value={view}
        onChange={setView}
        options={[
          { value: 'backlog', label: `Backlog (${tasks.filter((t) => !t.plannedDate && t.status !== 'erledigt').length})` },
          { value: 'geplant', label: 'Geplant' },
          { value: 'erledigt', label: 'Erledigt' },
        ]}
      />
      <div className="list-tools">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen …" aria-label="Aufgaben durchsuchen" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Kategorie filtern">
          <option value="">Alle Kategorien</option>
          {used.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="empty">
          <p className="muted">{tasks.length === 0 ? 'Noch keine Aufgaben.' : 'Nichts gefunden.'}</p>
          {tasks.length === 0 && onSeed && (
            <button className="secondary" onClick={onSeed}>
              Startaufgaben aus deinen Zielen laden
            </button>
          )}
        </div>
      ) : (
        <ul className="checklist">
          {filtered.map((t) => (
            <li key={t.id}>
              <button className="task-line" onClick={() => onOpen(t)}>
                <span className="task-title">
                  <Dot color={categoryColor(t.category)} />
                  {t.title}
                </span>
                <span className="task-meta">
                  {formatDuration(t.durationMin)}
                  {t.plannedDate && <span className="badge">{formatDateShort(t.plannedDate)}</span>}
                  {t.fixedStart && t.plannedDate && <span className="badge">fest {t.fixedStart}</span>}
                  {t.deadline && <span className={`badge ${t.deadlineType === 'hart' ? 'badge-hard' : ''}`}>bis {formatDateShort(t.deadline)}</span>}
                </span>
              </button>
              {view === 'backlog' && (
                <button className="chip" onClick={() => onPlan(t)}>
                  Einplanen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
