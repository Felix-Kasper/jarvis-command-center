import { useState } from 'react'
import type { Goal } from '../types'
import { Card } from './ui'

const EMPTY: Goal[] = [
  { text: '', done: false },
  { text: '', done: false },
  { text: '', done: false },
]

/** Wird per `key` pro Tag neu aufgebaut; übernimmt Änderungen von anderen Geräten. */
export function Goals({ goals, onChange, suggestion }: { goals?: Goal[]; onChange: (g: Goal[]) => void; suggestion?: Goal[] }) {
  const [draft, setDraft] = useState<Goal[]>(goals ?? EMPTY)
  const [prevGoals, setPrevGoals] = useState(goals)
  if (goals !== prevGoals) {
    setPrevGoals(goals)
    setDraft(goals ?? EMPTY)
  }

  const commit = (next: Goal[]) => {
    if (JSON.stringify(next) !== JSON.stringify(goals ?? EMPTY)) onChange(next)
  }

  const empty = draft.every((g) => !g.text.trim())
  const proposal = suggestion?.filter((g) => g.text.trim()) ?? []
  return (
    <Card
      title="Tagesziele"
      action={
        empty && proposal.length > 0 ? (
          <button className="link-btn small" onClick={() => onChange(suggestion!)} title={proposal.map((g) => g.text).join(' · ')}>
            Top {proposal.length} aus dem Plan
          </button>
        ) : undefined
      }
    >
      <ol className="goals">
        {draft.map((g, i) => (
          <li key={i} className={g.done ? 'done' : ''}>
            <input
              type="checkbox"
              checked={g.done}
              disabled={!g.text.trim()}
              aria-label={`Ziel ${i + 1} erledigt`}
              onChange={(e) => {
                const next = draft.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x))
                setDraft(next)
                commit(next)
              }}
            />
            <input
              className="goal-input"
              value={g.text}
              placeholder={['Wichtigstes Ergebnis heute', 'Zweites Ziel', 'Drittes Ziel'][i]}
              maxLength={120}
              onChange={(e) => setDraft(draft.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
              onBlur={() => commit(draft)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </li>
        ))}
      </ol>
    </Card>
  )
}
