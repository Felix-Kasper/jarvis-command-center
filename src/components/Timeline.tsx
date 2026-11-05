import { useState } from 'react'
import type { Task } from '../types'
import type { DayPlan, PlanBlock } from '../lib/planner'
import { categoryColor } from '../lib/defaults'
import { fromMin, formatDuration } from '../lib/time'

// Ein einziger Tagesplan im iOS-Listenstil: Zeit links, Abhaken direkt in der Zeile.
// Ersetzt die frühere Kombination aus „Checkliste“ und „Zeitplan“.

const HIDDEN: PlanBlock['type'][] = ['schlaf', 'vergangen', 'pause', 'routine']
const STATIC_COLOR: Partial<Record<PlanBlock['type'], string>> = {
  freizeit: 'var(--rest)',
  mittag: 'var(--ok)',
  feierabend: 'var(--rest)',
  wochenende: 'var(--rest)',
  puffer: 'var(--sep)',
}

interface Props {
  plan: DayPlan
  tasks: Task[]
  now: Date
  isToday: boolean
  onOpen: (t: Task) => void
  onToggle: (t: Task) => void
  onCloseDay: () => void
  closed: boolean
}

function Check({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  const done = task.status === 'erledigt'
  return (
    <button className={`tl-check ${done ? 'on' : ''}`} role="checkbox" aria-checked={done} aria-label={`${task.title} erledigt`} onClick={() => onToggle(task)}>
      {done && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      )}
    </button>
  )
}

export function Timeline({ plan, tasks, now, isToday, onOpen, onToggle, onCloseDay, closed }: Props) {
  const [showDone, setShowDone] = useState(false)
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  // Nur was ansteht: Vergangenes und allgemeine freie Lücken ausblenden (benannte Puffer wie „Restday“ bleiben)
  const rows = plan.blocks.filter((b) => !HIDDEN.includes(b.type) && !(b.type === 'puffer' && b.label === 'Puffer') && !(isToday && b.end <= nowMin && b.type !== 'task'))
  const placed = new Set(plan.blocks.filter((b) => b.taskId).map((b) => b.taskId!))
  const missing = new Map(plan.overflow.map((o) => [o.taskId, o.missingMin]))
  const open = plan.dayTasks.filter((t) => t.status !== 'erledigt')
  const unplaced = open.filter((t) => !placed.has(t.id) || missing.has(t.id))
  const done = plan.dayTasks.filter((t) => t.status === 'erledigt')
  const capacity = plan.locked ? null : `${formatDuration(Math.max(0, plan.freeMin - plan.plannedMin))} frei`

  return (
    <section className="card daylist">
      <div className="card-head">
        <h3>Tagesplan</h3>
        {capacity && <span className="muted small">{capacity}</span>}
      </div>
      <ol className="timeline">
        {rows.map((b, i) => {
          const t = b.taskId ? byId.get(b.taskId) : undefined
          const active = isToday && b.start <= nowMin && b.end > nowMin
          const color = t ? categoryColor(t.category) : (STATIC_COLOR[b.type] ?? 'var(--sep)')
          const isFree = b.type === 'puffer'
          return (
            <li key={`${b.start}-${b.type}-${i}`} className={`tl tl-${b.type} ${active ? 'tl-active' : ''} ${t?.status === 'erledigt' ? 'tl-done' : ''}`}>
              <span className="tl-time">{fromMin(b.start)}</span>
              <span className="tl-bar" style={{ background: color }} aria-hidden="true" />
              {t ? (
                <>
                  <Check task={t} onToggle={onToggle} />
                  <button className="tl-body" onClick={() => onOpen(t)}>
                    <span className="tl-label">
                      {t.title}
                      {b.part && <span className="muted"> · Teil {b.part.index}/{b.part.total}</span>}
                    </span>
                    <span className="tl-sub">
                      {fromMin(b.start)}–{fromMin(b.end)} · {t.category}
                      {t.fixedStart && ' · fester Block'}
                    </span>
                  </button>
                </>
              ) : (
                <div className="tl-body">
                  <span className="tl-label">{isFree && b.label === 'Puffer' ? 'Frei' : b.type === 'feierabend' ? 'Feierabend' : b.label}</span>
                  <span className="tl-sub">
                    {fromMin(b.start)}–{fromMin(b.end)}
                    {isFree ? ` · ${formatDuration(b.end - b.start)}` : ''}
                  </span>
                </div>
              )}
              {active && <span className="tl-now">Jetzt</span>}
            </li>
          )
        })}
      </ol>

      {unplaced.length > 0 && (
        <>
          <h4 className="list-sub">{plan.locked ? 'Offen' : 'Passt heute nicht'}</h4>
          <ul className="timeline">
            {unplaced.map((t) => (
              <li key={t.id} className="tl tl-task tl-unplaced">
                <span className="tl-time">–</span>
                <span className="tl-bar" style={{ background: categoryColor(t.category) }} aria-hidden="true" />
                <Check task={t} onToggle={onToggle} />
                <button className="tl-body" onClick={() => onOpen(t)}>
                  <span className="tl-label">{t.title}</span>
                  <span className="tl-sub">
                    {formatDuration(t.durationMin)}
                    {missing.has(t.id) && !plan.locked ? ` · ${missing.get(t.id)} min fehlen` : ''}
                    {plan.carriedIds.has(t.id) ? ' · von gestern' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {done.length > 0 && (
        <>
          <button className="list-sub list-toggle" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}>
            Erledigt ({done.length}) <span aria-hidden="true">{showDone ? '▴' : '▾'}</span>
          </button>
          {showDone && (
            <ul className="timeline">
              {done.map((t) => (
                <li key={t.id} className="tl tl-task tl-done">
                  <span className="tl-time">✓</span>
                  <span className="tl-bar" style={{ background: categoryColor(t.category) }} aria-hidden="true" />
                  <Check task={t} onToggle={onToggle} />
                  <button className="tl-body" onClick={() => onOpen(t)}>
                    <span className="tl-label">{t.title}</span>
                    <span className="tl-sub">{formatDuration(t.durationMin)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {plan.dayTasks.length > 0 && plan.locked !== 'vergangen' && (
        <div className="daylist-foot">
          <button className="link-btn" onClick={onCloseDay}>
            {closed ? 'Tagesabschluss ansehen' : 'Tag abschließen'}
          </button>
        </div>
      )}
    </section>
  )
}
