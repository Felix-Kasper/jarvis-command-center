import { store } from './store'
import { backupFileName } from './backup'

/** Lädt eine JSON-Sicherung aller Daten herunter. */
export function downloadBackup() {
  const backup = store.exportBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
