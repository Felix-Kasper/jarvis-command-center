import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import type { Task } from './types'
import { store, useAppState } from './lib/store'
import { buildDayPlan, checkFit, defaultPlannedDate, findFreeDate, upcomingDeadlines, type FitResult, type PlanContext, type Suggestion } from './lib/planner'
import { parseQuickAdd } from './lib/quickadd'
import { makeStarterTasks } from './lib/seed'
import { newId } from './lib/validate'
import { addDays, formatDateLong, formatDateShort, relativeDay, toDateStr } from './lib/time'
import { BACKUP_REMINDER_DAYS, daysSinceBackup, suggestGoals } from './lib/brief'
import { useNow } from './hooks/useNow'
import { Nav, PageHeader, ProgressRing, type View } from './components/Header'
import { DayBanner } from './components/DayBanner'
import { Goals } from './components/Goals'
import { NowNext } from './components/NowNext'
import { Timeline } from './components/Timeline'
import { Deadlines } from './components/Deadlines'
import { TaskList } from './components/TaskList'
import { QuickAdd } from './components/QuickAdd'
import { FitDialog } from './components/FitDialog'
import { DayClose } from './components/DayClose'
import { downloadBackup } from './lib/download'
import { useAgentsWorking } from './lib/useAgentsWorking'
import { Modal, Toast, type ToastMsg } from './components/ui'
import { LoginGate } from './components/LoginGate'
import { isDemo, syncConfigured } from './lib/supabase'
import { DemoBanner } from './components/DemoBanner'

// Selten gebrauchte Bereiche erst bei Bedarf laden – die App startet so schneller (v. a. am iPhone)
const TaskForm = lazy(() => import('./components/TaskForm').then((m) => ({ default: m.TaskForm })))
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then((m) => ({
    default: m.SettingsPanel,
  })),
)
const AgentsView = lazy(() => import('./components/AgentsView').then((m) => ({ default: m.AgentsView })))
const Briefing = lazy(() => import('./components/Briefing').then((m) => ({ default: m.Briefing })))

const VIEW_KEY = 'jarvis:v1:view'
const VIEWS: View[] = ['heute', 'briefing', 'bewerbungen', 'agenten']
function initialView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.includes(v as View) ? (v as View) : 'heute' // alter Wert „planer“ → Heute
  } catch {
    return 'heute'
  }
}

const SCHEDULE_FIELDS: (keyof Task)[] = ['plannedDate', 'durationMin', 'deadline', 'deadlineType', 'dependsOn', 'status', 'priority']

export default function App() {
  const state = useAppState()
  const now = useNow()
  const today = toDateStr(now)
  const [pickedDate, setPickedDate] = useState(today)
  const [followToday, setFollowToday] = useState(true)
  // Folgt automatisch dem aktuellen Tag (z. B. nach Mitternacht), solange „heute“ gewählt ist
  const date = followToday ? today : pickedDate
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null)
  const [fit, setFit] = useState<{
    task: Task
    result: FitResult
    newCategory?: string
  } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [showTasks, setShowTasks] = useState(false)
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const [view, setView] = useState<View>(initialView)
  const agentsStatus = useAgentsWorking(!!state.sync.email)
  const changeView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignorieren */
    }
  }

  const ctx: PlanContext = useMemo(() => ({ settings: state.settings, overrides: state.days }), [state.settings, state.days])
  const plan = useMemo(() => buildDayPlan(date, state.tasks, ctx, now), [date, state.tasks, ctx, now])
  const deadlines = useMemo(() => upcomingDeadlines(state.tasks, ctx, now), [state.tasks, ctx, now])
  // Vorschläge für Aufgaben, die nicht in den Tag passen – nacheinander berechnet,
  // damit sich die Vorschläge nicht gegenseitig überbuchen
  const overflow = useMemo(() => {
    const from = plan.locked === 'feierabend' ? addDays(today, 1) : addDays(date, 1)
    const result: { task: Task; missingMin: number; suggestion?: string }[] = []
    let working = state.tasks
    for (const o of plan.overflow) {
      const task = state.tasks.find((t) => t.id === o.taskId)
      if (!task) continue
      const hard = task.deadline && task.deadlineType === 'hart' ? task.deadline : undefined
      const suggestion = findFreeDate(task, working, ctx, now, from, hard)
      if (suggestion) working = working.map((x) => (x.id === task.id ? { ...x, plannedDate: suggestion } : x))
      result.push({ task, missingMin: o.missingMin, suggestion })
    }
    return result
  }, [plan, state.tasks, ctx, now, date, today])

  const notify = useCallback((text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo }), [])
  const clearToast = useCallback(() => setToast(null), [])

  const changeDate = (d: string) => {
    setPickedDate(d)
    setFollowToday(d === today)
  }

  const persist = (task: Task, newCategory?: string, msg = 'Gespeichert.') => {
    if (newCategory && !state.settings.categories.includes(newCategory)) {
      store.setSettings({
        ...state.settings,
        categories: [...state.settings.categories, newCategory],
      })
    }
    store.saveTask(task)
    setEditing(null)
    setFit(null)
    notify(msg)
  }

  /** Speichern mit Konfliktprüfung. Prüft nur, wenn sich planungsrelevante Felder geändert haben. */
  const submit = (task: Task, newCategory?: string) => {
    const prev = state.tasks.find((t) => t.id === task.id)
    const relevant = !prev || SCHEDULE_FIELDS.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(task[k]))
    if (!relevant) return persist(task, newCategory)
    const result = checkFit(task, state.tasks, ctx, now)
    if (result.ok) return persist(task, newCategory, task.plannedDate ? `Eingeplant: ${formatDateShort(task.plannedDate)}` : 'Im Backlog gespeichert.')
    setFit({ task, result, newCategory })
  }

  const applySuggestion = (s: Suggestion) => {
    if (!fit) return
    const t = fit.task
    switch (s.kind) {
      case 'move':
        if (s.taskId === t.id) persist({ ...t, plannedDate: s.date }, fit.newCategory, `Eingeplant: ${formatDateShort(s.date)}`)
        else {
          const other = state.tasks.find((x) => x.id === s.taskId)
          if (other) store.saveTask({ ...other, plannedDate: s.date })
          persist(t, fit.newCategory, s.label)
        }
        break
      case 'release_weekend':
        store.setDay(s.date, { weekendReleased: true })
        persist(t, fit.newCategory, 'Wochenende freigegeben und eingeplant.')
        break
      case 'extend_day':
        store.setDay(s.date, { workEnd: s.workEnd })
        persist(t, fit.newCategory, `Arbeitszeit bis ${s.workEnd} freigegeben.`)
        break
      case 'backlog':
        persist({ ...t, plannedDate: undefined }, fit.newCategory, 'Im Backlog gespeichert.')
        break
      case 'keep':
        persist(t, fit.newCategory, 'Übernommen (mit Konflikt).')
        break
    }
  }

  const blankTask = (): Task => ({
    id: newId(),
    title: '',
    category: 'Persönliches',
    priority: 2,
    durationMin: 30,
    deadlineType: 'weich',
    plannedDate: date >= today ? (date === today ? defaultPlannedDate(ctx, now) : date) : defaultPlannedDate(ctx, now),
    status: 'offen',
    energy: 'mittel',
    dependsOn: [],
    createdAt: new Date().toISOString(),
  })

  const quickAdd = (text: string) => {
    const p = parseQuickAdd(text, state.settings.categories, today)
    if (!p.title) return
    const base = blankTask()
    const task: Task = {
      ...base,
      title: p.title.slice(0, 140),
      durationMin: p.durationMin && p.durationMin >= 5 && p.durationMin <= 720 ? p.durationMin : base.durationMin,
      category: p.category ?? base.category,
      priority: p.priority ?? base.priority,
      plannedDate: p.plannedDate === null ? undefined : (p.plannedDate ?? base.plannedDate),
    }
    submit(task)
  }

  const toggle = (t: Task) => {
    if (t.status === 'erledigt') {
      store.saveTask({ ...t, status: 'offen', completedAt: undefined })
      return
    }
    const done: Task = {
      ...t,
      status: 'erledigt',
      completedAt: new Date().toISOString(),
      plannedDate: t.plannedDate && t.plannedDate < today ? today : t.plannedDate,
    }
    store.saveTask(done)
    notify(`Erledigt: ${t.title}`, () => store.saveTask(t))
  }

  const remove = (t: Task) => {
    const original = state.tasks.find((x) => x.id === t.id)
    store.deleteTask(t.id)
    setEditing(null)
    notify('Aufgabe gelöscht.', original ? () => store.saveTask(original) : undefined)
  }

  const planFromBacklog = (t: Task) =>
    submit({
      ...t,
      plannedDate: findFreeDate(t, state.tasks, ctx, now, today, t.deadline && t.deadlineType === 'hart' ? t.deadline : undefined) ?? defaultPlannedDate(ctx, now),
    })

  const seed = () => {
    store.saveTasks(makeStarterTasks(ctx, now))
    notify('Startaufgaben geladen. Passe sie gern an.')
  }

  const doneCount = plan.dayTasks.filter((t) => t.status === 'erledigt').length
  const goals = state.goals[date]?.goals
  const goalsDone = (goals ?? []).filter((g) => g.text.trim() && g.done).length
  const totalMin = plan.dayTasks.reduce((s, t) => s + t.durationMin, 0)
  const doneMin = plan.dayTasks.filter((t) => t.status === 'erledigt').reduce((s, t) => s + t.durationMin, 0)
  const pct = totalMin ? Math.round((doneMin / totalMin) * 100) : 0
  const goalsEmpty = !goals || goals.every((g) => !g.text.trim())
  const backupAge = daysSinceBackup(state.lastExport, today)
  const needsBackup = state.tasks.length > 0 && (backupAge === null || backupAge >= BACKUP_REMINDER_DAYS)
  const rel = relativeDay(date, today)
  const dayTitle = date === today ? 'Heute' : rel === 'morgen' ? 'Morgen' : rel === 'gestern' ? 'Gestern' : formatDateLong(date).split(',')[0]
  const backlogCount = state.tasks.filter((t) => !t.plannedDate && t.status !== 'erledigt').length
  const signedIn = !!state.sync.email
  const header = (title: string, subtitle?: React.ReactNode, actions?: React.ReactNode) => (
    <PageHeader title={title} subtitle={subtitle} onSettings={() => setShowSettings(true)} sync={state.sync}>
      {actions}
    </PageHeader>
  )

  // Ohne Anmeldung nichts zeigen (auch keine lokal gespeicherten Daten)
  if (syncConfigured && !state.sync.email) return state.sync.authReady ? <LoginGate /> : <div className="gate" aria-busy="true" />

  return (
    <div className="shell">
      <Nav view={view} onView={changeView} sync={state.sync} onSettings={() => setShowSettings(true)} agentsWorking={agentsStatus.working} readyCount={agentsStatus.ready} />

      <main className="page">
        {isDemo && <DemoBanner />}
        <div className="view-anim" key={view}>
          {!state.storageOk && <div className="banner banner-danger standalone">Speichern im Browser ist blockiert (privater Modus?). Änderungen gehen beim Schließen verloren.</div>}

          {view === 'heute' && (
            <>
              {header(
                dayTitle,
                <span className="date-nav">
                  <button className="icon-btn" onClick={() => changeDate(addDays(date, -1))} aria-label="Vorheriger Tag">
                    ‹
                  </button>
                  <span className="date-label">{formatDateLong(date)}</span>
                  <button className="icon-btn" onClick={() => changeDate(addDays(date, 1))} aria-label="Nächster Tag">
                    ›
                  </button>
                  {date !== today && (
                    <button className="pill" onClick={() => changeDate(today)}>
                      Heute
                    </button>
                  )}
                </span>,
                plan.dayTasks.length > 0 ? <ProgressRing pct={pct} label={`${doneCount}/${plan.dayTasks.length} Aufgaben erledigt · ${goalsDone}/3 Tagesziele`} /> : undefined,
              )}

              <DayBanner
                plan={plan}
                today={today}
                now={now}
                settings={state.settings}
                weekendReleased={!!state.days[date]?.weekendReleased}
                overflow={overflow}
                onExtend={(workEnd) => store.setDay(date, { workEnd })}
                onWeekend={(released) => store.setDay(date, { weekendReleased: released })}
                onMove={(task, d) => {
                  store.saveTask({ ...task, plannedDate: d })
                  notify(`„${task.title}“ → ${formatDateShort(d)}`, () => store.saveTask(task))
                }}
                onMoveAll={(moves) => {
                  const originals = moves.map((m) => m.task)
                  store.saveTasks(moves.map((m) => ({ ...m.task, plannedDate: m.date })))
                  notify(`${moves.length} Aufgaben neu eingeplant.`, () => store.saveTasks(originals))
                }}
              />

              <div className="today">
                {signedIn && (
                  <div className="area-brief">
                    <Suspense fallback={null}>
                      <Briefing
                        variant="teaser"
                        signedIn={signedIn}
                        now={now}
                        today={today}
                        settings={state.settings}
                        notify={notify}
                        onOpenAgents={() => changeView('agenten')}
                        onOpen={() => changeView('briefing')}
                      />
                    </Suspense>
                  </div>
                )}
                <div className="area-plan">
                  <QuickAdd onQuick={quickAdd} onDetails={() => setEditing({ task: blankTask(), isNew: true })} />
                  <Timeline
                    plan={plan}
                    tasks={state.tasks}
                    now={now}
                    isToday={date === today}
                    onOpen={(t) => setEditing({ task: t, isNew: false })}
                    onToggle={toggle}
                    onCloseDay={() => setShowClose(true)}
                    closed={!!state.days[date]?.closedAt}
                  />
                </div>
                <div className="today-side">
                  {date === today && (
                    <div className="area-now">
                      <NowNext
                        plan={plan}
                        tasks={state.tasks}
                        now={now}
                        onOpen={(t) => setEditing({ task: t, isNew: false })}
                        onDone={toggle}
                        onStart={(t) => store.saveTask({ ...t, status: 'in_arbeit' })}
                      />
                    </div>
                  )}
                  <div className="area-goals">
                    <Goals key={date} goals={goals} onChange={(g) => store.setGoals(date, g)} suggestion={goalsEmpty ? suggestGoals(plan) : undefined} />
                  </div>
                  {deadlines.length > 0 && (
                    <div className="area-dl">
                      <Deadlines entries={deadlines} onOpen={(t) => setEditing({ task: t, isNew: false })} />
                    </div>
                  )}
                  <div className="area-tasks">
                    <button className="card row-link" onClick={() => setShowTasks(true)}>
                      <span>Alle Aufgaben</span>
                      <span className="muted">{backlogCount > 0 ? `${backlogCount} im Backlog` : ''}</span>
                      <span className="chev" aria-hidden="true">
                        ›
                      </span>
                    </button>
                    {needsBackup && (
                      <button
                        className="card row-link row-quiet"
                        onClick={() => {
                          downloadBackup()
                          notify('Backup heruntergeladen.')
                        }}
                      >
                        <span>Backup sichern</span>
                        <span className="muted">{backupAge === null ? 'noch nie' : `vor ${backupAge} Tagen`}</span>
                        <span className="chev" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {view === 'briefing' && (
            <>
              {header('Briefing')}
              {signedIn ? (
                <Suspense fallback={<p className="muted">Lade …</p>}>
                  <Briefing variant="full" signedIn={signedIn} now={now} today={today} settings={state.settings} notify={notify} onOpenAgents={() => changeView('agenten')} />
                </Suspense>
              ) : (
                <p className="muted">Bitte anmelden (Einstellungen).</p>
              )}
            </>
          )}

          {(view === 'bewerbungen' || view === 'agenten') && (
            <>
              {header(view === 'bewerbungen' ? 'Bewerbungen' : 'Agenten')}
              <Suspense fallback={<p className="muted">Lade …</p>}>
                <AgentsView mode={view} signedIn={signedIn} now={now} onOpenInbox={() => changeView('bewerbungen')} onOpenPlanner={() => changeView('briefing')} onChanged={agentsStatus.refresh} />
              </Suspense>
            </>
          )}
        </div>
      </main>

      <Suspense fallback={null}>
        {editing && (
          <TaskForm
            key={editing.task.id}
            task={editing.task}
            isNew={editing.isNew}
            allTasks={state.tasks}
            categories={state.settings.categories}
            today={today}
            onSave={submit}
            onDelete={remove}
            onClose={() => setEditing(null)}
          />
        )}
        {showTasks && (
          <Modal title="Aufgaben" onClose={() => setShowTasks(false)} wide>
            <TaskList tasks={state.tasks} categories={state.settings.categories} today={today} onOpen={(t) => setEditing({ task: t, isNew: false })} onPlan={planFromBacklog} onSeed={seed} />
          </Modal>
        )}
        {fit && <FitDialog task={fit.task} result={fit.result} onApply={applySuggestion} onClose={() => setFit(null)} />}
        {showSettings && <SettingsPanel state={state} today={today} onClose={() => setShowSettings(false)} notify={notify} />}
      </Suspense>
      {showClose && (
        <DayClose
          plan={plan}
          tasks={state.tasks}
          goals={goals}
          day={state.days[date]}
          ctx={ctx}
          now={now}
          onCancel={() => setShowClose(false)}
          onMoveAll={(moves) => {
            store.saveTasks(moves.map((m) => ({ ...m.task, plannedDate: m.date })))
            notify(`${moves.length} Aufgaben neu eingeplant.`)
          }}
          onClose={(note) => {
            store.setDay(date, {
              closedAt: new Date().toISOString(),
              closingNote: note.trim() || undefined,
            })
            setShowClose(false)
            notify('Tag abgeschlossen. Gute Erholung!')
          }}
        />
      )}
      <Toast toast={toast} onDone={clearToast} />
    </div>
  )
}
