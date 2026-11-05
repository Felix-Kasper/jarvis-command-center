import type { ReactNode } from 'react'
import type { Settings, Task } from '../types'
import type { DayPlan } from '../lib/planner'
import { fromMin, formatDateShort, toMin } from '../lib/time'

interface Props {
  plan: DayPlan
  today: string
  now: Date
  settings: Settings
  weekendReleased: boolean
  overflow: { task: Task; missingMin: number; suggestion?: string }[]
  onExtend: (workEnd: string | undefined) => void
  onWeekend: (released: boolean) => void
  onMove: (task: Task, date: string) => void
  onMoveAll: (moves: { task: Task; date: string }[]) => void
}

export function DayBanner({ plan, now, settings, weekendReleased, overflow, onExtend, onWeekend, onMove, onMoveAll }: Props) {
  const items: ReactNode[] = []
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const latest = settings.latestExtendedEnd

  if (plan.locked === 'feierabend') {
    items.push(
      <div className="banner banner-rest" key="fa">
        <div>
          <strong>Feierabend seit {fromMin(plan.workEnd)}.</strong>
        </div>
        {nowMin < toMin(latest) - 30 && (
          <button className="secondary" onClick={() => onExtend(latest)}>
            Bis {latest} verlängern
          </button>
        )}
      </div>,
    )
  } else if (plan.extended) {
    items.push(
      <div className="banner banner-warn" key="ext">
        <div>
          <strong>Ausnahme:</strong> Arbeit bis {fromMin(plan.workEnd)}
        </div>
        <button className="ghost" onClick={() => onExtend(undefined)}>
          Zurücknehmen
        </button>
      </div>,
    )
  }

  if (plan.locked === 'wochenende') {
    items.push(
      <div className="banner banner-rest" key="we">
        <div>
          <strong>Wochenende – frei.</strong>
        </div>
        <button className="ghost" onClick={() => onWeekend(true)}>
          Für Arbeit freigeben
        </button>
      </div>,
    )
  } else if (weekendReleased) {
    items.push(
      <div className="banner banner-warn" key="wer">
        <div>
          <strong>Wochenende freigegeben.</strong>
        </div>
        <button className="ghost" onClick={() => onWeekend(false)}>
          Wieder sperren
        </button>
      </div>,
    )
  }

  if (plan.locked === 'vergangen') {
    items.push(
      <div className="banner" key="past">
        Vergangener Tag – nur Rückblick.
      </div>,
    )
  }

  if (overflow.length && plan.locked !== 'vergangen') {
    const minutes = overflow.reduce((s, o) => s + o.missingMin, 0)
    const movable = overflow.filter((o): o is typeof o & { suggestion: string } => !!o.suggestion)
    const rest = plan.locked === 'feierabend' || plan.locked === 'wochenende'
    items.push(
      <div className={`banner ${rest ? 'banner-warn banner-list' : 'banner-danger'}`} key="ov">
        <div className="banner-title">
          <span>
            {rest ? (
              <>
                <strong>Offen geblieben:</strong> {overflow.length} {overflow.length === 1 ? 'Aufgabe' : 'Aufgaben'}
              </>
            ) : (
              <>
                <strong>{minutes} min zu viel</strong>
              </>
            )}
          </span>
          {movable.length > 1 && (
            <button className="secondary small-btn" onClick={() => onMoveAll(movable.map((m) => ({ task: m.task, date: m.suggestion })))}>
              Alle übernehmen
            </button>
          )}
        </div>
        <ul className="overflow-list">
          {overflow.map((o) => (
            <li key={o.task.id}>
              <span>
                {o.task.title}
                {o.task.deadline && o.task.deadlineType === 'hart' && <span className="badge badge-hard">Deadline {formatDateShort(o.task.deadline)}</span>}
              </span>
              {o.suggestion ? (
                <button className="chip" onClick={() => onMove(o.task, o.suggestion!)}>
                  → {formatDateShort(o.suggestion)}
                </button>
              ) : (
                <span className="muted small">kein freier Tag</span>
              )}
            </li>
          ))}
        </ul>
      </div>,
    )
  }

  if (!items.length) return null
  return <div className="banners">{items}</div>
}
