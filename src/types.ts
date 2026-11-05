// Zentrale Datentypen von JARVIS.

export type Priority = 1 | 2 | 3 // 1 = hoch, 2 = mittel, 3 = niedrig
export type Energy = 'hoch' | 'mittel' | 'niedrig'
export type Status = 'offen' | 'in_arbeit' | 'erledigt'
export type DeadlineType = 'hart' | 'weich'

export interface Task {
  id: string
  title: string
  description?: string
  category: string
  priority: Priority
  durationMin: number
  deadline?: string // YYYY-MM-DD
  deadlineType: DeadlineType
  plannedDate?: string // YYYY-MM-DD, leer = Backlog
  fixedStart?: string // HH:MM, fester Zeitblock („Blocker“) am geplanten Tag
  status: Status
  energy: Energy
  dependsOn: string[]
  notes?: string
  createdAt: string // ISO
  completedAt?: string // ISO
}

export interface Goal {
  text: string
  done: boolean
}

export interface DayGoals {
  date: string
  goals: Goal[] // immer genau 3
}

/** Ausnahmen für einen einzelnen Tag (z. B. Wochenende freigegeben, länger arbeiten). */
export interface DayOverride {
  date: string
  weekendReleased?: boolean
  workEnd?: string // HH:MM, überschreibt Feierabend für diesen Tag
  closedAt?: string // ISO, Tagesabschluss
  closingNote?: string
  briefSeenAt?: string // ISO, Morgen-Briefing gelesen
}

export interface LeisureBlock {
  id: string
  title: string
  fromDate: string // YYYY-MM-DD
  toDate: string // YYYY-MM-DD
  start: string // HH:MM
  end: string // HH:MM
  weekdays?: number[] // wiederkehrend nur an diesen Tagen (0 = So … 6 = Sa); leer = jeden Tag im Zeitraum
  kind?: 'freizeit' | 'puffer' // puffer = Reserve: wird nur genutzt, wenn der Tag sonst überläuft
}

export interface Settings {
  wake: string
  workStart: string
  workEnd: string
  sleep: string
  lunchStart: string
  lunchEnd: string
  focusMaxMin: number // max. Minuten am Stück, dann Pause
  breakMin: number
  latestExtendedEnd: string // spätestes Arbeitsende, wenn ein Tag freigegeben wird
  weekendLocked: boolean
  categories: string[]
  leisureBlocks: LeisureBlock[]
}

export type RecordKind = 'task' | 'goals' | 'day' | 'settings'

/** Gespeicherte Einheit. Wird lokal gehalten und mit Supabase synchronisiert. */
export interface StoredRecord {
  id: string
  kind: RecordKind
  data: unknown
  updatedAt: string // ISO, vom Gerät gesetzt; entscheidet bei Konflikten (neueste gewinnt)
  deleted: boolean
}

export type SyncState = 'lokal' | 'abgemeldet' | 'synchronisiert' | 'synchronisiere' | 'offline' | 'fehler'

export interface SyncInfo {
  authReady?: boolean // Anmeldestatus geprüft (verhindert kurzes Aufblitzen der Anmeldeseite)
  state: SyncState
  lastSyncAt?: string
  message?: string
  email?: string
  pendingCount: number
}
