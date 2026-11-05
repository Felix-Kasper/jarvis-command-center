import type { Task } from '../types'
import type { FitResult, Suggestion } from '../lib/planner'
import { Modal } from './ui'

export function FitDialog({ task, result, onApply, onClose }: { task: Task; result: FitResult; onApply: (s: Suggestion) => void; onClose: () => void }) {
  const conflicts = result.issues.filter((i) => i.severity === 'konflikt')
  const hints = result.issues.filter((i) => i.severity === 'hinweis')
  const main = result.suggestions.filter((s) => s.kind !== 'keep' && s.kind !== 'backlog')
  const fallback = result.suggestions.filter((s) => s.kind === 'keep' || s.kind === 'backlog')
  return (
    <Modal title="Passt nicht ganz in den Plan" onClose={onClose}>
      <p className="muted">„{task.title}“</p>
      <ul className="issues">
        {conflicts.map((i, k) => (
          <li key={`c${k}`} className="issue konflikt">
            {i.message}
          </li>
        ))}
        {hints.map((i, k) => (
          <li key={`h${k}`} className="issue hinweis">
            {i.message}
          </li>
        ))}
      </ul>
      <div className="suggestions">
        {main.map((s, k) => (
          <button key={k} className={k === 0 ? 'primary' : 'secondary'} onClick={() => onApply(s)}>
            {s.label}
          </button>
        ))}
        {fallback.map((s, k) => (
          <button key={`f${k}`} className="ghost" onClick={() => onApply(s)}>
            {s.label}
          </button>
        ))}
        <button className="ghost" onClick={onClose}>
          Zurück zur Bearbeitung
        </button>
      </div>
    </Modal>
  )
}
