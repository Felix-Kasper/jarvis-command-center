import type { Task } from '../types'
import type { DeadlineEntry } from '../lib/planner'
import { categoryColor } from '../lib/defaults'
import { formatDateShort } from '../lib/time'
import { Card, Dot } from './ui'

export function Deadlines({ entries, onOpen }: { entries: DeadlineEntry[]; onOpen: (t: Task) => void }) {
  if (entries.length === 0) return null
  return (
    <Card title="Fristen">
      {(
        <ul className="deadlines">
          {entries.slice(0, 5).map(({ task, daysLeft, risk }) => (
            <li key={task.id}>
              <button className="task-line" onClick={() => onOpen(task)}>
                <span className="task-title">
                  <Dot color={categoryColor(task.category)} />
                  {task.title}
                </span>
                <span className="task-meta">
                  <span className={`badge ${task.deadlineType === 'hart' ? 'badge-hard' : ''}`}>
                    {formatDateShort(task.deadline!)} · {daysLeft < 0 ? `${-daysLeft} T überfällig` : daysLeft === 0 ? 'heute' : `${daysLeft} T`}
                  </span>
                  {task.deadlineType === 'hart' && <span className="muted small">hart</span>}
                  {risk && <span className="badge badge-danger">{risk}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
