import { useState, type FormEvent } from 'react'
import type { Energy, Priority, Status, Task } from '../types'
import { validateTask, type TaskErrors } from '../lib/validate'
import { addDays } from '../lib/time'
import { Modal, Segmented } from './ui'

interface Props {
  task: Task
  isNew: boolean
  allTasks: Task[]
  categories: string[]
  today: string
  onSave: (t: Task, newCategory?: string) => void
  onDelete?: (t: Task) => void
  onClose: () => void
}

const NEW_CAT = '__neu__'

export function TaskForm({ task, isNew, allTasks, categories, today, onSave, onDelete, onClose }: Props) {
  const [t, setT] = useState<Task>(task)
  const [errors, setErrors] = useState<TaskErrors>({})
  const [newCat, setNewCat] = useState('')
  const [catMode, setCatMode] = useState<'list' | 'new'>(categories.includes(task.category) ? 'list' : 'new')
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((prev) => ({ ...prev, [k]: v }))

  const candidates = allTasks.filter((x) => x.id !== t.id && x.status !== 'erledigt')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const category = catMode === 'new' ? newCat.trim() || t.category : t.category
    const cleaned: Task = {
      ...t,
      title: t.title.trim(),
      category,
      description: t.description?.trim() || undefined,
      notes: t.notes?.trim() || undefined,
      deadline: t.deadline || undefined,
      plannedDate: t.plannedDate || undefined,
      fixedStart: t.fixedStart || undefined,
      completedAt: t.status === 'erledigt' ? (t.completedAt ?? new Date().toISOString()) : undefined,
    }
    const errs = validateTask(cleaned, allTasks)
    setErrors(errs)
    if (Object.keys(errs).length) return
    onSave(cleaned, catMode === 'new' && !categories.includes(category) ? category : undefined)
  }

  return (
    <Modal title={isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'} onClose={onClose} wide>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Titel</span>
          <input data-autofocus value={t.title} onChange={(e) => set('title', e.target.value)} placeholder="Was ist zu tun?" maxLength={140} />
          {errors.title && <em className="error">{errors.title}</em>}
        </label>

        <label className="field">
          <span>Beschreibung</span>
          <textarea rows={2} value={t.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="grid-2">
          <label className="field">
            <span>Kategorie</span>
            {catMode === 'list' ? (
              <select
                value={t.category}
                onChange={(e) => {
                  if (e.target.value === NEW_CAT) setCatMode('new')
                  else set('category', e.target.value)
                }}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={NEW_CAT}>+ Neue Kategorie …</option>
              </select>
            ) : (
              <div className="row">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Name der Kategorie" maxLength={40} />
                <button type="button" className="ghost" onClick={() => setCatMode('list')}>
                  Liste
                </button>
              </div>
            )}
            {errors.category && <em className="error">{errors.category}</em>}
          </label>

          <div className="field">
            <span>Priorität</span>
            <Segmented<Priority>
              label="Priorität"
              value={t.priority}
              onChange={(v) => set('priority', v)}
              options={[
                { value: 1, label: 'Hoch' },
                { value: 2, label: 'Mittel' },
                { value: 3, label: 'Niedrig' },
              ]}
            />
          </div>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Dauer (Minuten)</span>
            <input type="number" inputMode="numeric" min={5} max={720} step={5} value={t.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />
            <div className="chips">
              {[15, 30, 60, 90, 120].map((m) => (
                <button type="button" key={m} className={`chip ${t.durationMin === m ? 'active' : ''}`} onClick={() => set('durationMin', m)}>
                  {m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5')}
                </button>
              ))}
            </div>
            {errors.durationMin && <em className="error">{errors.durationMin}</em>}
          </label>

          <div className="field">
            <span>Energiebedarf</span>
            <Segmented<Energy>
              label="Energiebedarf"
              value={t.energy}
              onChange={(v) => set('energy', v)}
              options={[
                { value: 'hoch', label: 'Hoch' },
                { value: 'mittel', label: 'Mittel' },
                { value: 'niedrig', label: 'Niedrig' },
              ]}
            />
          </div>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Geplant für</span>
            <input type="date" value={t.plannedDate ?? ''} onChange={(e) => set('plannedDate', e.target.value || undefined)} />
            <div className="chips">
              <button type="button" className="chip" onClick={() => set('plannedDate', today)}>
                Heute
              </button>
              <button type="button" className="chip" onClick={() => set('plannedDate', addDays(today, 1))}>
                Morgen
              </button>
              <button type="button" className={`chip ${!t.plannedDate ? 'active' : ''}`} onClick={() => setT((prev) => ({ ...prev, plannedDate: undefined, fixedStart: undefined }))}>
                Backlog
              </button>
            </div>
            {errors.plannedDate && <em className="error">{errors.plannedDate}</em>}
          </label>

          <div className="field">
            <span>Deadline</span>
            <div className="row">
              <input type="date" value={t.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || undefined)} />
              {t.deadline && (
                <button type="button" className="ghost" onClick={() => set('deadline', undefined)} aria-label="Deadline entfernen">
                  ✕
                </button>
              )}
            </div>
            <Segmented<'hart' | 'weich'>
              label="Art der Deadline"
              value={t.deadlineType}
              onChange={(v) => set('deadlineType', v)}
              options={[
                { value: 'weich', label: 'Weich' },
                { value: 'hart', label: 'Hart (nie verschieben)' },
              ]}
            />
            {errors.deadline && <em className="error">{errors.deadline}</em>}
          </div>
        </div>

        <div className="grid-2">
          <div className="field">
            <span>Feste Uhrzeit (optional)</span>
            <div className="row">
              <input
                type="time"
                step={300}
                value={t.fixedStart ?? ''}
                onChange={(e) => set('fixedStart', e.target.value ? e.target.value.slice(0, 5) : undefined)}
                aria-label="Feste Uhrzeit"
              />
              {t.fixedStart && (
                <button type="button" className="ghost" onClick={() => set('fixedStart', undefined)} aria-label="Feste Uhrzeit entfernen">
                  ✕
                </button>
              )}
            </div>
            {errors.fixedStart && <em className="error">{errors.fixedStart}</em>}
          </div>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Status</span>
            <select value={t.status} onChange={(e) => set('status', e.target.value as Status)}>
              <option value="offen">Offen</option>
              <option value="in_arbeit">In Arbeit</option>
              <option value="erledigt">Erledigt</option>
            </select>
          </label>

          <label className="field">
            <span>Hängt ab von</span>
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value
                if (id && !t.dependsOn.includes(id)) set('dependsOn', [...t.dependsOn, id])
              }}
            >
              <option value="">{candidates.length ? 'Aufgabe auswählen …' : 'Keine offenen Aufgaben'}</option>
              {candidates
                .filter((c) => !t.dependsOn.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
            {t.dependsOn.length > 0 && (
              <div className="chips">
                {t.dependsOn.map((id) => {
                  const dep = allTasks.find((x) => x.id === id)
                  return (
                    <button type="button" key={id} className="chip active" onClick={() => set('dependsOn', t.dependsOn.filter((d) => d !== id))} title="Entfernen">
                      {dep?.title ?? 'Gelöschte Aufgabe'} ✕
                    </button>
                  )
                })}
              </div>
            )}
            {errors.dependsOn && <em className="error">{errors.dependsOn}</em>}
          </label>
        </div>

        <label className="field">
          <span>Notizen</span>
          <textarea rows={2} value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>

        <div className="form-actions">
          {!isNew && onDelete && (
            <button type="button" className="danger-ghost" onClick={() => onDelete(t)}>
              Löschen
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary">
            Speichern
          </button>
        </div>
      </form>
    </Modal>
  )
}
