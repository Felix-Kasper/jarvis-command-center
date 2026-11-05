import type { ReactNode } from 'react'
import type { Task } from '../types'
import type { DayPlan } from '../lib/planner'
import { categoryColor } from '../lib/defaults'
import { fromMin } from '../lib/time'
import { Dot } from './ui'

/** „Jetzt“-Karte: was gerade dran ist, mit den zwei wichtigsten Aktionen, darunter das Nächste. */
export function NowNext({ plan, tasks, now, onStart, onDone, onOpen }: { plan: DayPlan; tasks: Task[]; now: Date; onStart: (t: Task) => void; onDone: (t: Task) => void; onOpen: (t: Task) => void }) {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const current = plan.blocks.find((b) => b.start <= nowMin && b.end > nowMin && b.type !== 'vergangen')
  const seen = new Set<string>()
  const upcoming = plan.blocks
    .filter((b) => b.type === 'task' && b.start >= nowMin - 1 && b !== current)
    .filter((b) => {
      if (!b.taskId || seen.has(b.taskId) || b.taskId === current?.taskId) return false
      seen.add(b.taskId)
      return true
    })
  const inProgress = tasks.find((t) => t.status === 'in_arbeit')

  let head: ReactNode
  if (current?.type === 'task' && current.taskId && byId.get(current.taskId)) {
    const t = byId.get(current.taskId)!
    head = (
      <div className="now">
        <span className="eyebrow">Jetzt · bis {fromMin(current.end)}</span>
        <button className="now-title" onClick={() => onOpen(t)}>
          {t.title}
        </button>
        <div className="row now-actions">
          <button className="primary" onClick={() => onDone(t)}>
            Erledigt
          </button>
          {t.status !== 'in_arbeit' && (
            <button className="secondary" onClick={() => onStart(t)}>
              Starten
            </button>
          )}
        </div>
      </div>
    )
  } else if (current) {
    head = (
      <div className="now">
        <span className="eyebrow">Jetzt · bis {fromMin(current.end)}</span>
        <div className="now-title static">{current.type === 'puffer' && current.label === 'Puffer' ? 'Frei' : current.label.split(' · ')[0]}</div>
        {inProgress && <p className="muted small">In Arbeit: {inProgress.title}</p>}
      </div>
    )
  } else {
    head = (
      <div className="now">
        <span className="eyebrow">Jetzt</span>
        <div className="now-title static">Nichts geplant</div>
      </div>
    )
  }

  return (
    <section className="card now-card">
      {head}
      {upcoming.length > 0 && (
        <ul className="next-list">
          {upcoming.slice(0, 3).map((b) => {
            const t = byId.get(b.taskId!)
            if (!t) return null
            return (
              <li key={b.taskId}>
                <span className="time">{fromMin(b.start)}</span>
                <button className="link-btn" onClick={() => onOpen(t)}>
                  <Dot color={categoryColor(t.category)} /> {t.title}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
