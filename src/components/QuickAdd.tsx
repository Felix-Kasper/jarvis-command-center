import { useState } from 'react'

/** Neue Aufgabe im Stil der Erinnerungen-App: eine Zeile, Kurzbefehle erst beim Tippen sichtbar. */
export function QuickAdd({ onQuick, onDetails }: { onQuick: (text: string) => void; onDetails: () => void }) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  return (
    <div className={`quickadd-wrap ${focused || text ? 'is-active' : ''}`}>
      <form
        className="quickadd"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          onQuick(text)
          setText('')
        }}
      >
        <span className="qa-plus" aria-hidden="true">
          +
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Neue Aufgabe"
          aria-label="Aufgabe schnell hinzufügen"
          enterKeyHint="done"
        />
        {text.trim() && (
          <button type="submit" className="primary qa-add">
            Hinzufügen
          </button>
        )}
        <button type="button" className="icon-btn qa-info" onClick={onDetails} aria-label="Details" title="Mit allen Details anlegen">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5.5M12 7.6v.01" strokeLinecap="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}
