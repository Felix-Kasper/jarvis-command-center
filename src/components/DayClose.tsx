import { useMemo, useState } from 'react'
import type { DayOverride, Goal, Task } from '../types'
import { findFreeDate, type DayPlan, type PlanContext } from '../lib/planner'
import { addDays, formatDateShort } from '../lib/time'
import { Modal } from './ui'

interface Props {
  plan: DayPlan
  tasks: Task[]
  goals?: Goal[]
  day?: DayOverride
  ctx: PlanContext
  now: Date
  onMoveAll: (moves: { task: Task; date: string }[]) => void
  onClose: (note: string) => void
  onCancel: () => void
}

export function DayClose({ plan, tasks, goals, day, ctx, now, onMoveAll, onClose, onCancel }: Props) {
  const [note, setNote] = useState(day?.closingNote ?? '')
  const done = plan.dayTasks.filter((t) => t.status === 'erledigt')
  const open = plan.dayTasks.filter((t) => t.status !== 'erledigt')
  const goalsDone = (goals ?? []).filter((g) => g.text && g.done).length

  // Vorschläge nacheinander berechnen, damit sich die Aufgaben nicht gegenseitig verdrängen
  const moves = useMemo(() => {
    let working = tasks
    const out: { task: Task; date?: string }[] = []
    for (const t of open) {
      const hard = t.deadline && t.deadlineType === 'hart' ? t.deadline : undefined
      const date = findFreeDate(t, working, ctx, now, addDays(plan.date, 1), hard)
      out.push({ task: t, date })
      if (date) working = working.map((x) => (x.id === t.id ? { ...x, plannedDate: date } : x))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.date, tasks])

  return (
    <Modal title={`Tagesabschluss · ${formatDateShort(plan.date)}`} onClose={onCancel}>
      <div className="stats">
        <div>
          <strong>{done.length}</strong>
          <span className="muted small">erledigt</span>
        </div>
        <div>
          <strong>{open.length}</strong>
          <span className="muted small">offen</span>
        </div>
        <div>
          <strong>{goalsDone}/3</strong>
          <span className="muted small">Tagesziele</span>
        </div>
      </div>

      {open.length > 0 && (
        <>
          <h4>Offene Aufgaben – Vorschlag</h4>
          <ul className="overflow-list">
            {moves.map((m) => (
              <li key={m.task.id}>
                <span>{m.task.title}</span>
                <span className={m.date ? 'muted small' : 'badge badge-danger'}>{m.date ? `→ ${formatDateShort(m.date)}` : 'kein Platz vor der Deadline'}</span>
              </li>
            ))}
          </ul>
          <button
            className="secondary"
            disabled={!moves.some((m) => m.date)}
            onClick={() => onMoveAll(moves.filter((m): m is { task: Task; date: string } => !!m.date))}
          >
            Vorschläge übernehmen
          </button>
        </>
      )}

      <label className="field">
        <span>Notiz zum Tag (optional)</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Was lief gut? Was nehme ich mit?" />
      </label>
      <div className="form-actions">
        <span className="spacer" />
        <button className="ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <button className="primary" onClick={() => onClose(note)}>
          Tag abschließen
        </button>
      </div>
    </Modal>
  )
}
